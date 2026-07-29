import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export const aiBookingModeSchema = z.enum([
  "disabled",
  "suggest_only",
  "auto_hold",
  "manual_payment_confirm",
]);
export type AiBookingMode = z.infer<typeof aiBookingModeSchema>;

export const aiBookingReadinessStatusSchema = z.enum(["unknown", "ready", "not_ready"]);
export type AiBookingReadinessStatus = z.infer<typeof aiBookingReadinessStatusSchema>;

export const aiBookingSessionStatusSchema = z.enum([
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
]);
export type AiBookingSessionStatus = z.infer<typeof aiBookingSessionStatusSchema>;

export const aiBookingActorTypeSchema = z.enum(["system", "operator", "ai", "customer"]);
export type AiBookingActorType = z.infer<typeof aiBookingActorTypeSchema>;

export const selectedBookingOptionSchema = z
  .object({
    optionId: z.string().min(1).optional(),
    resourceId: z.string().min(1),
    resourceName: z.string().min(1).optional(),
    serviceId: z.string().min(1),
    serviceName: z.string().min(1).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    partySize: z.number().int().positive().optional(),
    capacity: z.number().int().positive().optional(),
    currency: z.string().min(1).optional(),
    amountMinor: z.number().int().nonnegative().optional(),
    depositRequired: z.boolean().optional(),
    depositAmountMinor: z.number().int().nonnegative().optional(),
  })
  .strict();
export type SelectedBookingOption = z.infer<typeof selectedBookingOptionSchema>;

