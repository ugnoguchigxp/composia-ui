CREATE TABLE "generated_screens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"parent_screen_id" uuid,
	"trigger" text NOT NULL,
	"prompt" text NOT NULL,
	"inferred_intent" text NOT NULL,
	"action" jsonb,
	"schema" jsonb NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"provider_meta" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_screens" ADD CONSTRAINT "generated_screens_session_id_prompt_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prompt_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_sessions" ADD CONSTRAINT "prompt_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_screens_parent_idx" ON "generated_screens" USING btree ("parent_screen_id");--> statement-breakpoint
CREATE INDEX "generated_screens_session_idx" ON "generated_screens" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "prompt_sessions_created_by_idx" ON "prompt_sessions" USING btree ("created_by");