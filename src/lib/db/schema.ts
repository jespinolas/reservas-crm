import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================================================
 * Auth (Better Auth + plugin organization)
 * ============================================================ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/* ============================================================
 * Dominio (toda tabla lleva organization_id NOT NULL + índice org-first)
 * ============================================================ */

export const contact = pgTable(
  "contact",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_org_phone_uq").on(t.organizationId, t.phone),
    index("contact_org_name_idx").on(t.organizationId, t.name),
  ]
);

export const pipelineStage = pgTable(
  "pipeline_stage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    /** open = etapa normal · won / lost = anclas no borrables */
    kind: text("kind", { enum: ["open", "won", "lost"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("stage_org_pos_idx").on(t.organizationId, t.position)]
);

export const lead = pgTable(
  "lead",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    position: integer("position").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_contact_uq").on(t.contactId),
    index("lead_org_stage_idx").on(t.organizationId, t.stageId, t.position),
  ]
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    /** Conversación del Laboratorio: jamás toca la API de WhatsApp. */
    isTest: boolean("is_test").notNull().default(false),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    handoffAt: timestamp("handoff_at"),
    handoffReason: text("handoff_reason", {
      enum: ["cliente", "modelo", "error", "ventana"],
    }),
    lastInboundAt: timestamp("last_inbound_at"),
    lastMessageAt: timestamp("last_message_at"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Una conversación real por contacto; las de prueba no compiten.
    uniqueIndex("conversation_org_contact_real_uq")
      .on(t.organizationId, t.contactId)
      .where(sql`${t.isTest} = false`),
    index("conversation_org_last_idx").on(t.organizationId, t.lastMessageAt),
  ]
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    /** ID de WhatsApp — UNIQUE (idempotencia). Nullable en salientes de prueba. */
    waMessageId: text("wa_message_id").unique(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    type: text("type").notNull().default("text"),
    text: text("text"),
    status: text("status", {
      enum: ["pending", "sent", "delivered", "read", "failed"],
    })
      .notNull()
      .default("pending"),
    error: text("error"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    waTimestamp: timestamp("wa_timestamp"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("message_org_conv_idx").on(
      t.organizationId,
      t.conversationId,
      t.createdAt
    ),
  ]
);

export const aiReplyAttempt = pgTable(
  "ai_reply_attempt",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    inboundMessageId: text("inbound_message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id"),
    state: text("state", {
      enum: [
        "disabled",
        "not_ready",
        "eligible",
        "generating",
        "sent",
        "blocked",
        "failed",
        "handoff",
      ],
    }).notNull(),
    blockedReason: text("blocked_reason", {
      enum: [
        "crm_unhealthy",
        "db_unavailable",
        "provider_not_configured",
        "provider_failed",
        "conversation_ai_disabled",
        "business_ai_disabled",
        "human_handoff",
        "outside_window",
        "duplicate_inbound",
        "send_failed",
        "invalid_model_output",
      ],
    }),
    provider: text("provider"),
    model: text("model"),
    latencyMs: integer("latency_ms"),
    redactedError: text("redacted_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_reply_attempt_inbound_uq").on(t.inboundMessageId),
    index("ai_reply_attempt_org_conv_idx").on(
      t.organizationId,
      t.conversationId,
      t.createdAt
    ),
  ]
);

export const metaCredentials = pgTable(
  "meta_credentials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    tokenCipher: text("token_cipher").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    status: text("status", { enum: ["connected", "reconnect_required"] })
      .notNull()
      .default("connected"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meta_credentials_org_uq").on(t.organizationId),
    // El webhook enruta por phone_number_id: debe ser único en la instancia.
    uniqueIndex("meta_credentials_phone_uq").on(t.phoneNumberId),
  ]
);

export const businessConfiguration = pgTable(
  "business_configuration",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("America/Asuncion"),
    defaultSlotMinutes: integer("default_slot_minutes").notNull().default(60),
    defaultHoldMinutes: integer("default_hold_minutes").notNull().default(10),
    holdsBlockAvailability: boolean("holds_block_availability")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("business_configuration_org_uq").on(t.organizationId)]
);

export const resource = pgTable(
  "resource",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind", {
      enum: [
        "football_field",
        "room",
        "venue",
        "cabin",
        "house",
        "court",
        "field",
        "chair",
        "staff_member",
        "therapist",
        "stylist",
        "vehicle",
        "table",
        "professional",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    location: text("location"),
    capacity: integer("capacity").notNull().default(1),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("resource_org_sort_idx").on(t.organizationId, t.sortOrder),
    uniqueIndex("resource_org_active_name_uq")
      .on(t.organizationId, t.name)
      .where(sql`${t.active} = true`),
  ]
);

export const reservationService = pgTable(
  "reservation_service",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("reservation_service_org_sort_idx").on(t.organizationId, t.sortOrder),
    uniqueIndex("reservation_service_org_active_name_uq")
      .on(t.organizationId, t.name)
      .where(sql`${t.active} = true`),
  ]
);

