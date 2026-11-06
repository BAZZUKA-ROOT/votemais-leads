import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () =>
  ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- enums ----------
export const userRole = pgEnum('user_role', ['admin', 'operator']);
export const organizerType = pgEnum('organizer_type', [
  'empresa',
  'prefeitura',
  'associacao',
  'produtora',
  'sindicato_rural',
  'midia',
  'pessoa',
  'desconhecido',
]);
export const factStatus = pgEnum('fact_status', ['confirmed', 'unconfirmed', 'not_found', 'denied']);
export const eventStatus = pgEnum('event_status', ['scheduled', 'ongoing', 'past', 'cancelled', 'unknown']);
export const contactType = pgEnum('contact_type', [
  'whatsapp',
  'phone',
  'email',
  'instagram',
  'website',
  'facebook',
]);
export const leadStage = pgEnum('lead_stage', [
  'novo',
  'qualificado',
  'aguardando_contato',
  'contatado',
  'aguardando_resposta',
  'interessado',
  'negociacao',
  'cliente',
  'sem_interesse',
]);
export const leadPotential = pgEnum('lead_potential', ['alta', 'media', 'baixa']);
export const qualificationStatus = pgEnum('qualification_status', [
  'pending_analysis',
  'qualified',
  'disqualified',
  'analysis_failed',
]);
export const searchJobType = pgEnum('search_job_type', ['scheduled', 'manual', 'followup', 'refresh']);
export const searchJobStatus = pgEnum('search_job_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export const searchQueryStatus = pgEnum('search_query_status', [
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
  'cancelled',
]);
export const searchQueryOrigin = pgEnum('search_query_origin', ['template', 'ai_followup', 'refresh', 'manual']);
export const searchResultStatus = pgEnum('search_result_status', [
  'new',
  'irrelevant',
  'awaiting_ai',
  'processing',
  'processed',
  'duplicate',
  'discarded',
  'failed',
  'blocked',
  'cancelled',
]);
export const sourceType = pgEnum('source_type', [
  'search_result',
  'event_site',
  'government',
  'news',
  'instagram_search',
  'directory',
  'ticketing',
  'other',
]);
export const analysisType = pgEnum('analysis_type', ['extraction', 'classification', 'refresh']);
export const messageChannel = pgEnum('message_channel', ['whatsapp', 'email', 'instagram']);
export const messageKind = pgEnum('message_kind', ['initial', 'followup']);
export const messageStatus = pgEnum('message_status', ['draft', 'opened', 'sent', 'discarded']);
export const replyOutcome = pgEnum('reply_outcome', ['positive', 'neutral', 'negative']);
export const historyType = pgEnum('history_type', [
  'created',
  'stage_change',
  'whatsapp_opened',
  'instagram_opened',
  'email_opened',
  'website_opened',
  'contact_made',
  'note',
  'message_generated',
  'edited',
  'followup_created',
  'followup_done',
  'analysis',
  'suppressed',
  'reply_received',
]);
export const followUpStatus = pgEnum('follow_up_status', ['pending', 'done', 'cancelled']);
export const integrationKind = pgEnum('integration_kind', ['search', 'ai', 'enrichment', 'automation']);
export const integrationStatus = pgEnum('integration_status', ['not_configured', 'configured', 'connected', 'error']);
export const logLevel = pgEnum('log_level', ['debug', 'info', 'warn', 'error', 'audit']);
export const suppressionType = pgEnum('suppression_type', ['phone', 'email', 'instagram', 'domain']);

// ---------- auth ----------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('admin'),
  isActive: boolean('is_active').notNull().default(true),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: ts('locked_until'),
  lastLoginAt: ts('last_login_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256(token)
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  expiresAt: ts('expires_at').notNull(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)]);

