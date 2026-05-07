CREATE TABLE "database_design_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"design_session_id" uuid NOT NULL,
	"database_schema_json_id" uuid,
	"screen_json_id" uuid,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_design_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid NOT NULL,
	"active_database_schema_json_id" uuid,
	"active_screen_json_id" uuid
);
--> statement-breakpoint
CREATE TABLE "database_schema_jsons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"design_session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"prompt" text NOT NULL,
	"trigger" text NOT NULL,
	"schema" jsonb NOT NULL,
	"diff_summary" jsonb DEFAULT '{"addedTables":[],"changedTables":[],"removedTables":[],"destructive":false}'::jsonb NOT NULL,
	"provider_meta" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_managed_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"database_schema_json_id" uuid,
	"migration_run_id" uuid,
	"object_type" text NOT NULL,
	"object_key" text NOT NULL,
	"object_name" text NOT NULL,
	"parent_object_name" text,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_migration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"database_schema_json_id" uuid NOT NULL,
	"status" text NOT NULL,
	"from_version" integer,
	"to_version" integer NOT NULL,
	"sql" text NOT NULL,
	"checksum" text NOT NULL,
	"applied_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "screen_jsons" ADD COLUMN "database_schema_json_id" uuid;--> statement-breakpoint
ALTER TABLE "screen_jsons" ADD COLUMN "data_bindings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "database_design_messages" ADD CONSTRAINT "database_design_messages_design_session_id_database_design_sessions_id_fk" FOREIGN KEY ("design_session_id") REFERENCES "public"."database_design_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_design_messages" ADD CONSTRAINT "database_design_messages_database_schema_json_id_database_schema_jsons_id_fk" FOREIGN KEY ("database_schema_json_id") REFERENCES "public"."database_schema_jsons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_design_messages" ADD CONSTRAINT "database_design_messages_screen_json_id_screen_jsons_id_fk" FOREIGN KEY ("screen_json_id") REFERENCES "public"."screen_jsons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_design_sessions" ADD CONSTRAINT "database_design_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_schema_jsons" ADD CONSTRAINT "database_schema_jsons_design_session_id_database_design_sessions_id_fk" FOREIGN KEY ("design_session_id") REFERENCES "public"."database_design_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_managed_objects" ADD CONSTRAINT "sandbox_managed_objects_database_schema_json_id_database_schema_jsons_id_fk" FOREIGN KEY ("database_schema_json_id") REFERENCES "public"."database_schema_jsons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_managed_objects" ADD CONSTRAINT "sandbox_managed_objects_migration_run_id_sandbox_migration_runs_id_fk" FOREIGN KEY ("migration_run_id") REFERENCES "public"."sandbox_migration_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_migration_runs" ADD CONSTRAINT "sandbox_migration_runs_database_schema_json_id_database_schema_jsons_id_fk" FOREIGN KEY ("database_schema_json_id") REFERENCES "public"."database_schema_jsons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "database_design_messages_created_at_idx" ON "database_design_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "database_design_messages_database_schema_json_idx" ON "database_design_messages" USING btree ("database_schema_json_id");--> statement-breakpoint
CREATE INDEX "database_design_messages_design_session_idx" ON "database_design_messages" USING btree ("design_session_id");--> statement-breakpoint
CREATE INDEX "database_design_messages_screen_json_idx" ON "database_design_messages" USING btree ("screen_json_id");--> statement-breakpoint
CREATE INDEX "database_design_sessions_created_by_idx" ON "database_design_sessions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "database_schema_jsons_design_session_idx" ON "database_schema_jsons" USING btree ("design_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "database_schema_jsons_session_version_uidx" ON "database_schema_jsons" USING btree ("design_session_id","version");--> statement-breakpoint
CREATE INDEX "sandbox_managed_objects_database_schema_json_idx" ON "sandbox_managed_objects" USING btree ("database_schema_json_id");--> statement-breakpoint
CREATE INDEX "sandbox_managed_objects_migration_run_idx" ON "sandbox_managed_objects" USING btree ("migration_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_managed_objects_object_key_uidx" ON "sandbox_managed_objects" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "sandbox_managed_objects_object_name_idx" ON "sandbox_managed_objects" USING btree ("object_name");--> statement-breakpoint
CREATE INDEX "sandbox_migration_runs_checksum_idx" ON "sandbox_migration_runs" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "sandbox_migration_runs_database_schema_json_idx" ON "sandbox_migration_runs" USING btree ("database_schema_json_id");--> statement-breakpoint
ALTER TABLE "screen_jsons" ADD CONSTRAINT "screen_jsons_database_schema_json_id_database_schema_jsons_id_fk" FOREIGN KEY ("database_schema_json_id") REFERENCES "public"."database_schema_jsons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screen_jsons_database_schema_json_idx" ON "screen_jsons" USING btree ("database_schema_json_id");