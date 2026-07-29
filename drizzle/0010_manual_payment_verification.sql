CREATE TABLE "manual_payment_verification" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "booking_hold_id" text NOT NULL,
  "conversation_id" text,
  "contact_id" text,
  "resource_id" text NOT NULL,
  "service_id" text NOT NULL,
  "status" text DEFAULT 'waiting_for_evidence' NOT NULL,
  "expected_amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'PYG' NOT NULL,
  "evidence_message_id" text,
  "evidence_media_id" text,
  "evidence_storage_ref" text,
  "customer_reference_redacted" text,
  "reviewed_by_user_id" text,
  "reviewed_at" timestamp,
  "review_note" text,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_payment_verification_history" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "verification_id" text NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "reason" text,
  "metadata_redacted" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_booking_hold_id_booking_hold_id_fk"
  FOREIGN KEY ("booking_hold_id") REFERENCES "public"."booking_hold"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_conversation_id_conversation_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_resource_id_resource_id_fk"
  FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_service_id_reservation_service_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."reservation_service"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_evidence_message_id_message_id_fk"
  FOREIGN KEY ("evidence_message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification"
  ADD CONSTRAINT "manual_payment_verification_reviewed_by_user_id_user_id_fk"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification_history"
  ADD CONSTRAINT "manual_payment_verification_history_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "manual_payment_verification_history"
  ADD CONSTRAINT "manual_payment_verification_history_verification_id_manual_payment_verification_id_fk"
  FOREIGN KEY ("verification_id") REFERENCES "public"."manual_payment_verification"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "manual_payment_verification_org_status_idx"
  ON "manual_payment_verification" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "manual_payment_verification_org_conversation_idx"
  ON "manual_payment_verification" USING btree ("organization_id","conversation_id");
--> statement-breakpoint
CREATE INDEX "manual_payment_verification_expiration_idx"
  ON "manual_payment_verification" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "manual_payment_verification_org_hold_active_uq"
  ON "manual_payment_verification" USING btree ("organization_id","booking_hold_id")
  WHERE "status" in ('waiting_for_evidence', 'needs_operator_review');
--> statement-breakpoint
CREATE INDEX "manual_payment_verification_history_verification_idx"
  ON "manual_payment_verification_history" USING btree ("verification_id");
--> statement-breakpoint
CREATE INDEX "manual_payment_verification_history_org_idx"
  ON "manual_payment_verification_history" USING btree ("organization_id");
