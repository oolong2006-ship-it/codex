CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "theme_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "counts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "answers" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "segment_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "embedding" vector(1024);--> statement-breakpoint
CREATE INDEX "jobs_ready_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_pending_dedupe_idx" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."status" = 'pending' and "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "insights_study_idx" ON "insights" USING btree ("study_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personas_org_segment_idx" ON "personas" USING btree ("org_id","segment_key");--> statement-breakpoint
CREATE INDEX "turns_embedding_idx" ON "turns" USING hnsw ("embedding" vector_cosine_ops);