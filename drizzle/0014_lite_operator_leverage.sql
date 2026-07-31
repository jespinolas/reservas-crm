CREATE TABLE "lite_availability_block" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "resource_id" text NOT NULL,
  "status" text DEFAULT 'available' NOT NULL,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "label" text,
  "operator_note" text,
  "created_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "lite_reminder_completion" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "task_key" text NOT NULL,
  "task_kind" text NOT NULL,
  "target_id" text NOT NULL,
  "completed_by_user_id" text,
  "completed_at" timestamp DEFAULT now() NOT NULL,
  "note" text
);

CREATE TABLE "lite_customer_profile" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "phone" text NOT NULL,
  "reliability" text DEFAULT 'new' NOT NULL,
  "operator_note" text,
  "last_reviewed_at" timestamp,
  "reviewed_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "lite_availability_block"
  ADD CONSTRAINT "lite_availability_block_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lite_availability_block"
  ADD CONSTRAINT "lite_availability_block_resource_id_resource_id_fk"
  FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lite_availability_block"
  ADD CONSTRAINT "lite_availability_block_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "lite_reminder_completion"
  ADD CONSTRAINT "lite_reminder_completion_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lite_reminder_completion"
  ADD CONSTRAINT "lite_reminder_completion_completed_by_user_id_user_id_fk"
  FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "lite_customer_profile"
  ADD CONSTRAINT "lite_customer_profile_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lite_customer_profile"
  ADD CONSTRAINT "lite_customer_profile_reviewed_by_user_id_user_id_fk"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "lite_availability_block_org_time_idx"
  ON "lite_availability_block" USING btree ("organization_id","starts_at");

CREATE INDEX "lite_availability_block_org_resource_time_idx"
  ON "lite_availability_block" USING btree ("organization_id","resource_id","starts_at","ends_at");

CREATE INDEX "lite_availability_block_org_status_idx"
  ON "lite_availability_block" USING btree ("organization_id","status");

CREATE UNIQUE INDEX "lite_reminder_completion_org_task_uq"
  ON "lite_reminder_completion" USING btree ("organization_id","task_key");

CREATE INDEX "lite_reminder_completion_org_kind_idx"
  ON "lite_reminder_completion" USING btree ("organization_id","task_kind");

CREATE UNIQUE INDEX "lite_customer_profile_org_phone_uq"
  ON "lite_customer_profile" USING btree ("organization_id","phone");

CREATE INDEX "lite_customer_profile_org_reliability_idx"
  ON "lite_customer_profile" USING btree ("organization_id","reliability");