export type AiBookingSettings = {
  id: string;
  organizationId: string;
  mode: AiBookingMode;
  enabledByUserId: string | null;
  enabledAt: Date | null;
  readinessLastCheckedAt: Date | null;
  readinessStatus: AiBookingReadinessStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AiBookingSession = {
  id: string;
  organizationId: string;
  conversationId: string;
  contactId: string | null;
  status: AiBookingSessionStatus;
  serviceId: string | null;
  resourceId: string | null;
  requestedStartsAt: Date | null;
  requestedEndsAt: Date | null;
  partySize: number | null;
  selectedOptionJsonRedacted: SelectedBookingOption | null;
  bookingHoldId: string | null;
  manualPaymentVerificationId: string | null;
  reservationId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AiBookingSessionEvent = {
  id: string;
  organizationId: string;
  sessionId: string;
  eventType: string;
  actorType: AiBookingActorType;
  actorId: string | null;
  metadataRedacted: Record<string, unknown> | null;
  createdAt: Date;
};

export interface AiBookingSessionRepository {
  findSettingsByOrganization(organizationId: string): Promise<AiBookingSettings | null>;
  saveSettings(settings: AiBookingSettings): Promise<AiBookingSettings>;
  findSessionByConversation(input: {
    organizationId: string;
    conversationId: string;
  }): Promise<AiBookingSession | null>;
  insertSession(session: AiBookingSession): Promise<AiBookingSession>;
  updateSession(session: AiBookingSession): Promise<AiBookingSession>;
  insertEvent(event: AiBookingSessionEvent): Promise<void>;
  listEvents(sessionId: string): Promise<AiBookingSessionEvent[]>;
}

export class AiBookingSessionError extends Error {
  constructor(readonly code: "invalid_transition" | "invalid_input") {
    super(code);
    this.name = "AiBookingSessionError";
  }
}

export class AiBookingSessionService {
  constructor(private readonly repository: AiBookingSessionRepository) {}

  async getSettings(organizationId: string): Promise<AiBookingSettings> {
    const parsedOrganizationId = z.string().min(1).parse(organizationId);
    const existing = await this.repository.findSettingsByOrganization(parsedOrganizationId);
    if (existing) return existing;

    const now = new Date();
    return {
      id: newId("aiBookingSettings"),
      organizationId: parsedOrganizationId,
      mode: "disabled",
      enabledByUserId: null,
      enabledAt: null,
      readinessLastCheckedAt: null,
      readinessStatus: "unknown",
      createdAt: now,
      updatedAt: now,
    };
  }

  async saveSettings(input: {
    organizationId: string;
    mode: AiBookingMode;
    enabledByUserId?: string | null;
    readinessStatus?: AiBookingReadinessStatus;
    readinessLastCheckedAt?: Date | null;
    now?: Date;
  }): Promise<AiBookingSettings> {
    const parsed = saveSettingsSchema.parse(input);
    const current = await this.getSettings(parsed.organizationId);
    const now = parsed.now ?? new Date();
    const modeChangedToEnabled = current.mode === "disabled" && parsed.mode !== "disabled";
    const next: AiBookingSettings = {
      ...current,
      mode: parsed.mode,
      enabledByUserId: parsed.mode === "disabled" ? null : parsed.enabledByUserId ?? current.enabledByUserId,
      enabledAt:
        parsed.mode === "disabled"
          ? null
          : current.enabledAt ?? (modeChangedToEnabled ? now : current.enabledAt),
      readinessStatus: parsed.readinessStatus ?? current.readinessStatus,
      readinessLastCheckedAt:
        parsed.readinessLastCheckedAt === undefined
          ? current.readinessLastCheckedAt
          : parsed.readinessLastCheckedAt,
      updatedAt: now,
    };
    return this.repository.saveSettings(next);
  }

  async startSession(input: {
    organizationId: string;
    conversationId: string;
    contactId?: string | null;
    serviceId?: string | null;
    resourceId?: string | null;
    requestedStartsAt?: Date | null;
    requestedEndsAt?: Date | null;
    partySize?: number | null;
    actorType?: AiBookingActorType;
    actorId?: string | null;
    now?: Date;
  }): Promise<AiBookingSession> {
    const parsed = startSessionSchema.parse(input);
    const existing = await this.repository.findSessionByConversation({
      organizationId: parsed.organizationId,
      conversationId: parsed.conversationId,
    });
    if (existing) return existing;

    const now = parsed.now ?? new Date();
    const session: AiBookingSession = {
      id: newId("aiBookingSession"),
      organizationId: parsed.organizationId,
      conversationId: parsed.conversationId,
      contactId: parsed.contactId ?? null,
      status: "collecting_intent",
      serviceId: parsed.serviceId ?? null,
      resourceId: parsed.resourceId ?? null,
      requestedStartsAt: parsed.requestedStartsAt ?? null,
      requestedEndsAt: parsed.requestedEndsAt ?? null,
      partySize: parsed.partySize ?? null,
      selectedOptionJsonRedacted: null,
      bookingHoldId: null,
      manualPaymentVerificationId: null,
      reservationId: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.repository.insertSession(session);
    await this.repository.insertEvent({
      id: newId("aiBookingSessionEvent"),
      organizationId: created.organizationId,
      sessionId: created.id,
      eventType: "ai_booking.session_started",
      actorType: parsed.actorType ?? "system",
      actorId: parsed.actorId ?? null,
      metadataRedacted: null,
      createdAt: now,
    });
    return created;
  }

  async transition(input: {
    session: AiBookingSession;
    toStatus: AiBookingSessionStatus;
    actorType: AiBookingActorType;
    actorId?: string | null;
    eventType?: string;
    serviceId?: string | null;
    resourceId?: string | null;
    requestedStartsAt?: Date | null;
    requestedEndsAt?: Date | null;
    partySize?: number | null;
    selectedOptionJsonRedacted?: SelectedBookingOption | null;
    bookingHoldId?: string | null;
    manualPaymentVerificationId?: string | null;
    reservationId?: string | null;
    expiresAt?: Date | null;
    metadataRedacted?: Record<string, unknown> | null;
    now?: Date;
  }): Promise<AiBookingSession> {
    const parsed = transitionSchema.parse(input);
    if (!canTransition(parsed.session.status, parsed.toStatus)) {
      throw new AiBookingSessionError("invalid_transition");
    }

    const now = parsed.now ?? new Date();
    const next: AiBookingSession = {
      ...parsed.session,
      status: parsed.toStatus,
      serviceId: parsed.serviceId === undefined ? parsed.session.serviceId : parsed.serviceId,
      resourceId: parsed.resourceId === undefined ? parsed.session.resourceId : parsed.resourceId,
      requestedStartsAt:
        parsed.requestedStartsAt === undefined
          ? parsed.session.requestedStartsAt
          : parsed.requestedStartsAt,
      requestedEndsAt:
        parsed.requestedEndsAt === undefined ? parsed.session.requestedEndsAt : parsed.requestedEndsAt,
      partySize: parsed.partySize === undefined ? parsed.session.partySize : parsed.partySize,
      selectedOptionJsonRedacted:
        parsed.selectedOptionJsonRedacted === undefined
          ? parsed.session.selectedOptionJsonRedacted
          : parsed.selectedOptionJsonRedacted,
      bookingHoldId:
        parsed.bookingHoldId === undefined ? parsed.session.bookingHoldId : parsed.bookingHoldId,
      manualPaymentVerificationId:
        parsed.manualPaymentVerificationId === undefined
          ? parsed.session.manualPaymentVerificationId
          : parsed.manualPaymentVerificationId,
      reservationId:
        parsed.reservationId === undefined ? parsed.session.reservationId : parsed.reservationId,
      expiresAt: parsed.expiresAt === undefined ? parsed.session.expiresAt : parsed.expiresAt,
      updatedAt: now,
    };
    const updated = await this.repository.updateSession(next);
    await this.repository.insertEvent({
      id: newId("aiBookingSessionEvent"),
      organizationId: updated.organizationId,
      sessionId: updated.id,
      eventType: parsed.eventType ?? `ai_booking.${parsed.toStatus}`,
      actorType: parsed.actorType,
      actorId: parsed.actorId ?? null,
      metadataRedacted: parsed.metadataRedacted ?? {
        fromStatus: parsed.session.status,
        toStatus: parsed.toStatus,
      },
      createdAt: now,
    });
    return updated;
  }

  async listEvents(sessionId: string): Promise<AiBookingSessionEvent[]> {
    return this.repository.listEvents(z.string().min(1).parse(sessionId));
  }
}

const terminalStatuses = new Set<AiBookingSessionStatus>([
  "confirmed",
  "rejected",
  "expired",
  "escalated",
]);

const allowedTransitions: Record<AiBookingSessionStatus, AiBookingSessionStatus[]> = {
  collecting_intent: ["showing_options", "expired", "escalated"],
  showing_options: [
    "collecting_intent",
    "awaiting_customer_confirmation",
    "expired",
    "escalated",
  ],
  awaiting_customer_confirmation: ["showing_options", "hold_created", "expired", "escalated"],
  hold_created: [
    "awaiting_payment_evidence",
    "awaiting_operator_payment_review",
    "confirmed",
    "expired",
    "escalated",
  ],
  awaiting_payment_evidence: ["awaiting_operator_payment_review", "expired", "escalated"],
  awaiting_operator_payment_review: ["confirmed", "rejected", "expired", "escalated"],
  confirmed: [],
  rejected: [],
  expired: [],
  escalated: [],
};

export function canTransition(
  fromStatus: AiBookingSessionStatus,
  toStatus: AiBookingSessionStatus
): boolean {
  if (fromStatus === toStatus) return !terminalStatuses.has(fromStatus);
  return allowedTransitions[fromStatus].includes(toStatus);
}

export class DrizzleAiBookingSessionRepository implements AiBookingSessionRepository {
  constructor(private readonly db = getDb()) {}

  async findSettingsByOrganization(organizationId: string): Promise<AiBookingSettings | null> {
    const rows = await this.db
      .select()
      .from(schema.aiBookingSettings)
      .where(eq(schema.aiBookingSettings.organizationId, organizationId))
      .limit(1);
    return rows[0] ? rowToSettings(rows[0]) : null;
  }

  async saveSettings(settings: AiBookingSettings): Promise<AiBookingSettings> {
    const rows = await this.db
      .insert(schema.aiBookingSettings)
      .values(settings)
      .onConflictDoUpdate({
        target: schema.aiBookingSettings.organizationId,
        set: {
          mode: settings.mode,
          enabledByUserId: settings.enabledByUserId,
          enabledAt: settings.enabledAt,
          readinessLastCheckedAt: settings.readinessLastCheckedAt,
          readinessStatus: settings.readinessStatus,
          updatedAt: settings.updatedAt,
        },
      })
      .returning();
    if (!rows[0]) throw new AiBookingSessionError("invalid_input");
    return rowToSettings(rows[0]);
  }

  async findSessionByConversation(input: {
    organizationId: string;
    conversationId: string;
  }): Promise<AiBookingSession | null> {
    const rows = await this.db
      .select()
      .from(schema.aiBookingSession)
      .where(
        and(
          eq(schema.aiBookingSession.organizationId, input.organizationId),
          eq(schema.aiBookingSession.conversationId, input.conversationId)
        )
      )
      .limit(1);
    return rows[0] ? rowToSession(rows[0]) : null;
  }

  async insertSession(session: AiBookingSession): Promise<AiBookingSession> {
    const rows = await this.db.insert(schema.aiBookingSession).values(session).returning();
    if (!rows[0]) throw new AiBookingSessionError("invalid_input");
    return rowToSession(rows[0]);
  }

  async updateSession(session: AiBookingSession): Promise<AiBookingSession> {
    const rows = await this.db
      .update(schema.aiBookingSession)
      .set({
        status: session.status,
        serviceId: session.serviceId,
        resourceId: session.resourceId,
        requestedStartsAt: session.requestedStartsAt,
        requestedEndsAt: session.requestedEndsAt,
        partySize: session.partySize,
        selectedOptionJsonRedacted: session.selectedOptionJsonRedacted,
        bookingHoldId: session.bookingHoldId,
        manualPaymentVerificationId: session.manualPaymentVerificationId,
        reservationId: session.reservationId,
        expiresAt: session.expiresAt,
        updatedAt: session.updatedAt,
      })
      .where(
        and(
          eq(schema.aiBookingSession.organizationId, session.organizationId),
          eq(schema.aiBookingSession.id, session.id)
        )
      )
      .returning();
    if (!rows[0]) throw new AiBookingSessionError("invalid_input");
    return rowToSession(rows[0]);
  }

  async insertEvent(event: AiBookingSessionEvent): Promise<void> {
    await this.db.insert(schema.aiBookingSessionEvent).values(event);
  }

  async listEvents(sessionId: string): Promise<AiBookingSessionEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.aiBookingSessionEvent)
      .where(eq(schema.aiBookingSessionEvent.sessionId, sessionId))
      .orderBy(desc(schema.aiBookingSessionEvent.createdAt));
    return rows.map(rowToEvent);
  }
}

export class InMemoryAiBookingSessionRepository implements AiBookingSessionRepository {
  readonly settings = new Map<string, AiBookingSettings>();
  readonly sessions = new Map<string, AiBookingSession>();
  readonly events: AiBookingSessionEvent[] = [];

  async findSettingsByOrganization(organizationId: string): Promise<AiBookingSettings | null> {
    const settings = this.settings.get(organizationId);
    return settings ? cloneSettings(settings) : null;
  }

  async saveSettings(settings: AiBookingSettings): Promise<AiBookingSettings> {
    this.settings.set(settings.organizationId, cloneSettings(settings));
    return cloneSettings(settings);
  }

  async findSessionByConversation(input: {
    organizationId: string;
    conversationId: string;
  }): Promise<AiBookingSession | null> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.organizationId === input.organizationId &&
        candidate.conversationId === input.conversationId
    );
    return session ? cloneSession(session) : null;
  }

  async insertSession(session: AiBookingSession): Promise<AiBookingSession> {
    const existing = await this.findSessionByConversation({
      organizationId: session.organizationId,
      conversationId: session.conversationId,
    });
    if (existing) return existing;
    this.sessions.set(session.id, cloneSession(session));
    return cloneSession(session);
  }

  async updateSession(session: AiBookingSession): Promise<AiBookingSession> {
    if (!this.sessions.has(session.id)) throw new AiBookingSessionError("invalid_input");
    this.sessions.set(session.id, cloneSession(session));
    return cloneSession(session);
  }

  async insertEvent(event: AiBookingSessionEvent): Promise<void> {
    this.events.push(cloneEvent(event));
  }

  async listEvents(sessionId: string): Promise<AiBookingSessionEvent[]> {
    return this.events
      .filter((event) => event.sessionId === sessionId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(cloneEvent);
  }
}

