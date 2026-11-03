import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { automationSettings, type AutomationSettings } from '../db/schema.js';

export async function getSettings(): Promise<AutomationSettings> {
  const [row] = await db.select().from(automationSettings).where(eq(automationSettings.id, 1));
  if (row) return row;
  const [created] = await db.insert(automationSettings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(automationSettings).where(eq(automationSettings.id, 1));
  return again!;
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const settingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    paused: z.boolean(),
    timezone: z.string().min(3).max(64),
    runTimes: z.array(hhmm).min(1).max(12),
    daysOfWeek: z.array(int(0, 6)).min(1).max(7),
    concurrency: int(1, 20),
    queriesPerRun: int(1, 500),
    resultsPerQuery: int(1, 50),
    statesPerRun: int(1, 27),
    categoriesPerRun: int(1, 50),
    dailyLeadLimit: int(1, 2000),
    dailyQualifiedTarget: int(1, 2000),
    minQualifiedScore: int(0, 100),
    enrichmentMinScore: int(0, 100),
    maxFollowupDepth: int(0, 5),
    queryCacheDays: int(0, 90),
    autoGenerateMessages: z.boolean(),
    refreshEnabled: z.boolean(),
    refreshIntervalDays: int(1, 365),
    refreshBatchSize: int(1, 500),
    followUpDefaultDays: int(1, 60),
    dataRetentionDays: int(30, 3650),
    logRetentionDays: int(7, 3650),
    searchConnectorOrder: z.array(z.string().max(32)).max(10),
  })
  .partial()
  .strict();

export async function updateSettings(input: z.infer<typeof settingsUpdateSchema>) {
  await getSettings();
  const patch = { ...input };
  if (patch.timezone) {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: patch.timezone });
    } catch {
      throw new Error('Fuso horário inválido');
    }
  }
  if (patch.daysOfWeek) patch.daysOfWeek = [...new Set(patch.daysOfWeek)].sort();
  if (patch.runTimes) patch.runTimes = [...new Set(patch.runTimes)].sort();
  const [row] = await db.update(automationSettings).set(patch).where(eq(automationSettings.id, 1)).returning();
  return row!;
}
