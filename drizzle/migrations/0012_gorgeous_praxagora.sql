CREATE TABLE "published_prompt_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"screen_json_id" uuid NOT NULL,
	"html" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "published_prompt_pages" ADD CONSTRAINT "published_prompt_pages_session_id_prompt_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prompt_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_prompt_pages" ADD CONSTRAINT "published_prompt_pages_screen_json_id_screen_jsons_id_fk" FOREIGN KEY ("screen_json_id") REFERENCES "public"."screen_jsons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "published_prompt_pages_screen_json_idx" ON "published_prompt_pages" USING btree ("screen_json_id");--> statement-breakpoint
CREATE UNIQUE INDEX "published_prompt_pages_session_uidx" ON "published_prompt_pages" USING btree ("session_id");