const saveSettingsSchema = z.object({
  organizationId: z.string().min(1),
  mode: aiBookingModeSchema,
  enabledByUserId: z.string().min(1).nullable().optional(),
  readinessStatus: aiBookingReadinessStatusSchema.optional(),
  readinessLastCheckedAt: z.date().nullable().optional(),
  now: z.date().optional(),
});

const startSessionSchema = z.object({
  organizationId: z.string().min(1),
  conversationId: z.string().min(1),
  contactId: z.string().min(1).nullable().optional(),
  serviceId: z.string().min(1).nullable().optional(),
  resourceId: z.string().min(1).nullable().optional(),
  requestedStartsAt: z.date().nullable().optional(),
  requestedEndsAt: z.date().nullable().optional(),
  partySize: z.number().int().positive().nullable().optional(),
  actorType: aiBookingActorTypeSchema.optional(),
  actorId: z.string().min(1).nullable().optional(),
  now: z.date().optional(),
});

const transitionSchema = z.object({
  session: z.custom<AiBookingSession>(),
  toStatus: aiBookingSessionStatusSchema,
  actorType: aiBookingActorTypeSchema,
  actorId: z.string().min(1).nullable().optional(),
  eventType: z.string().min(1).optional(),
  serviceId: z.string().min(1).nullable().optional(),
  resourceId: z.string().min(1).nullable().optional(),
  requestedStartsAt: z.date().nullable().optional(),
  requestedEndsAt: z.date().nullable().optional(),
  partySize: z.number().int().positive().nullable().optional(),
  selectedOptionJsonRedacted: selectedBookingOptionSchema.nullable().optional(),
  bookingHoldId: z.string().min(1).nullable().optional(),
  manualPaymentVerificationId: z.string().min(1).nullable().optional(),
  reservationId: z.string().min(1).nullable().optional(),
  expiresAt: z.date().nullable().optional(),
  metadataRedacted: z.record(z.unknown()).nullable().optional(),
  now: z.date().optional(),
});

