ALTER TABLE "conversation"
  ADD COLUMN "channel" text DEFAULT 'whatsapp' NOT NULL,
  ADD COLUMN "channel_connection_id" text,
  ADD COLUMN "provider_conversation_id" text,
  ADD COLUMN "service_window_expires_at" timestamp;

ALTER TABLE "message"
  ADD COLUMN "provider_message_id" text,
  ADD COLUMN "channel" text DEFAULT 'whatsapp' NOT NULL,
  ADD COLUMN "provider_timestamp" timestamp;

CREATE TABLE "channel_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "channel" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "display_name" text,
  "username" text,
  "token_cipher" text NOT NULL,
  "token_iv" text NOT NULL,
  "token_tag" text NOT NULL,
  "status" text DEFAULT 'connected' NOT NULL,
  "webhook_status" text DEFAULT 'pending' NOT NULL,
  "last_error_code" text,
  "last_error_message_redacted" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "contact_identity" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "contact_id" text NOT NULL,
  "channel" text NOT NULL,
  "provider_user_id" text NOT NULL,
  "provider_username" text,
  "display_name" text,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "instagram_comment" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "channel_connection_id" text NOT NULL,
  "contact_id" text,
  "provider_comment_id" text NOT NULL,
  "provider_media_id" text,
  "provider_user_id" text,
  "provider_username" text,
  "text" text,
  "permalink" text,
  "status" text DEFAULT 'new' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_channel_connection_fk"
  FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connection"("id")
  ON DELETE set null;

ALTER TABLE "contact_identity"
  ADD CONSTRAINT "contact_identity_organization_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
  ON DELETE cascade;

ALTER TABLE "contact_identity"
  ADD CONSTRAINT "contact_identity_contact_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE cascade;

ALTER TABLE "instagram_comment"
  ADD CONSTRAINT "instagram_comment_organization_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
  ON DELETE cascade;

ALTER TABLE "instagram_comment"
  ADD CONSTRAINT "instagram_comment_channel_connection_fk"
  FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connection"("id")
  ON DELETE cascade;

ALTER TABLE "instagram_comment"
  ADD CONSTRAINT "instagram_comment_contact_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE set null;

DROP INDEX IF EXISTS "conversation_org_contact_real_uq";

CREATE UNIQUE INDEX "channel_connection_org_channel_uq"
  ON "channel_connection" ("organization_id", "channel");

CREATE UNIQUE INDEX "channel_connection_provider_account_uq"
  ON "channel_connection" ("provider_account_id");

CREATE INDEX "channel_connection_org_idx"
  ON "channel_connection" ("organization_id");

CREATE UNIQUE INDEX "contact_identity_org_channel_user_uq"
  ON "contact_identity" ("organization_id", "channel", "provider_user_id");

CREATE INDEX "contact_identity_contact_idx"
  ON "contact_identity" ("contact_id");

CREATE UNIQUE INDEX "conversation_org_contact_channel_real_uq"
  ON "conversation" ("organization_id", "contact_id", "channel")
  WHERE "is_test" = false;

CREATE UNIQUE INDEX "conversation_channel_provider_uq"
  ON "conversation" ("channel_connection_id", "provider_conversation_id")
  WHERE "provider_conversation_id" IS NOT NULL;

CREATE UNIQUE INDEX "message_channel_provider_uq"
  ON "message" ("channel", "provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;

CREATE UNIQUE INDEX "instagram_comment_provider_uq"
  ON "instagram_comment" ("provider_comment_id");

CREATE INDEX "instagram_comment_org_status_idx"
  ON "instagram_comment" ("organization_id", "status");

CREATE INDEX "instagram_comment_connection_idx"
  ON "instagram_comment" ("channel_connection_id", "created_at");
