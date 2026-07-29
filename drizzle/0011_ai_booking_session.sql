CREATE TABLE "ai_booking_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "mode" text DEFAULT 'disabled' NOT NULL,
  "enabled_by_user_id" text,
  "enabled_at" timestamp,
  "readiness_last_checked_at" timestamp,
  "readiness_status" text DEFAULT 'unknown' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_booking_session" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "conversation_id" text NOT NULL,
  "contact_id" text,
  "status" text DEFAULT 'collecting_intent' NOT NULL,
  "service_id" text,
  "resource_id" text,
  "requested_starts_at" timestamp,
  "requested_ends_at" timestamp,
  "party_size" integer,
  "selected_option_json_redacted" jsonb,
  "booking_hold_id" text,
  "manual_payment_verification_id" text,
  "reservation_id" text,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_booking_session_event" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "session_id" text NOT NULL,
  "event_type" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "metadata_redacted" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_booking_settings"
  ADD CONSTRAINT "ai_booking_settings_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_settings"
  ADD CONSTRAINT "ai_booking_settings_enabled_by_user_id_user_id_fk"
  FOREIGN KEY ("enabled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_conversation_id_conversation_id_fk"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_service_id_reservation_service_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."reservation_service"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_resource_id_resource_id_fk"
  FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_booking_hold_id_booking_hold_id_fk"
  FOREIGN KEY ("booking_hold_id") REFERENCES "public"."booking_hold"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_manual_payment_verification_id_manual_payment_verification_id_fk"
  FOREIGN KEY ("manual_payment_verification_id") REFERENCES "public"."manual_payment_verification"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session"
  ADD CONSTRAINT "ai_booking_session_reservation_id_reservation_id_fk"
  FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session_event"
  ADD CONSTRAINT "ai_booking_session_event_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_booking_session_event"
  ADD CONSTRAINT "ai_booking_session_event_session_id_ai_booking_session_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."ai_booking_session"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_booking_settings_org_uq"
  ON "ai_booking_settings" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "ai_booking_settings_org_mode_idx"
  ON "ai_booking_settings" USING btree ("organization_id","mode");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_booking_session_org_conversation_uq"
  ON "ai_booking_session" USING btree ("organization_id","conversation_id");
--> statement-breakpoint
CREATE INDEX "ai_booking_session_org_status_idx"
  ON "ai_booking_session" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "ai_booking_session_org_contact_idx"
  ON "ai_booking_session" USING btree ("organization_id","contact_id");
--> statement-breakpoint
CREATE INDEX "ai_booking_session_event_session_idx"
  ON "ai_booking_session_event" USING btree ("session_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_booking_session_event_org_idx"
  ON "ai_booking_session_event" USING btree ("organization_id","created_at");
