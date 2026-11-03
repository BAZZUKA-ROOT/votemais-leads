import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idParam, parse, userId } from '../api/plugins.js';
import { leadStage } from '../db/schema.js';
import { audit } from '../lib/logger.js';
import { badRequest } from '../lib/errors.js';
import { isAiReady } from '../ai/client.js';
import { IntegrationUnavailableError } from '../lib/errors.js';
import { enqueue } from '../queue/queues.js';
import { analyzeLead, generateMessage } from '../services/analysis.js';
import {
  addContact,
  addNote,
  changeStage,
  contactInputSchema,
  deleteLeads,
  exportLeads,
  getLeadDetail,
  leadFiltersSchema,
  leadUpdateSchema,
  listLeads,
  openChannel,
  pipelineBoard,
  registerContact,
  removeContact,
  toCsv,
  updateLead,
} from '../services/leads.js';
import { eraseLead } from '../services/privacy.js';

const stageSchema = z.enum(leadStage.enumValues);

export async function leadRoutes(app: FastifyInstance) {
  app.get('/api/leads', async (req) => listLeads(parse(leadFiltersSchema, req.query)));

  app.get('/api/leads/export.csv', async (req, reply) => {
    const f = parse(leadFiltersSchema, req.query);
    const rows = await exportLeads(f);
    await audit('Exportação CSV de leads', { count: rows.length }, { userId: userId(req), ip: req.ip });
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="votemais-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    return toCsv(rows);
  });

  app.get('/api/leads/:id', async (req) => getLeadDetail(parse(idParam, req.params).id));

  app.patch('/api/leads/:id', async (req) => updateLead(parse(idParam, req.params).id, parse(leadUpdateSchema, req.body), userId(req)));

  app.post('/api/leads/:id/stage', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ stage: stageSchema, note: z.string().max(2000).nullable().optional(), position: z.number().int().min(0).optional() }), req.body);
    await changeStage(id, body.stage, userId(req), { note: body.note ?? null, position: body.position });
    return { ok: true };
  });

  app.post('/api/leads/:id/notes', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ content: z.string().min(1).max(5000) }), req.body);
    return addNote(id, body.content, userId(req));
  });

  app.post('/api/leads/:id/contacts', async (req) => {
    const { id } = parse(idParam, req.params);
    await addContact(id, parse(contactInputSchema, req.body), userId(req));
    return { ok: true };
  });

  app.delete('/api/leads/:id/contacts/:contactId', async (req) => {
    const p = parse(z.object({ id: z.string().uuid(), contactId: z.string().uuid() }), req.params);
    await removeContact(p.id, p.contactId, userId(req));
    return { ok: true };
  });

  app.post('/api/leads/:id/open', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        channel: z.enum(['whatsapp', 'instagram', 'email', 'website']),
        messageId: z.string().uuid().nullable().optional(),
        text: z.string().max(4000).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
      }),
      req.body,
    );
    return openChannel(id, body, userId(req));
  });

  app.post('/api/leads/:id/contact-made', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        channel: z.enum(['whatsapp', 'email', 'instagram']).default('whatsapp'),
        at: z.string().datetime({ offset: true }).nullable().optional(),
        note: z.string().max(2000).nullable().optional(),
        messageId: z.string().uuid().nullable().optional(),
      }),
      req.body ?? {},
    );
    await registerContact(id, body, userId(req));
    return { ok: true };
  });

  app.post('/api/leads/:id/messages', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ kind: z.enum(['initial', 'followup']).default('initial') }), req.body ?? {});
    if (!(await isAiReady())) throw new IntegrationUnavailableError('anthropic', 'Configure a integração de IA (Anthropic) para gerar mensagens.');
    return generateMessage(id, body.kind);
  });

  app.post('/api/leads/:id/analyze', async (req) => {
    const { id } = parse(idParam, req.params);
    if (!(await isAiReady())) throw new IntegrationUnavailableError('anthropic', 'Configure a integração de IA (Anthropic) para analisar leads.');
    return analyzeLead(id);
  });

  app.delete('/api/leads/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const q = parse(z.object({ suppress: z.enum(['true', 'false']).default('false') }), req.query);
    const res = await eraseLead(id, { suppress: q.suppress === 'true', userId: userId(req) });
    await audit('Lead excluído', { leadId: id, suppress: q.suppress }, { userId: userId(req), ip: req.ip });
    return res;
  });

  app.post('/api/leads/bulk', async (req) => {
    const body = parse(
      z.object({ ids: z.array(z.string().uuid()).min(1).max(500), action: z.enum(['stage', 'delete', 'analyze']), stage: stageSchema.optional() }),
      req.body,
    );
    if (body.action === 'delete') {
      const n = await deleteLeads(body.ids);
      await audit('Exclusão em lote de leads', { count: n }, { userId: userId(req), ip: req.ip });
      return { affected: n };
    }
    if (body.action === 'analyze') {
      if (!(await isAiReady())) throw new IntegrationUnavailableError('anthropic');
      for (const id of body.ids) await enqueue('analyze', { leadId: id }, { deduplication: { id: `analyze-${id}` } });
      return { affected: body.ids.length };
    }
    if (!body.stage) throw badRequest('Informe o estágio');
    for (const id of body.ids) await changeStage(id, body.stage, userId(req));
    return { affected: body.ids.length };
  });

  app.get('/api/pipeline', async (req) => {
    const f = parse(leadFiltersSchema.partial(), req.query);
    return pipelineBoard(f);
  });
}