// ---------- catálogo ----------
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  group: text('group').notNull(),
  description: text('description'),
  keywords: text('keywords').array().notNull().default(sql`'{}'::text[]`),
  negativeKeywords: text('negative_keywords').array().notNull().default(sql`'{}'::text[]`),
  priority: smallint('priority').notNull().default(5),
  // meses (1–12) em que os eventos acontecem; vazio = o ano todo
  seasonMonths: smallint('season_months').array().notNull().default(sql`'{}'::smallint[]`),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('categories_slug_uq').on(t.slug)]);

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  categoryIds: integer('category_ids').array().notNull().default(sql`'{}'::int[]`),
  states: text('states').array().notNull().default(sql`'{}'::text[]`),
  isActive: boolean('is_active').notNull().default(true),
  startsAt: date('starts_at'),
  endsAt: date('ends_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------- domínio ----------
export const organizers = pgTable('organizers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  companyName: text('company_name'),
  personName: text('person_name'),
  type: organizerType('type').notNull().default('desconhecido'),
  city: text('city'),
  state: text('state'),
  website: text('website'),
  websiteDomain: text('website_domain'),
  instagramHandle: text('instagram_handle'),
  isRecurring: boolean('is_recurring').notNull().default(false),
  eventsCount: integer('events_count').notNull().default(0),
  notes: text('notes'),
  fieldSources: jsonb('field_sources').$type<Record<string, string>>().notNull().default({}),
  lastVerifiedAt: ts('last_verified_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('organizers_instagram_uq').on(t.instagramHandle).where(sql`${t.instagramHandle} is not null`),
  uniqueIndex('organizers_domain_uq').on(t.websiteDomain).where(sql`${t.websiteDomain} is not null`),
  index('organizers_name_state_idx').on(t.normalizedName, t.state),
]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizerId: uuid('organizer_id').references(() => organizers.id, { onDelete: 'set null' }),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  edition: text('edition'),
  year: smallint('year'),
  city: text('city'),
  state: text('state'),
  region: text('region'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  status: eventStatus('status').notNull().default('unknown'),
  registrationOpen: factStatus('registration_open').notNull().default('not_found'),
  hasContest: factStatus('has_contest').notNull().default('unconfirmed'),
  hasParticipants: factStatus('has_participants').notNull().default('not_found'),
  hasPopularVoting: factStatus('has_popular_voting').notNull().default('not_found'),
  votingEvidence: text('voting_evidence'),
  currentVotingMethod: text('current_voting_method'),
  description: text('description'),
  website: text('website'),
  instagramHandle: text('instagram_handle'),
  fingerprint: text('fingerprint').notNull(),
  fieldSources: jsonb('field_sources').$type<Record<string, string>>().notNull().default({}),
  siteAvailable: boolean('site_available'),
  lastVerifiedAt: ts('last_verified_at'),
  previousEditionId: uuid('previous_edition_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('events_fingerprint_uq').on(t.fingerprint),
  index('events_organizer_idx').on(t.organizerId),
  index('events_state_idx').on(t.state),
  index('events_category_idx').on(t.categoryId),
  index('events_start_idx').on(t.startDate),
  check('events_year_ck', sql`${t.year} is null or (${t.year} between 1990 and 2100)`),
]);

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  organizerId: uuid('organizer_id').references(() => organizers.id, { onDelete: 'cascade' }),
  type: contactType('type').notNull(),
  value: text('value').notNull(),
  normalizedValue: text('normalized_value').notNull(),
  label: text('label'),
  isCommercial: boolean('is_commercial').notNull().default(true),
  sourceUrl: text('source_url').notNull(),
  sourceExcerpt: text('source_excerpt'),
  confidence: smallint('confidence').notNull().default(50),
  isValid: boolean('is_valid').notNull().default(true),
  lastVerifiedAt: ts('last_verified_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('contacts_event_uq').on(t.eventId, t.type, t.normalizedValue).where(sql`${t.eventId} is not null`),
  index('contacts_organizer_idx').on(t.organizerId),
  index('contacts_norm_idx').on(t.type, t.normalizedValue),
  check('contacts_owner_ck', sql`${t.eventId} is not null or ${t.organizerId} is not null`),
]);

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  organizerId: uuid('organizer_id').references(() => organizers.id, { onDelete: 'set null' }),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  stage: leadStage('stage').notNull().default('novo'),
  stagePosition: integer('stage_position').notNull().default(0),
  qualification: qualificationStatus('qualification').notNull().default('pending_analysis'),
  score: smallint('score'),
  potential: leadPotential('potential'),
  votingProbability: smallint('voting_probability'),
  dataQuality: smallint('data_quality'),
  justification: text('justification'),
  primaryWhatsapp: text('primary_whatsapp'),
  primaryPhone: text('primary_phone'),
  primaryEmail: text('primary_email'),
  primaryInstagram: text('primary_instagram'),
  primaryWebsite: text('primary_website'),
  city: text('city'),
  state: text('state'),
  region: text('region'),
  eventDate: date('event_date'),
  isSuppressed: boolean('is_suppressed').notNull().default(false),
  notes: text('notes'),
  discoveredAt: ts('discovered_at').notNull().defaultNow(),
  stageChangedAt: ts('stage_changed_at').notNull().defaultNow(),
  lastContactAt: ts('last_contact_at'),
  nextFollowUpAt: ts('next_follow_up_at'),
  enrichedAt: ts('enriched_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('leads_event_uq').on(t.eventId),
  index('leads_stage_idx').on(t.stage, t.stagePosition),
  index('leads_state_idx').on(t.state),
  index('leads_score_idx').on(t.score),
  index('leads_discovered_idx').on(t.discoveredAt),
  index('leads_category_idx').on(t.categoryId),
  index('leads_event_date_idx').on(t.eventDate),
  check('leads_score_ck', sql`${t.score} is null or (${t.score} between 0 and 100)`),
]);