export const reservationServicePaymentRule = pgTable(
  "reservation_service_payment_rule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => reservationService.id, { onDelete: "cascade" }),
    currency: text("currency").notNull().default("PYG"),
    amountMinor: integer("amount_minor"),
    depositType: text("deposit_type").notNull().default("none"),
    depositAmountMinor: integer("deposit_amount_minor"),
    depositPercentage: integer("deposit_percentage"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reservation_service_payment_rule_org_service_uq").on(
      t.organizationId,
      t.serviceId
    ),
    index("reservation_service_payment_rule_org_idx").on(t.organizationId),
  ]
);

export const resourceSchedule = pgTable(
  "resource_schedule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("resource_schedule_org_resource_day_idx").on(
      t.organizationId,
      t.resourceId,
      t.dayOfWeek
    ),
  ]
);

export const scheduleException = pgTable(
  "schedule_exception",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    kind: text("kind", { enum: ["available", "unavailable"] }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("schedule_exception_org_resource_date_idx").on(
      t.organizationId,
      t.resourceId,
      t.localDate
    ),
  ]
);

export const blackoutPeriod = pgTable(
  "blackout_period",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("blackout_period_org_resource_range_idx").on(
      t.organizationId,
      t.resourceId,
      t.startsAt,
      t.endsAt
    ),
  ]
);

export const bookingHold = pgTable(
  "booking_hold",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => reservationService.id),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status", {
      enum: ["active", "expired", "released", "converted"],
    })
      .notNull()
      .default("active"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("booking_hold_org_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey
    ),
    index("booking_hold_org_resource_range_idx").on(
      t.organizationId,
      t.resourceId,
      t.startsAt,
      t.endsAt
    ),
  ]
);

export const reservation = pgTable(
  "reservation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id),
    serviceId: text("service_id")
      .notNull()
      .references(() => reservationService.id),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    holdId: text("hold_id").references(() => bookingHold.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: text("status", { enum: ["confirmed", "cancelled"] })
      .notNull()
      .default("confirmed"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("reservation_org_resource_range_idx").on(
      t.organizationId,
      t.resourceId,
      t.startsAt,
      t.endsAt
    ),
    uniqueIndex("reservation_hold_uq").on(t.holdId),
  ]
);

export const reservationStatusHistory = pgTable(
  "reservation_status_history",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservation.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["confirmed", "cancelled"] }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("reservation_status_history_reservation_idx").on(t.reservationId)]
);

export const liteBookingRequest = pgTable(
  "lite_booking_request",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").references(() => resource.id, {
      onDelete: "set null",
    }),
    serviceId: text("service_id")
      .notNull()
      .references(() => reservationService.id),
    reservationId: text("reservation_id").references(() => reservation.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: [
        "new",
        "needs_reply",
        "waiting_for_customer",
        "waiting_for_payment",
        "confirmed",
        "declined",
        "expired",
      ],
    })
      .notNull()
      .default("new"),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    partySize: integer("party_size").notNull().default(1),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    customerNote: text("customer_note"),
    operatorNote: text("operator_note"),
    paymentStatus: text("payment_status", {
      enum: [
        "not_required",
        "requested",
        "evidence_received",
        "approved",
        "rejected",
        "expired",
      ],
    })
      .notNull()
      .default("not_required"),
    paymentExpectedAmountMinor: integer("payment_expected_amount_minor"),
    paymentCurrency: text("payment_currency").notNull().default("PYG"),
    paymentInstructions: text("payment_instructions"),
    paymentEvidenceRedacted: text("payment_evidence_redacted"),
    source: text("source").notNull().default("public_lite_page"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("lite_booking_request_org_status_idx").on(t.organizationId, t.status),
    index("lite_booking_request_org_time_idx").on(t.organizationId, t.startsAt),
    index("lite_booking_request_org_resource_time_idx").on(
      t.organizationId,
      t.resourceId,
      t.startsAt,
      t.endsAt
    ),
  ]
);

