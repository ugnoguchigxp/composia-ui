CREATE TABLE "ui_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid NOT NULL,
	"root_session_id" uuid
);
--> statement-breakpoint
ALTER TABLE "prompt_sessions" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_sessions" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "prompt_sessions" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_sessions" ADD COLUMN "page_path" text;--> statement-breakpoint
ALTER TABLE "ui_projects" ADD CONSTRAINT "ui_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_projects" ADD CONSTRAINT "ui_projects_root_session_id_prompt_sessions_id_fk" FOREIGN KEY ("root_session_id") REFERENCES "public"."prompt_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ui_projects_created_by_idx" ON "ui_projects" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "prompt_sessions" ADD CONSTRAINT "prompt_sessions_project_id_ui_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ui_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "ui_projects" ("created_at", "updated_at", "title", "created_by", "root_session_id")
SELECT "created_at", "updated_at", "title", "created_by", "id"
FROM "prompt_sessions"
WHERE "project_id" IS NULL;--> statement-breakpoint
UPDATE "prompt_sessions"
SET "project_id" = "ui_projects"."id",
    "page_path" = 'index'
FROM "ui_projects"
WHERE "ui_projects"."root_session_id" = "prompt_sessions"."id"
  AND "prompt_sessions"."project_id" IS NULL;--> statement-breakpoint
CREATE INDEX "prompt_sessions_project_idx" ON "prompt_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_sessions_project_page_uidx" ON "prompt_sessions" USING btree ("project_id","page_path") WHERE "prompt_sessions"."project_id" is not null and "prompt_sessions"."page_path" is not null;