// ---------- pesquisa ----------
export const searchJobs = pgTable('search_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: searchJobType('type').notNull(),
  status: searchJobStatus('status').notNull().default('queued'),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  campaignId: integer('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  contextEventId: uuid('context_event_id').references(() => events.id, { onDelete: 'set null' }),
  triggeredBy: uuid('triggered_by').references(() => users.id, { onDelete: 'set null' }),
  totalQueries: integer('total_queries').notNull().default(0),
  completedQueries: integer('completed_queries').notNull().default(0),
  failedQueries: integer('failed_queries').notNull().default(0),
  resultsFound: integer('results_found').notNull().default(0),
  leadsCreated: integer('leads_created').notNull().default(0),
  duplicates: integer('duplicates').notNull().default(0),
  discarded: integer('discarded').notNull().default(0),
  error: text('error'),
  heartbeatAt: ts('heartbeat_at'),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
  createdAt: createdAt(),
}, (t) => [index('search_jobs_status_idx').on(t.status, t.createdAt)]);

export const searchQueries = pgTable('search_queries', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => searchJobs.id, { onDelete: 'cascade' }),
  parentQueryId: uuid('parent_query_id'),
  query: text('query').notNull(),
  queryHash: text('query_hash').notNull(),
  connector: text('connector'),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  state: text('state'),
  city: text('city'),
  depth: smallint('depth').notNull().default(0),
  origin: searchQueryOrigin('origin').notNull().default('template'),
  status: searchQueryStatus('status').notNull().default('pending'),
  attempts: smallint('attempts').notNull().default(0),
  resultsCount: integer('results_count').notNull().default(0),
  newResultsCount: integer('new_results_count').notNull().default(0),
  durationMs: integer('duration_ms'),
  error: text('error'),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
  createdAt: createdAt(),
}, (t) => [
  index('search_queries_job_idx').on(t.jobId, t.status),
  index('search_queries_hash_idx').on(t.queryHash, t.finishedAt),
]);

