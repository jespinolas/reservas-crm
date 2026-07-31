CREATE TABLE "lite_booking_request" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "resource_id" text,
  "service_id" text NOT NULL,
  "reservation_id" text,
  "status" text DEFAULT 'new' NOT NULL,
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "customer_email" text,
  "party_size" integer DEFAULT 1 NOT NULL,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "customer_note" text,
  "operator_note" text,
  "payment_status" text DEFAULT 'not_required' NOT NULL,
  "payment_expected_amount_minor" integer,
  "payment_currency" text DEFAULT 'PYG' NOT NULL,
  "payment_instructions" text,
  "payment_evidence_redacted" text,
  "source" text DEFAULT 'public_lite_page' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "lite_booking_request_event" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "request_id" text NOT NULL,
  "event_type" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "metadata_redacted" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "lite_booking_request"
  ADD CONSTRAINT "lite_booking_request_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lite_booking_request"
  ADD CONSTRAINT "lite_booking_request_resource_id_resource_id_fk"
  FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "lite_booking_request"
  ADD CONSTRAINT "lite_booking_request_service_id_reservation_service_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."reservation_service"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "lite_booking_request"
  ADD CONSTRAINT "lite_booking_request_reservation_id_reservation_id_fk"
  FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "lite_booking_request_event"
  ADD CONSTRAINT "lite_booking_request_event_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lite_booking_request_event"
  ADD CONSTRAINT "lite_booking_request_event_request_id_lite_booking_request_id_fk"
  FOREIGN KEY ("request_id") REFERENCES "public"."lite_booking_request"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "lite_booking_request_org_status_idx"
  ON "lite_booking_request" USING btree ("organization_id","status");

CREATE INDEX "lite_booking_request_org_time_idx"
  ON "lite_booking_request" USING btree ("organization_id","starts_at");

CREATE INDEX "lite_booking_request_org_resource_time_idx"
  ON "lite_booking_request" USING btree ("organization_id","resource_id","starts_at","ends_at");

CREATE INDEX "lite_booking_request_event_request_idx"
  ON "lite_booking_request_event" USING btree ("request_id","created_at");

CREATE INDEX "lite_booking_request_event_org_idx"
  ON "lite_booking_request_event" USING btree ("organization_id","created_at");
