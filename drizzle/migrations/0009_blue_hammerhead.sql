CREATE INDEX "database_design_messages_database_schema_json_created_at_idx" ON "database_design_messages" USING btree ("database_schema_json_id","created_at");--> statement-breakpoint
CREATE INDEX "database_design_messages_design_session_created_at_idx" ON "database_design_messages" USING btree ("design_session_id","created_at");--> statement-breakpoint
CREATE INDEX "generated_screens_session_created_at_idx" ON "generated_screens" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "ne_source_definition_published_idx" ON "normalized_entities" USING btree ("source_definition_id","published_at","created_at");--> statement-breakpoint
CREATE INDEX "prompt_session_messages_session_created_at_idx" ON "prompt_session_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "sandbox_migration_runs_database_schema_json_applied_at_idx" ON "sandbox_migration_runs" USING btree ("database_schema_json_id","applied_at","created_at");--> statement-breakpoint
CREATE INDEX "sandbox_migration_runs_status_applied_at_idx" ON "sandbox_migration_runs" USING btree ("status","applied_at","created_at");--> statement-breakpoint
CREATE INDEX "screen_jsons_database_schema_json_version_idx" ON "screen_jsons" USING btree ("database_schema_json_id","version","created_at");--> statement-breakpoint
CREATE INDEX "screen_jsons_session_created_at_idx" ON "screen_jsons" USING btree ("session_id","created_at");