export const liteBookingRequestEvent = pgTable(
  "lite_booking_request_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => liteBookingRequest.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type", {
      enum: ["system", "operator", "customer"],
    }).notNull(),
    actorId: text("actor_id"),
    metadataRedacted: jsonb("metadata_redacted"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("lite_booking_request_event_request_idx").on(t.requestId, t.createdAt),
    index("lite_booking_request_event_org_idx").on(t.organizationId, t.createdAt),
  ]
);

export const liteAvailabilityBlock = pgTable(
  "lite_availability_block",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["available", "busy", "tentative", "blocked"],
    })
      .notNull()
      .default("available"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    label: text("label"),
    operatorNote: text("operator_note"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("lite_availability_block_org_time_idx").on(t.organizationId, t.startsAt),
    index("lite_availability_block_org_resource_time_idx").on(
      t.organizationId,
      t.resourceId,
      t.startsAt,
      t.endsAt
    ),
    index("lite_availability_block_org_status_idx").on(t.organizationId, t.status),
  ]
);

export const liteReminderCompletion = pgTable(
  "lite_reminder_completion",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    taskKey: text("task_key").notNull(),
    taskKind: text("task_kind").notNull(),
    targetId: text("target_id").notNull(),
    completedByUserId: text("completed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("lite_reminder_completion_org_task_uq").on(t.organizationId, t.taskKey),
    index("lite_reminder_completion_org_kind_idx").on(t.organizationId, t.taskKind),
  ]
);

export const liteCustomerProfile = pgTable(
  "lite_customer_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    reliability: text("reliability", {
      enum: ["new", "good", "late_payer", "no_show_risk", "vip", "blocked"],
    })
      .notNull()
      .default("new"),
    operatorNote: text("operator_note"),
    lastReviewedAt: timestamp("last_reviewed_at"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lite_customer_profile_org_phone_uq").on(t.organizationId, t.phone),
    index("lite_customer_profile_org_reliability_idx").on(t.organizationId, t.reliability),
  ]
);

