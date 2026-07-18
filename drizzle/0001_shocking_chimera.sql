CREATE TABLE "business_configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"timezone" text DEFAULT 'America/Asuncion' NOT NULL,
	"default_slot_minutes" integer DEFAULT 60 NOT NULL,
	"default_hold_minutes" integer DEFAULT 10 NOT NULL,
	"holds_block_availability" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_service" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'other' NOT NULL,
	"location" text,
	"capacity" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_configuration" ADD CONSTRAINT "business_configuration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_service" ADD CONSTRAINT "reservation_service_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_configuration_org_uq" ON "business_configuration" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reservation_service_org_sort_idx" ON "reservation_service" USING btree ("organization_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_service_org_active_name_uq" ON "reservation_service" USING btree ("organization_id","name") WHERE "reservation_service"."active" = true;--> statement-breakpoint
CREATE INDEX "resource_org_sort_idx" ON "resource" USING btree ("organization_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_org_active_name_uq" ON "resource" USING btree ("organization_id","name") WHERE "resource"."active" = true;