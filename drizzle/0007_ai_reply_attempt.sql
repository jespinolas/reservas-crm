CREATE TABLE "ai_reply_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"inbound_message_id" text NOT NULL,
	"provider_message_id" text,
	"state" text NOT NULL,
	"blocked_reason" text,
	"provider" text,
	"model" text,
	"latency_ms" integer,
	"redacted_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_reply_attempt" ADD CONSTRAINT "ai_reply_attempt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reply_attempt" ADD CONSTRAINT "ai_reply_attempt_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reply_attempt" ADD CONSTRAINT "ai_reply_attempt_inbound_message_id_message_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reply_attempt_inbound_uq" ON "ai_reply_attempt" USING btree ("inbound_message_id");--> statement-breakpoint
CREATE INDEX "ai_reply_attempt_org_conv_idx" ON "ai_reply_attempt" USING btree ("organization_id","conversation_id","created_at");
