CREATE TABLE "screen_action_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_session_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"target_session_id" uuid,
	"target_path" text
);
--> statement-breakpoint
ALTER TABLE "screen_action_links" ADD CONSTRAINT "screen_action_links_source_session_id_prompt_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."prompt_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_action_links" ADD CONSTRAINT "screen_action_links_target_session_id_prompt_sessions_id_fk" FOREIGN KEY ("target_session_id") REFERENCES "public"."prompt_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "screen_action_links_source_action_uidx" ON "screen_action_links" USING btree ("source_session_id","action_id");--> statement-breakpoint
CREATE INDEX "screen_action_links_source_session_idx" ON "screen_action_links" USING btree ("source_session_id");--> statement-breakpoint
CREATE INDEX "screen_action_links_target_session_idx" ON "screen_action_links" USING btree ("target_session_id");