CREATE TABLE "google_calendar_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"google_account_email" text,
	"calendar_id" text NOT NULL,
	"scopes" text NOT NULL,
	"access_token_cipher" text NOT NULL,
	"access_token_iv" text NOT NULL,
	"access_token_tag" text NOT NULL,
	"refresh_token_cipher" text NOT NULL,
	"refresh_token_iv" text NOT NULL,
	"refresh_token_tag" text NOT NULL,
	"access_token_expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reservation_id" text NOT NULL,
	"google_event_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connection" ADD CONSTRAINT "google_calendar_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync" ADD CONSTRAINT "google_calendar_sync_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync" ADD CONSTRAINT "google_calendar_sync_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_connection_org_uq" ON "google_calendar_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_sync_org_reservation_uq" ON "google_calendar_sync" USING btree ("organization_id","reservation_id");--> statement-breakpoint
CREATE INDEX "google_calendar_sync_org_status_idx" ON "google_calendar_sync" USING btree ("organization_id","status");