export const manualPaymentVerification = pgTable(
  "manual_payment_verification",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    bookingHoldId: text("booking_hold_id")
      .notNull()
      .references(() => bookingHold.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id),
    serviceId: text("service_id")
      .notNull()
      .references(() => reservationService.id),
    status: text("status", {
      enum: [
        "waiting_for_evidence",
        "needs_operator_review",
        "approved",
        "rejected",
        "expired",
        "cancelled",
      ],
    })
      .notNull()
      .default("waiting_for_evidence"),
    expectedAmountMinor: integer("expected_amount_minor").notNull(),
    currency: text("currency").notNull().default("PYG"),
    evidenceMessageId: text("evidence_message_id").references(() => message.id, {
      onDelete: "set null",
    }),
    evidenceMediaId: text("evidence_media_id"),
    evidenceStorageRef: text("evidence_storage_ref"),
    customerReferenceRedacted: text("customer_reference_redacted"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNote: text("review_note"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("manual_payment_verification_org_status_idx").on(t.organizationId, t.status),
    index("manual_payment_verification_org_conversation_idx").on(
      t.organizationId,
      t.conversationId
    ),
    index("manual_payment_verification_expiration_idx").on(t.status, t.expiresAt),
    uniqueIndex("manual_payment_verification_org_hold_active_uq")
      .on(t.organizationId, t.bookingHoldId)
      .where(
        sql`${t.status} in ('waiting_for_evidence', 'needs_operator_review')`
      ),
  ]
);

export const manualPaymentVerificationHistory = pgTable(
  "manual_payment_verification_history",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    verificationId: text("verification_id")
      .notNull()
      .references(() => manualPaymentVerification.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorType: text("actor_type", { enum: ["system", "operator", "ai"] }).notNull(),
    actorId: text("actor_id"),
    reason: text("reason"),
    metadataRedacted: jsonb("metadata_redacted"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("manual_payment_verification_history_verification_idx").on(t.verificationId),
    index("manual_payment_verification_history_org_idx").on(t.organizationId),
  ]
);

export const aiBookingSettings = pgTable(
  "ai_booking_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    mode: text("mode", {
      enum: ["disabled", "suggest_only", "auto_hold", "manual_payment_confirm"],
    })
      .notNull()
      .default("disabled"),
    enabledByUserId: text("enabled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    enabledAt: timestamp("enabled_at"),
    readinessLastCheckedAt: timestamp("readiness_last_checked_at"),
    readinessStatus: text("readiness_status", {
      enum: ["unknown", "ready", "not_ready"],
    })
      .notNull()
      .default("unknown"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_booking_settings_org_uq").on(t.organizationId),
    index("ai_booking_settings_org_mode_idx").on(t.organizationId, t.mode),
  ]
);

export const aiBookingSession = pgTable(
  "ai_booking_session",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: [
        "collecting_intent",
        "showing_options",
        "awaiting_customer_confirmation",
        "hold_created",
        "awaiting_payment_evidence",
        "awaiting_operator_payment_review",
        "confirmed",
        "rejected",
        "expired",
        "escalated",
      ],
    })
      .notNull()
      .default("collecting_intent"),
    serviceId: text("service_id").references(() => reservationService.id, {
      onDelete: "set null",
    }),
    resourceId: text("resource_id").references(() => resource.id, {
      onDelete: "set null",
    }),
    requestedStartsAt: timestamp("requested_starts_at"),
    requestedEndsAt: timestamp("requested_ends_at"),
    partySize: integer("party_size"),
    selectedOptionJsonRedacted: jsonb("selected_option_json_redacted"),
    bookingHoldId: text("booking_hold_id").references(() => bookingHold.id, {
      onDelete: "set null",
    }),
    manualPaymentVerificationId: text("manual_payment_verification_id").references(
      () => manualPaymentVerification.id,
      { onDelete: "set null" }
    ),
    reservationId: text("reservation_id").references(() => reservation.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_booking_session_org_conversation_uq").on(
      t.organizationId,
      t.conversationId
    ),
    index("ai_booking_session_org_status_idx").on(t.organizationId, t.status),
    index("ai_booking_session_org_contact_idx").on(t.organizationId, t.contactId),
  ]
);

export const aiBookingSessionEvent = pgTable(
  "ai_booking_session_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => aiBookingSession.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type", {
      enum: ["system", "operator", "ai", "customer"],
    }).notNull(),
    actorId: text("actor_id"),
    metadataRedacted: jsonb("metadata_redacted"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_booking_session_event_session_idx").on(t.sessionId, t.createdAt),
    index("ai_booking_session_event_org_idx").on(t.organizationId, t.createdAt),
  ]
);

export const reservationReminder = pgTable(
  "reservation_reminder",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservation.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["pre_arrival", "follow_up"] }).notNull(),
    dueAt: timestamp("due_at").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "sent", "failed", "skipped", "cancelled"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    lockedAt: timestamp("locked_at"),
    sentAt: timestamp("sent_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reservation_reminder_org_reservation_kind_uq").on(
      t.organizationId,
      t.reservationId,
      t.kind
    ),
    index("reservation_reminder_org_status_due_idx").on(
      t.organizationId,
      t.status,
      t.nextAttemptAt
    ),
  ]
);

export const googleCalendarConnection = pgTable(
  "google_calendar_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    googleAccountEmail: text("google_account_email"),
    calendarId: text("calendar_id").notNull(),
    scopes: text("scopes").notNull(),
    accessTokenCipher: text("access_token_cipher").notNull(),
    accessTokenIv: text("access_token_iv").notNull(),
    accessTokenTag: text("access_token_tag").notNull(),
    refreshTokenCipher: text("refresh_token_cipher").notNull(),
    refreshTokenIv: text("refresh_token_iv").notNull(),
    refreshTokenTag: text("refresh_token_tag").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
    status: text("status", {
      enum: ["connected", "reconnect_required", "disabled"],
    })
      .notNull()
      .default("connected"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("google_calendar_connection_org_uq").on(t.organizationId)]
);

