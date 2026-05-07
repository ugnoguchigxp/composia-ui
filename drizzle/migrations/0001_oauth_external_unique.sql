DROP INDEX IF EXISTS "uex_provider_ext_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "uex_provider_ext_uidx" ON "user_external_accounts" USING btree ("provider","external_id");
