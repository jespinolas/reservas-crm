CREATE TABLE "reservation_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"kind" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"sent_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation_reminder" ADD CONSTRAINT "reservation_reminder_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_reminder" ADD CONSTRAINT "reservation_reminder_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_reminder_org_reservation_kind_uq" ON "reservation_reminder" USING btree ("organization_id","reservation_id","kind");--> statement-breakpoint
CREATE INDEX "reservation_reminder_org_status_due_idx" ON "reservation_reminder" USING btree ("organization_id","status","next_attempt_at");