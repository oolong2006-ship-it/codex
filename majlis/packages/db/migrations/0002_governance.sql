ALTER TYPE "public"."consent_method" ADD VALUE 'message';--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"naturalness" integer,
	"dialect_correct" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_encrypted" text NOT NULL,
	"session_id" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_contacts_phone_hash_unique" UNIQUE("phone_hash")
);
--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "engine_state" jsonb;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "recordings_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "deletion_token_hash" text;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "original_text" text;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "turn_ratings" ADD CONSTRAINT "turn_ratings_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_ratings" ADD CONSTRAINT "turn_ratings_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "turn_ratings_turn_reviewer_idx" ON "turn_ratings" USING btree ("turn_id","reviewer_id");--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_deletion_token_hash_unique" UNIQUE("deletion_token_hash");