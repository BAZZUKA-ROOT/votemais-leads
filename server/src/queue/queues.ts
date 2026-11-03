import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env.js';
import { newRedisConnection } from './connection.js';

export const QUEUES = {
  plan: 'plan',
  search: 'search',
  process: 'process',
  analyze: 'analyze',
  message: 'message',
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobPayloads {
  plan: { trigger: 'schedule' | 'manual'; userId?: string | null; categoryIds?: number[]; states?: string[]; maxQueries?: number; campaignId?: number | null };
  search: { queryId: string; jobId: string };
  process: { resultId: string; jobId: string | null };
  analyze: { leadId: string; jobId?: string | null; enrich?: boolean };
  message: { leadId: string; kind: 'initial' | 'followup'; followUpId?: string | null };
  maintenance: { task: 'refresh' | 'retention' | 'resume' | 'followups_due' | 'sync_schedules' };
}

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 3 * 24 * 3600, count: 5000 },
  removeOnFail: { age: 14 * 24 * 3600 },
};

const instances = new Map<string, Queue>();

export function getQueue<N extends QueueName>(name: N): Queue<JobPayloads[N]> {
  let q = instances.get(name);
  if (!q) {
    q = new Queue(name, { connection: newRedisConnection(), prefix: env.QUEUE_PREFIX, defaultJobOptions });
    instances.set(name, q);
  }
  return q as Queue<JobPayloads[N]>;
}

export async function enqueue<N extends QueueName>(name: N, data: JobPayloads[N], opts?: JobsOptions) {
  return getQueue(name).add(name as never, data as never, opts);
}

export async function closeQueues() {
  await Promise.all([...instances.values()].map((q) => q.close()));
  instances.clear();
}

export const ALL_QUEUES = Object.values(QUEUES);