export const searchResults = pgTable('search_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  queryId: uuid('query_id').references(() => searchQueries.id, { onDelete: 'set null' }),
  jobId: uuid('job_id').references(() => searchJobs.id, { onDelete: 'set null' }),
  connector: text('connector').notNull(),
  url: text('url').notNull(),
  urlHash: text('url_hash').notNull(),
  domain: text('domain').notNull(),
  title: text('title').notNull().default(''),
  snippet: text('snippet').notNull().default(''),
  position: smallint('position'),
  relevanceScore: smallint('relevance_score'),
  status: searchResultStatus('status').notNull().default('new'),
  discardReason: text('discard_reason'),
  contextEventId: uuid('context_event_id').references(() => events.id, { onDelete: 'set null' }),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  attempts: smallint('attempts').notNull().default(0),
  error: text('error'),
  processedAt: ts('processed_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('search_results_url_uq').on(t.urlHash),
  index('search_results_status_idx').on(t.status, t.createdAt),
  index('search_results_job_idx').on(t.jobId),
]);

export const leadSources = pgTable('lead_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  searchResultId: uuid('search_result_id').references(() => searchResults.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  domain: text('domain').notNull(),
  title: text('title'),
  type: sourceType('type').notNull().default('other'),
  excerpt: text('excerpt'),
  httpStatus: smallint('http_status'),
  contentHash: text('content_hash'),
  fetchedAt: ts('fetched_at'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('lead_sources_event_url_uq').on(t.eventId, t.url)]);

// ---------- IA ----------
export const aiAnalyses = pgTable('ai_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  searchResultId: uuid('search_result_id').references(() => searchResults.id, { onDelete: 'set null' }),
  type: analysisType('type').notNull(),
  model: text('model').notNull(),
  score: smallint('score'),
  potential: leadPotential('potential'),
  votingProbability: smallint('voting_probability'),
  dataQuality: smallint('data_quality'),
  justification: text('justification'),
  checklist: jsonb('checklist').$type<Array<{ item: string; status: string; evidence?: string | null }>>(),
  facts: jsonb('facts').$type<string[]>(),
  hypotheses: jsonb('hypotheses').$type<string[]>(),
  output: jsonb('output').$type<unknown>(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
  createdAt: createdAt(),
}, (t) => [index('ai_analyses_lead_idx').on(t.leadId, t.createdAt)]);

