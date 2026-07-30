CREATE TABLE "resource_calendar_mapping" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "resource_id" text NOT NULL,
  "provider" text NOT NULL,
  "calendar_id_redacted" text NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "last_synced_at" timestamp,
  "last_error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_busy_block" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "resource_id" text NOT NULL,
  "source" text NOT NULL,
  "provider_event_id_hash" text NOT NULL,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "summary_redacted" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_calendar_mapping"
  ADD CONSTRAINT "resource_calendar_mapping_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resource_calendar_mapping"
  ADD CONSTRAINT "resource_calendar_mapping_resource_id_resource_id_fk"
  FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resource_busy_block"
  ADD CONSTRAINT "resource_busy_block_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resource_busy_block"
  ADD CONSTRAINT "resource_busy_block_resource_id_resource_id_fk"
  FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "resource_calendar_mapping_org_resource_provider_uq"
  ON "resource_calendar_mapping" USING btree ("organization_id","resource_id","provider");
--> statement-breakpoint
CREATE INDEX "resource_calendar_mapping_org_status_idx"
  ON "resource_calendar_mapping" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "resource_busy_block_org_resource_source_event_uq"
  ON "resource_busy_block" USING btree ("organization_id","resource_id","source","provider_event_id_hash");
--> statement-breakpoint
CREATE INDEX "resource_busy_block_org_resource_time_idx"
  ON "resource_busy_block" USING btree ("organization_id","resource_id","starts_at","ends_at");
--> statement-breakpoint
CREATE INDEX "resource_busy_block_org_status_idx"
  ON "resource_busy_block" USING btree ("organization_id","status");
