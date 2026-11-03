CREATE TYPE "public"."analysis_type" AS ENUM('extraction', 'classification', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('whatsapp', 'phone', 'email', 'instagram', 'website', 'facebook');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('scheduled', 'ongoing', 'past', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fact_status" AS ENUM('confirmed', 'unconfirmed', 'not_found', 'denied');--> statement-breakpoint
CREATE TYPE "public"."follow_up_status" AS ENUM('pending', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."history_type" AS ENUM('created', 'stage_change', 'whatsapp_opened', 'instagram_opened', 'email_opened', 'website_opened', 'contact_made', 'note', 'message_generated', 'edited', 'followup_created', 'followup_done', 'analysis', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('search', 'ai', 'enrichment', 'automation');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('not_configured', 'configured', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."lead_potential" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('novo', 'qualificado', 'aguardando_contato', 'contatado', 'aguardando_resposta', 'interessado', 'negociacao', 'cliente', 'sem_interesse');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error', 'audit');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('whatsapp', 'email', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('initial', 'followup');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('draft', 'opened', 'sent', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."organizer_type" AS ENUM('empresa', 'prefeitura', 'associacao', 'produtora', 'sindicato_rural', 'midia', 'pessoa', 'desconhecido');--> statement-breakpoint
CREATE TYPE "public"."qualification_status" AS ENUM('pending_analysis', 'qualified', 'disqualified', 'analysis_failed');--> statement-breakpoint
CREATE TYPE "public"."search_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."search_job_type" AS ENUM('scheduled', 'manual', 'followup', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."search_query_origin" AS ENUM('template', 'ai_followup', 'refresh', 'manual');--> statement-breakpoint
CREATE TYPE "public"."search_query_status" AS ENUM('pending', 'running', 'done', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."search_result_status" AS ENUM('new', 'irrelevant', 'awaiting_ai', 'processing', 'processed', 'duplicate', 'discarded', 'failed', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('search_result', 'event_site', 'government', 'news', 'instagram_search', 'directory', 'ticketing', 'other');--> statement-breakpoint
CREATE TYPE "public"."suppression_type" AS ENUM('phone', 'email', 'instagram', 'domain');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'operator');--> statement-breakpoint
CREATE TABLE "ai_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"event_id" uuid,
	"search_result_id" uuid,
	"type" "analysis_type" NOT NULL,
	"model" text NOT NULL,
	"score" smallint,
	"potential" "lead_potential",
	"voting_probability" smallint,
	"data_quality" smallint,
	"justification" text,
	"checklist" jsonb,
	"facts" jsonb,
	"hypotheses" jsonb,
	"output" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"model" text,
	"units" integer DEFAULT 1 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"success" boolean NOT NULL,
	"duration_ms" integer,
	"job_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"run_times" text[] DEFAULT '{06:00,13:00}'::text[] NOT NULL,
	"days_of_week" smallint[] DEFAULT '{1,2,3,4,5,6}'::smallint[] NOT NULL,
	"concurrency" smallint DEFAULT 3 NOT NULL,
	"queries_per_run" smallint DEFAULT 30 NOT NULL,
	"results_per_query" smallint DEFAULT 10 NOT NULL,
	"states_per_run" smallint DEFAULT 3 NOT NULL,
	"categories_per_run" smallint DEFAULT 4 NOT NULL,
	"daily_lead_limit" smallint DEFAULT 50 NOT NULL,
	"daily_qualified_target" smallint DEFAULT 20 NOT NULL,
	"min_qualified_score" smallint DEFAULT 60 NOT NULL,
	"enrichment_min_score" smallint DEFAULT 70 NOT NULL,
	"max_followup_depth" smallint DEFAULT 2 NOT NULL,
	"query_cache_days" smallint DEFAULT 7 NOT NULL,
	"auto_generate_messages" boolean DEFAULT true NOT NULL,
	"refresh_enabled" boolean DEFAULT true NOT NULL,
	"refresh_interval_days" smallint DEFAULT 14 NOT NULL,
	"refresh_batch_size" smallint DEFAULT 40 NOT NULL,
	"follow_up_default_days" smallint DEFAULT 3 NOT NULL,
	"data_retention_days" smallint DEFAULT 365 NOT NULL,
	"log_retention_days" smallint DEFAULT 90 NOT NULL,
	"search_connector_order" text[] DEFAULT '{}'::text[] NOT NULL,
	"state_cursor" integer DEFAULT 0 NOT NULL,
	"category_cursor" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_singleton_ck" CHECK ("automation_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"states" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" date,
	"ends_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"group" text NOT NULL,
	"description" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"negative_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"priority" smallint DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"type" "history_type" NOT NULL,
	"from_stage" "lead_stage",
	"to_stage" "lead_stage",
	"channel" "message_channel",
	"content" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"organizer_id" uuid,
	"type" "contact_type" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"label" text,
	"is_commercial" boolean DEFAULT true NOT NULL,
	"source_url" text NOT NULL,
	"source_excerpt" text,
	"confidence" smallint DEFAULT 50 NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_owner_ck" CHECK ("contacts"."event_id" is not null or "contacts"."organizer_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid,
	"category_id" integer,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"edition" text,
	"year" smallint,
	"city" text,
	"state" text,
	"region" text,
	"start_date" date,
	"end_date" date,
	"status" "event_status" DEFAULT 'unknown' NOT NULL,
	"registration_open" "fact_status" DEFAULT 'not_found' NOT NULL,
	"has_contest" "fact_status" DEFAULT 'unconfirmed' NOT NULL,
	"has_participants" "fact_status" DEFAULT 'not_found' NOT NULL,
	"has_popular_voting" "fact_status" DEFAULT 'not_found' NOT NULL,
	"voting_evidence" text,
	"current_voting_method" text,
	"description" text,
	"website" text,
	"instagram_handle" text,
	"fingerprint" text NOT NULL,
	"field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"site_available" boolean,
	"last_verified_at" timestamp with time zone,
	"previous_edition_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_year_ck" CHECK ("events"."year" is null or ("events"."year" between 1990 and 2100))
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"suggested_message" text,
	"status" "follow_up_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"channel" "message_channel" DEFAULT 'whatsapp' NOT NULL,
	"kind" "message_kind" DEFAULT 'initial' NOT NULL,
	"approach" text,
	"content" text NOT NULL,
	"edited_content" text,
	"status" "message_status" DEFAULT 'draft' NOT NULL,
	"model" text,
	"opened_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_credentials" text,
	"credential_hint" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "integration_status" DEFAULT 'not_configured' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"search_result_id" uuid,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"type" "source_type" DEFAULT 'other' NOT NULL,
	"excerpt" text,
	"http_status" smallint,
	"content_hash" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"organizer_id" uuid,
	"category_id" integer,
	"campaign_id" integer,
	"stage" "lead_stage" DEFAULT 'novo' NOT NULL,
	"stage_position" integer DEFAULT 0 NOT NULL,
	"qualification" "qualification_status" DEFAULT 'pending_analysis' NOT NULL,
	"score" smallint,
	"potential" "lead_potential",
	"voting_probability" smallint,
	"data_quality" smallint,
	"justification" text,
	"primary_whatsapp" text,
	"primary_phone" text,
	"primary_email" text,
	"primary_instagram" text,
	"primary_website" text,
	"city" text,
	"state" text,
	"region" text,
	"event_date" date,
	"is_suppressed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_contact_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_score_ck" CHECK ("leads"."score" is null or ("leads"."score" between 0 and 100))
);
--> statement-breakpoint
CREATE TABLE "organizers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"company_name" text,
	"person_name" text,
	"type" "organizer_type" DEFAULT 'desconhecido' NOT NULL,
	"city" text,
	"state" text,
	"website" text,
	"website_domain" text,
	"instagram_handle" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"events_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "search_job_type" NOT NULL,
	"status" "search_job_status" DEFAULT 'queued' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"campaign_id" integer,
	"context_event_id" uuid,
	"triggered_by" uuid,
	"total_queries" integer DEFAULT 0 NOT NULL,
	"completed_queries" integer DEFAULT 0 NOT NULL,
	"failed_queries" integer DEFAULT 0 NOT NULL,
	"results_found" integer DEFAULT 0 NOT NULL,
	"leads_created" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"discarded" integer DEFAULT 0 NOT NULL,
	"error" text,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"parent_query_id" uuid,
	"query" text NOT NULL,
	"query_hash" text NOT NULL,
	"connector" text,
	"category_id" integer,
	"state" text,
	"city" text,
	"depth" smallint DEFAULT 0 NOT NULL,
	"origin" "search_query_origin" DEFAULT 'template' NOT NULL,
	"status" "search_query_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"results_count" integer DEFAULT 0 NOT NULL,
	"new_results_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid,
	"job_id" uuid,
	"connector" text NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"domain" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"position" smallint,
	"relevance_score" smallint,
	"status" "search_result_status" DEFAULT 'new' NOT NULL,
	"discard_reason" text,
	"context_event_id" uuid,
	"event_id" uuid,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_token" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "suppression_type" NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"level" "log_level" NOT NULL,
	"scope" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"user_id" uuid,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_search_result_id_search_results_id_fk" FOREIGN KEY ("search_result_id") REFERENCES "public"."search_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_history" ADD CONSTRAINT "contact_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_history" ADD CONSTRAINT "contact_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_messages" ADD CONSTRAINT "generated_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_search_result_id_search_results_id_fk" FOREIGN KEY ("search_result_id") REFERENCES "public"."search_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizer_id_organizers_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_context_event_id_events_id_fk" FOREIGN KEY ("context_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_job_id_search_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."search_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_query_id_search_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."search_queries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_job_id_search_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."search_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_context_event_id_events_id_fk" FOREIGN KEY ("context_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_analyses_lead_idx" ON "ai_analyses" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "api_usage_provider_idx" ON "api_usage" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "api_usage_created_idx" ON "api_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "contact_history_lead_idx" ON "contact_history" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_event_uq" ON "contacts" USING btree ("event_id","type","normalized_value") WHERE "contacts"."event_id" is not null;--> statement-breakpoint
CREATE INDEX "contacts_organizer_idx" ON "contacts" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "contacts_norm_idx" ON "contacts" USING btree ("type","normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "events_fingerprint_uq" ON "events" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "events_organizer_idx" ON "events" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "events_state_idx" ON "events" USING btree ("state");--> statement-breakpoint
CREATE INDEX "events_category_idx" ON "events" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "follow_ups_due_idx" ON "follow_ups" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "follow_ups_lead_idx" ON "follow_ups" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "generated_messages_lead_idx" ON "generated_messages" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_provider_uq" ON "integrations" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_sources_event_url_uq" ON "lead_sources" USING btree ("event_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_event_uq" ON "leads" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage","stage_position");--> statement-breakpoint
CREATE INDEX "leads_state_idx" ON "leads" USING btree ("state");--> statement-breakpoint
CREATE INDEX "leads_score_idx" ON "leads" USING btree ("score");--> statement-breakpoint
CREATE INDEX "leads_discovered_idx" ON "leads" USING btree ("discovered_at");--> statement-breakpoint
CREATE INDEX "leads_category_idx" ON "leads" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "leads_event_date_idx" ON "leads" USING btree ("event_date");--> statement-breakpoint
CREATE UNIQUE INDEX "organizers_instagram_uq" ON "organizers" USING btree ("instagram_handle") WHERE "organizers"."instagram_handle" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "organizers_domain_uq" ON "organizers" USING btree ("website_domain") WHERE "organizers"."website_domain" is not null;--> statement-breakpoint
CREATE INDEX "organizers_name_state_idx" ON "organizers" USING btree ("normalized_name","state");--> statement-breakpoint
CREATE INDEX "search_jobs_status_idx" ON "search_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "search_queries_job_idx" ON "search_queries" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "search_queries_hash_idx" ON "search_queries" USING btree ("query_hash","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "search_results_url_uq" ON "search_results" USING btree ("url_hash");--> statement-breakpoint
CREATE INDEX "search_results_status_idx" ON "search_results" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "search_results_job_idx" ON "search_results" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_uq" ON "suppression_list" USING btree ("type","value");--> statement-breakpoint
CREATE INDEX "system_logs_created_idx" ON "system_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_logs_level_idx" ON "system_logs" USING btree ("level","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));