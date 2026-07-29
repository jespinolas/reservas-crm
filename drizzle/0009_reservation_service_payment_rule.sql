CREATE TABLE "reservation_service_payment_rule" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "service_id" text NOT NULL,
  "currency" text DEFAULT 'PYG' NOT NULL,
  "amount_minor" integer,
  "deposit_type" text DEFAULT 'none' NOT NULL,
  "deposit_amount_minor" integer,
  "deposit_percentage" integer,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation_service_payment_rule"
  ADD CONSTRAINT "reservation_service_payment_rule_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_service_payment_rule"
  ADD CONSTRAINT "reservation_service_payment_rule_service_id_reservation_service_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."reservation_service"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_service_payment_rule_org_service_uq"
  ON "reservation_service_payment_rule" USING btree ("organization_id","service_id");
--> statement-breakpoint
CREATE INDEX "reservation_service_payment_rule_org_idx"
  ON "reservation_service_payment_rule" USING btree ("organization_id");
