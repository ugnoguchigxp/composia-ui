CREATE TABLE "prompt_session_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"screen_json_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screen_jsons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"prompt" text NOT NULL,
	"trigger" text NOT NULL,
	"inferred_intent" text NOT NULL,
	"action" jsonb,
	"schema" jsonb NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"provider_meta" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_sessions" ADD COLUMN "active_screen_json_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_session_messages" ADD CONSTRAINT "prompt_session_messages_session_id_prompt_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prompt_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_session_messages" ADD CONSTRAINT "prompt_session_messages_screen_json_id_screen_jsons_id_fk" FOREIGN KEY ("screen_json_id") REFERENCES "public"."screen_jsons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_jsons" ADD CONSTRAINT "screen_jsons_session_id_prompt_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."prompt_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_session_messages_created_at_idx" ON "prompt_session_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prompt_session_messages_screen_json_idx" ON "prompt_session_messages" USING btree ("screen_json_id");--> statement-breakpoint
CREATE INDEX "prompt_session_messages_session_idx" ON "prompt_session_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "screen_jsons_session_idx" ON "screen_jsons" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "screen_jsons_session_version_uidx" ON "screen_jsons" USING btree ("session_id","version");--> statement-breakpoint
WITH ordered_generated_screens AS (
	SELECT
		"id",
		"created_at",
		"updated_at",
		"session_id",
		row_number() OVER (
			PARTITION BY "session_id"
			ORDER BY "created_at" ASC, "id" ASC
		)::integer AS "version",
		"prompt",
		"trigger",
		"inferred_intent",
		"action",
		"schema",
		"context_snapshot",
		"provider_meta"
	FROM "generated_screens"
)
INSERT INTO "screen_jsons" (
	"id",
	"created_at",
	"updated_at",
	"session_id",
	"version",
	"prompt",
	"trigger",
	"inferred_intent",
	"action",
	"schema",
	"context_snapshot",
	"provider_meta"
)
SELECT
	"id",
	"created_at",
	"updated_at",
	"session_id",
	"version",
	"prompt",
	"trigger",
	"inferred_intent",
	"action",
	"schema",
	"context_snapshot",
	"provider_meta"
FROM ordered_generated_screens
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "prompt_sessions"
SET "active_screen_json_id" = latest."id"
FROM (
	SELECT DISTINCT ON ("session_id")
		"session_id",
		"id"
	FROM "screen_jsons"
	ORDER BY "session_id", "version" DESC, "created_at" DESC, "id" DESC
) latest
WHERE latest."session_id" = "prompt_sessions"."id"
	AND "prompt_sessions"."active_screen_json_id" IS NULL;
