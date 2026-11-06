CREATE TYPE "public"."reply_outcome" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
ALTER TYPE "public"."history_type" ADD VALUE 'reply_received';--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "season_months" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_messages" ADD COLUMN "reply_outcome" "reply_outcome";--> statement-breakpoint
ALTER TABLE "generated_messages" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
UPDATE "categories" SET "season_months" = '{11,12,1}'::smallint[] WHERE "slug" IN ('melhores-do-ano', 'melhor-comercio', 'melhor-profissional', 'melhor-empresa', 'destaques-da-cidade', 'premiacao-regional', 'personalidade-do-ano', 'premio-empreendedor', 'premio-comunicacao', 'destaque-esporte');--> statement-breakpoint
UPDATE "categories" SET "season_months" = '{3,4,5,6,7,8,9,10}'::smallint[] WHERE "slug" IN ('rainha-do-rodeio', 'princesa-do-rodeio', 'musa-do-rodeio', 'rainha-da-expo', 'rainha-do-agro', 'garota-expo', 'festa-agropecuaria', 'rainha-country');--> statement-breakpoint
UPDATE "categories" SET "season_months" = '{1,2}'::smallint[] WHERE "slug" IN ('corte-carnaval');--> statement-breakpoint
UPDATE "categories" SET "season_months" = '{5,6,7}'::smallint[] WHERE "slug" IN ('festa-junina');--> statement-breakpoint
UPDATE "categories" SET "season_months" = '{12,1,2}'::smallint[] WHERE "slug" IN ('garota-verao');--> statement-breakpoint
UPDATE "categories" SET "season_months" = '{12}'::smallint[] WHERE "slug" IN ('decoracao-natal');--> statement-breakpoint
UPDATE "categories" SET "season_months" = '{8,9}'::smallint[] WHERE "slug" IN ('prenda-ctg');
