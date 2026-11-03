import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../api/plugins.js';
import { controlStats, dashboardStats, reportStats, usageStats } from '../services/stats.js';

const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async () => dashboardStats());
  app.get('/api/reports', async (req) => {
    const today = new Date().toISOString().slice(0, 10);
    const ago = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const q = parse(z.object({ from: d.default(ago), to: d.default(today) }), req.query);
    return reportStats(q.from, q.to);
  });
  app.get('/api/usage', async (req) => {
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
    return usageStats(q.days);
  });
  app.get('/api/control', async () => controlStats());
}
