import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { env } from '../config/env.js';
import { log } from '../lib/logger.js';
import { redis } from '../queue/connection.js';
import { authRoutes } from '../routes/auth.js';
import { catalogRoutes } from '../routes/catalog.js';
import { crmRoutes } from '../routes/crm.js';
import { dashboardRoutes } from '../routes/dashboard.js';
import { leadRoutes } from '../routes/leads.js';
import { operationsRoutes } from '../routes/operations.js';
import { authHook, errorHandler } from './plugins.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: log,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_000_000,
    disableRequestLogging: env.NODE_ENV === 'test',
  });
  app.decorateRequest('auth', null);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    redis: redis(),
    nameSpace: 'vml:rl:',
    skipOnError: true,
  });
  app.setErrorHandler(errorHandler);
  app.addHook('onRequest', authHook);

  app.get('/api/health', async () => ({ ok: true, at: new Date().toISOString() }));
  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(leadRoutes);
  await app.register(crmRoutes);
  await app.register(catalogRoutes);
  await app.register(operationsRoutes);
  return app;
}