export const googleCalendarSync = pgTable(
  "google_calendar_sync",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => reservation.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id"),
    status: text("status", {
      enum: ["pending", "synced", "failed", "deleted"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("google_calendar_sync_org_reservation_uq").on(
      t.organizationId,
      t.reservationId
    ),
    index("google_calendar_sync_org_status_idx").on(t.organizationId, t.status),
  ]
);

export const resourceCalendarMapping = pgTable(
  "resource_calendar_mapping",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["google"] }).notNull(),
    calendarIdRedacted: text("calendar_id_redacted").notNull(),
    status: text("status", {
      enum: ["connected", "sync_failed", "disabled"],
    })
      .notNull()
      .default("connected"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("resource_calendar_mapping_org_resource_provider_uq").on(
      t.organizationId,
      t.resourceId,
      t.provider
    ),
    index("resource_calendar_mapping_org_status_idx").on(t.organizationId, t.status),
  ]
);

export const resourceBusyBlock = pgTable(
  "resource_busy_block",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["google_calendar"] }).notNull(),
    providerEventIdHash: text("provider_event_id_hash").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: text("status", { enum: ["active", "cancelled"] })
      .notNull()
      .default("active"),
    summaryRedacted: text("summary_redacted"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("resource_busy_block_org_resource_source_event_uq").on(
      t.organizationId,
      t.resourceId,
      t.source,
      t.providerEventIdHash
    ),
    index("resource_busy_block_org_resource_time_idx").on(
      t.organizationId,
      t.resourceId,
      t.startsAt,
      t.endsAt
    ),
    index("resource_busy_block_org_status_idx").on(t.organizationId, t.status),
  ]
);

export const automationOutbox = pgTable(
  "automation_outbox",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    eventVersion: text("event_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "delivered", "failed", "dead_letter"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    lockedAt: timestamp("locked_at"),
    deliveredAt: timestamp("delivered_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("automation_outbox_org_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey
    ),
    index("automation_outbox_org_status_due_idx").on(
      t.organizationId,
      t.status,
      t.nextAttemptAt
    ),
  ]
);

export const agentProfile = pgTable(
  "agent_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    name: text("name").notNull().default("Asistente"),
    tone: text("tone"),
    instructions: text("instructions"),
    escalationRules: text("escalation_rules"),
    greeting: text("greeting"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_profile_org_uq").on(t.organizationId)]
);

export const kbEntry = pgTable(
  "kb_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["qa", "block"] }).notNull(),
    question: text("question"),
    answer: text("answer"),
    content: text("content"),
    category: text("category", {
      enum: [
        "business_profile",
        "services",
        "hours",
        "location",
        "policies",
        "pricing_notes",
        "faq",
        "escalation",
        "payment_instructions",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    reviewStatus: text("review_status", {
      enum: ["draft", "reviewed", "needs_update", "archived"],
    })
      .notNull()
      .default("reviewed"),
    sourceLabel: text("source_label"),
    priority: integer("priority").notNull().default(100),
    active: boolean("active").notNull().default(true),
    lastReviewedAt: timestamp("last_reviewed_at"),
    reviewedByUserId: text("reviewed_by_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("kb_org_idx").on(t.organizationId),
    index("kb_org_status_idx").on(t.organizationId, t.reviewStatus, t.active),
    index("kb_org_category_idx").on(t.organizationId, t.category),
  ]
);

export const template = pgTable(
  "template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["draft", "pending", "approved", "rejected"],
    })
      .notNull()
      .default("draft"),
    rejectionReason: text("rejection_reason"),
    waTemplateId: text("wa_template_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("template_org_name_lang_uq").on(
      t.organizationId,
      t.name,
      t.language
    ),
  ]
);

export const agentTestRun = pgTable(
  "agent_test_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["running", "done", "failed"] })
      .notNull()
      .default("running"),
    score: integer("score"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    // Lock de concurrencia en BD: máximo 1 corrida activa por organización.
    uniqueIndex("test_run_org_running_uq")
      .on(t.organizationId)
      .where(sql`${t.status} = 'running'`),
    index("test_run_org_idx").on(t.organizationId, t.startedAt),
  ]
);

export const agentTestCase = pgTable(
  "agent_test_case",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => agentTestRun.id, { onDelete: "cascade" }),
    persona: text("persona").notNull(),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    transcript: jsonb("transcript"),
    veredicto: text("veredicto", { enum: ["verde", "amarillo", "rojo"] }),
    hallazgos: jsonb("hallazgos"),
    status: text("status", {
      enum: ["pending", "running", "done", "judge_failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("test_case_run_idx").on(t.runId)]
);
