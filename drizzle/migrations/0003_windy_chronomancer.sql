CREATE TABLE "cache_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "normalized_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_definition_id" uuid NOT NULL,
	"source" text NOT NULL,
	"entity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text,
	"body" text,
	"summary" text,
	"url" text,
	"author" text,
	"tags" jsonb,
	"status" text,
	"published_at" timestamp,
	"source_updated_at" timestamp,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"url" text,
	"entity_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "normalized_entities" ADD CONSTRAINT "normalized_entities_source_definition_id_source_definitions_id_fk" FOREIGN KEY ("source_definition_id") REFERENCES "public"."source_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cache_namespace_idx" ON "cache_entries" USING btree ("namespace");--> statement-breakpoint
CREATE UNIQUE INDEX "cache_namespace_key_uidx" ON "cache_entries" USING btree ("namespace","key");--> statement-breakpoint
CREATE INDEX "ne_source_definition_idx" ON "normalized_entities" USING btree ("source_definition_id");--> statement-breakpoint
CREATE INDEX "ne_entity_type_idx" ON "normalized_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ne_source_external_uidx" ON "normalized_entities" USING btree ("source_definition_id","external_id");--> statement-breakpoint
CREATE INDEX "src_kind_idx" ON "source_definitions" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "src_label_uidx" ON "source_definitions" USING btree ("label");