export const generatedMessages = pgTable('generated_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  channel: messageChannel('channel').notNull().default('whatsapp'),
  kind: messageKind('kind').notNull().default('initial'),
  approach: text('approach'),
  content: text('content').notNull(),
  editedContent: text('edited_content'),
  status: messageStatus('status').notNull().default('draft'),
  model: text('model'),
  openedAt: ts('opened_at'),
  sentAt: ts('sent_at'),
  replyOutcome: replyOutcome('reply_outcome'),
  repliedAt: ts('replied_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('generated_messages_lead_idx').on(t.leadId, t.createdAt)]);

// ---------- CRM ----------
export const contactHistory = pgTable('contact_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  type: historyType('type').notNull(),
  fromStage: leadStage('from_stage'),
  toStage: leadStage('to_stage'),
  channel: messageChannel('channel'),
  content: text('content'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}, (t) => [index('contact_history_lead_idx').on(t.leadId, t.createdAt)]);

export const followUps = pgTable('follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  dueAt: ts('due_at').notNull(),
  title: text('title').notNull(),
  notes: text('notes'),
  suggestedMessage: text('suggested_message'),
  status: followUpStatus('status').notNull().default('pending'),
  completedAt: ts('completed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('follow_ups_due_idx').on(t.status, t.dueAt), index('follow_ups_lead_idx').on(t.leadId)]);

// ---------- operação ----------
export const automationSettings = pgTable('automation_settings', {
  id: smallint('id').primaryKey().default(1),
  enabled: boolean('enabled').notNull().default(true),
  paused: boolean('paused').notNull().default(false),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  runTimes: text('run_times').array().notNull().default(sql`'{06:00,13:00}'::text[]`),
  daysOfWeek: smallint('days_of_week').array().notNull().default(sql`'{1,2,3,4,5,6}'::smallint[]`),
  concurrency: smallint('concurrency').notNull().default(3),
  queriesPerRun: smallint('queries_per_run').notNull().default(30),
  resultsPerQuery: smallint('results_per_query').notNull().default(10),
  statesPerRun: smallint('states_per_run').notNull().default(3),
  categoriesPerRun: smallint('categories_per_run').notNull().default(4),
  dailyLeadLimit: smallint('daily_lead_limit').notNull().default(50),
  dailyQualifiedTarget: smallint('daily_qualified_target').notNull().default(20),
  minQualifiedScore: smallint('min_qualified_score').notNull().default(60),
  enrichmentMinScore: smallint('enrichment_min_score').notNull().default(70),
  maxFollowupDepth: smallint('max_followup_depth').notNull().default(2),
  queryCacheDays: smallint('query_cache_days').notNull().default(7),
  autoGenerateMessages: boolean('auto_generate_messages').notNull().default(true),
  refreshEnabled: boolean('refresh_enabled').notNull().default(true),
  refreshIntervalDays: smallint('refresh_interval_days').notNull().default(14),
  refreshBatchSize: smallint('refresh_batch_size').notNull().default(40),
  followUpDefaultDays: smallint('follow_up_default_days').notNull().default(3),
  dataRetentionDays: smallint('data_retention_days').notNull().default(365),
  logRetentionDays: smallint('log_retention_days').notNull().default(90),
  searchConnectorOrder: text('search_connector_order').array().notNull().default(sql`'{}'::text[]`),
  stateCursor: integer('state_cursor').notNull().default(0),
  categoryCursor: integer('category_cursor').notNull().default(0),
  updatedAt: updatedAt(),
}, (t) => [check('automation_singleton_ck', sql`${t.id} = 1`)]);

export const integrations = pgTable('integrations', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(),
  kind: integrationKind('kind').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  encryptedCredentials: text('encrypted_credentials'),
  credentialHint: text('credential_hint'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  status: integrationStatus('status').notNull().default('not_configured'),
  lastCheckedAt: ts('last_checked_at'),
  lastError: text('last_error'),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('integrations_provider_uq').on(t.provider)]);

export const apiUsage = pgTable('api_usage', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  provider: text('provider').notNull(),
  operation: text('operation').notNull(),
  model: text('model'),
  units: integer('units').notNull().default(1),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  success: boolean('success').notNull(),
  durationMs: integer('duration_ms'),
  jobId: uuid('job_id'),
  error: text('error'),
  createdAt: createdAt(),
}, (t) => [index('api_usage_provider_idx').on(t.provider, t.createdAt), index('api_usage_created_idx').on(t.createdAt)]);

export const systemLogs = pgTable('system_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  level: logLevel('level').notNull(),
  scope: text('scope').notNull(),
  message: text('message').notNull(),
  context: jsonb('context').$type<Record<string, unknown>>(),
  userId: uuid('user_id'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('system_logs_created_idx').on(t.createdAt), index('system_logs_level_idx').on(t.level, t.createdAt)]);

export const suppressionList = pgTable('suppression_list', {
  id: serial('id').primaryKey(),
  type: suppressionType('type').notNull(),
  value: text('value').notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('suppression_uq').on(t.type, t.value)]);

export type LeadStage = (typeof leadStage.enumValues)[number];
export type FactStatus = (typeof factStatus.enumValues)[number];
export type ContactType = (typeof contactType.enumValues)[number];
export type Lead = typeof leads.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Organizer = typeof organizers.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type AutomationSettings = typeof automationSettings.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type SearchResult = typeof searchResults.$inferSelect;
export type SearchQuery = typeof searchQueries.$inferSelect;
