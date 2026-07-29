ALTER TABLE "kb_entry" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "review_status" text DEFAULT 'reviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "source_label" text;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "last_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "reviewed_by_user_id" text;--> statement-breakpoint
UPDATE "kb_entry" SET "last_reviewed_at" = "updated_at" WHERE "review_status" = 'reviewed';--> statement-breakpoint
CREATE INDEX "kb_org_status_idx" ON "kb_entry" USING btree ("organization_id","review_status","active");--> statement-breakpoint
CREATE INDEX "kb_org_category_idx" ON "kb_entry" USING btree ("organization_id","category");