function rowToSettings(row: typeof schema.aiBookingSettings.$inferSelect): AiBookingSettings {
  return {
    ...row,
    mode: aiBookingModeSchema.parse(row.mode),
    readinessStatus: aiBookingReadinessStatusSchema.parse(row.readinessStatus),
  };
}

function rowToSession(row: typeof schema.aiBookingSession.$inferSelect): AiBookingSession {
  return {
    ...row,
    status: aiBookingSessionStatusSchema.parse(row.status),
    selectedOptionJsonRedacted: row.selectedOptionJsonRedacted
      ? selectedBookingOptionSchema.parse(row.selectedOptionJsonRedacted)
      : null,
  };
}

function rowToEvent(row: typeof schema.aiBookingSessionEvent.$inferSelect): AiBookingSessionEvent {
  return {
    ...row,
    actorType: aiBookingActorTypeSchema.parse(row.actorType),
    metadataRedacted: row.metadataRedacted
      ? z.record(z.unknown()).parse(row.metadataRedacted)
      : null,
  };
}

function cloneSettings(settings: AiBookingSettings): AiBookingSettings {
  return {
    ...settings,
    enabledAt: settings.enabledAt ? new Date(settings.enabledAt) : null,
    readinessLastCheckedAt: settings.readinessLastCheckedAt
      ? new Date(settings.readinessLastCheckedAt)
      : null,
    createdAt: new Date(settings.createdAt),
    updatedAt: new Date(settings.updatedAt),
  };
}

function cloneSession(session: AiBookingSession): AiBookingSession {
  return {
    ...session,
    requestedStartsAt: session.requestedStartsAt ? new Date(session.requestedStartsAt) : null,
    requestedEndsAt: session.requestedEndsAt ? new Date(session.requestedEndsAt) : null,
    selectedOptionJsonRedacted: session.selectedOptionJsonRedacted
      ? { ...session.selectedOptionJsonRedacted }
      : null,
    expiresAt: session.expiresAt ? new Date(session.expiresAt) : null,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
  };
}

function cloneEvent(event: AiBookingSessionEvent): AiBookingSessionEvent {
  return {
    ...event,
    metadataRedacted: event.metadataRedacted ? { ...event.metadataRedacted } : null,
    createdAt: new Date(event.createdAt),
  };
}
