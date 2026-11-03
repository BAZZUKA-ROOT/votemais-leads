import { getQueue } from '../queue/queues.js';
import { syslog } from '../lib/logger.js';
import { getSettings } from './settings.js';

const MAINTENANCE: Array<{ id: string; pattern: string; task: 'refresh' | 'retention' | 'resume' | 'followups_due' }> = [
  { id: 'maint-refresh', pattern: '10 3 * * *', task: 'refresh' },
  { id: 'maint-retention', pattern: '20 4 * * *', task: 'retention' },
  { id: 'maint-resume', pattern: '*/10 * * * *', task: 'resume' },
  { id: 'maint-followups', pattern: '*/30 * * * *', task: 'followups_due' },
];

export function cronFor(time: string, days: number[]): string {
  const [h, m] = time.split(':').map(Number);
  return `${m} ${h} * * ${[...days].sort().join(',')}`;
}

/** Sincroniza agendamentos do BullMQ com as configurações de automação. */
export async function syncSchedules() {
  const s = await getSettings();
  const plan = getQueue('plan');
  const desired = new Map<string, string>();
  if (s.enabled) for (const t of s.runTimes) desired.set(`plan-${t.replace(':', '')}`, cronFor(t, s.daysOfWeek));
  const existing = await plan.getJobSchedulers(0, -1);
  for (const e of existing) if (e.key && !desired.has(e.key)) await plan.removeJobScheduler(e.key);
  for (const [id, pattern] of desired) {
    await plan.upsertJobScheduler(id, { pattern, tz: s.timezone }, { name: 'plan', data: { trigger: 'schedule' } });
  }
  const maint = getQueue('maintenance');
  for (const m of MAINTENANCE) {
    await maint.upsertJobScheduler(m.id, { pattern: m.pattern, tz: s.timezone }, { name: 'maintenance', data: { task: m.task } });
  }
  await syslog('info', 'scheduler', 'Agendamentos sincronizados', { runs: [...desired.values()], tz: s.timezone });
  return [...desired.entries()].map(([id, pattern]) => ({ id, pattern }));
}

export async function listSchedules() {
  const plan = await getQueue('plan').getJobSchedulers(0, -1);
  const maint = await getQueue('maintenance').getJobSchedulers(0, -1);
  return [...plan, ...maint].map((j) => ({ id: j.key, pattern: j.pattern ?? null, tz: j.tz ?? null, next: j.next ? new Date(j.next).toISOString() : null }));
}
