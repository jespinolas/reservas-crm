import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/db/ids";
import { getDb, schema } from "@/lib/db";
import {
  BookingError,
  BookingService,
  DrizzleBookingRepository,
  type BookingHold,
  type Reservation,
} from "@/server/reservations/booking";
import {
  calculateServicePaymentQuote,
  type ServicePaymentRule,
} from "@/server/reservations/payment-rules";

export const manualPaymentVerificationStatusSchema = z.enum([
  "waiting_for_evidence",
  "needs_operator_review",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);

export type ManualPaymentVerificationStatus = z.infer<
  typeof manualPaymentVerificationStatusSchema
>;

export type ManualPaymentVerification = {
  id: string;
  organizationId: string;
  bookingHoldId: string;
  conversationId: string | null;
  contactId: string | null;
  resourceId: string;
  serviceId: string;
  status: ManualPaymentVerificationStatus;
  expectedAmountMinor: number;
  currency: string;
  evidenceMessageId: string | null;
  evidenceMediaId: string | null;
  evidenceStorageRef: string | null;
  customerReferenceRedacted: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ManualPaymentVerificationHistory = {
  id: string;
  organizationId: string;
  verificationId: string;
  fromStatus: ManualPaymentVerificationStatus | null;
  toStatus: ManualPaymentVerificationStatus;
  actorType: "system" | "operator" | "ai";
  actorId: string | null;
  reason: string | null;
  metadataRedacted: Record<string, unknown> | null;
  createdAt: Date;
};

export type ManualPaymentEvidenceInput = {
  evidenceMessageId?: string | null;
  evidenceMediaId?: string | null;
  evidenceStorageRef?: string | null;
  customerReferenceRedacted?: string | null;
};

export interface ManualPaymentVerificationRepository {
  findHoldById(organizationId: string, holdId: string): Promise<BookingHold | null>;
  findById(organizationId: string, id: string): Promise<ManualPaymentVerification | null>;
  findActiveByHold(
    organizationId: string,
    holdId: string
  ): Promise<ManualPaymentVerification | null>;
  findLatestOpenByConversation(
    organizationId: string,
    conversationId: string
  ): Promise<ManualPaymentVerification | null>;
  findLatestActivePaymentGatedHold(input: {
    organizationId: string;
    contactId: string;
    now: Date;
  }): Promise<{ hold: BookingHold; expectedAmountMinor: number; currency: string } | null>;
  findReservationByHoldId(organizationId: string, holdId: string): Promise<Reservation | null>;
  recordReservation(reservation: Reservation): Promise<void>;
  create(verification: ManualPaymentVerification): Promise<ManualPaymentVerification>;
  update(
    verification: ManualPaymentVerification
  ): Promise<ManualPaymentVerification>;
  appendHistory(history: ManualPaymentVerificationHistory): Promise<void>;
  list(input: {
    organizationId: string;
    conversationId?: string | null;
    statuses?: ManualPaymentVerificationStatus[];
    limit: number;
  }): Promise<ManualPaymentVerification[]>;
}

export class ManualPaymentVerificationError extends Error {
  constructor(
    readonly code:
      | "hold_not_found"
      | "verification_not_found"
      | "invalid_status"
      | "expired"
      | "conflict"
      | "not_active"
  ) {
    super(code);
    this.name = "ManualPaymentVerificationError";
  }
}

export class ManualPaymentVerificationService {
  constructor(
    private readonly repository: ManualPaymentVerificationRepository,
    private readonly bookingService: BookingService
  ) {}

  async createReviewRequest(input: {
    organizationId: string;
    holdId: string;
    conversationId?: string | null;
    expectedAmountMinor: number;
    currency: string;
    evidence?: ManualPaymentEvidenceInput;
    expiresAt?: Date;
    now?: Date;
  }): Promise<ManualPaymentVerification> {
    const parsed = createRequestSchema.parse(input);
    const now = parsed.now ?? new Date();
    const hold = await this.repository.findHoldById(parsed.organizationId, parsed.holdId);
    if (!hold) throw new ManualPaymentVerificationError("hold_not_found");

    const existing = await this.repository.findActiveByHold(parsed.organizationId, parsed.holdId);
    if (existing) {
      const evidence = parsed.evidence;
      if (!hasEvidence(evidence)) return existing;
      return this.attachEvidence({
        verification: existing,
        evidence,
        now,
      });
    }

    const verification: ManualPaymentVerification = {
      id: newId("manualPaymentVerification"),
      organizationId: parsed.organizationId,
      bookingHoldId: hold.id,
      conversationId: parsed.conversationId ?? null,
      contactId: hold.contactId,
      resourceId: hold.resourceId,
      serviceId: hold.serviceId,
      status: hasEvidence(parsed.evidence) ? "needs_operator_review" : "waiting_for_evidence",
      expectedAmountMinor: parsed.expectedAmountMinor,
      currency: parsed.currency,
      evidenceMessageId: parsed.evidence?.evidenceMessageId ?? null,
      evidenceMediaId: parsed.evidence?.evidenceMediaId ?? null,
      evidenceStorageRef: parsed.evidence?.evidenceStorageRef ?? null,
      customerReferenceRedacted: parsed.evidence?.customerReferenceRedacted ?? null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
      expiresAt: parsed.expiresAt ?? hold.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.repository.create(verification);
    await this.repository.appendHistory(
      history({
        verification: created,
        fromStatus: null,
        toStatus: created.status,
        actorType: "system",
        reason: "manual_payment_verification_requested",
        now,
      })
    );
    return created;
  }

  async recordInboundEvidence(input: {
    organizationId: string;
    conversationId: string;
    contactId: string;
    messageId: string;
    messageType: string;
    text?: string | null;
    evidenceMediaId?: string | null;
    evidenceStorageRef?: string | null;
    now?: Date;
  }): Promise<ManualPaymentVerification | null> {
    const parsed = inboundEvidenceSchema.parse(input);
    const now = parsed.now ?? new Date();
    if (!isLikelyPaymentEvidence(parsed.messageType, parsed.text ?? null)) return null;

    const evidence: ManualPaymentEvidenceInput = {
      evidenceMessageId: parsed.messageId,
      evidenceMediaId: parsed.evidenceMediaId ?? null,
      evidenceStorageRef: parsed.evidenceStorageRef ?? null,
      customerReferenceRedacted: parsed.text ? redactReference(parsed.text).slice(0, 500) : null,
    };

    const existing = await this.repository.findLatestOpenByConversation(
      parsed.organizationId,
      parsed.conversationId
    );
    if (existing) return this.attachEvidence({ verification: existing, evidence, now });

    const target = await this.repository.findLatestActivePaymentGatedHold({
      organizationId: parsed.organizationId,
      contactId: parsed.contactId,
      now,
    });
    if (!target) return null;

    return this.createReviewRequest({
      organizationId: parsed.organizationId,
      holdId: target.hold.id,
      conversationId: parsed.conversationId,
      expectedAmountMinor: target.expectedAmountMinor,
      currency: target.currency,
      evidence,
      now,
    });
  }

  async list(input: {
    organizationId: string;
    conversationId?: string | null;
    statuses?: ManualPaymentVerificationStatus[];
    limit?: number;
  }): Promise<ManualPaymentVerification[]> {
    return this.repository.list({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      statuses: input.statuses,
      limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
    });
  }

  async get(
    organizationId: string,
    id: string
  ): Promise<ManualPaymentVerification> {
    const verification = await this.repository.findById(organizationId, id);
    if (!verification) throw new ManualPaymentVerificationError("verification_not_found");
    return verification;
  }

  async approve(input: {
    organizationId: string;
    id: string;
    actorUserId: string;
    note?: string | null;
    now?: Date;
  }): Promise<{ verification: ManualPaymentVerification; reservation: Reservation }> {
    const now = input.now ?? new Date();
    const verification = await this.get(input.organizationId, input.id);
    if (verification.status === "approved") {
      const existing = await this.repository.findReservationByHoldId(
        input.organizationId,
        verification.bookingHoldId
      );
      if (!existing) throw new ManualPaymentVerificationError("conflict");
      return { verification, reservation: existing };
    }
    if (!canReview(verification.status)) {
      throw new ManualPaymentVerificationError("invalid_status");
    }
    if (verification.expiresAt <= now) {
      await this.transition({
        verification,
        toStatus: "expired",
        actorType: "system",
        reason: "hold_expired_before_payment_approval",
        now,
      });
      throw new ManualPaymentVerificationError("expired");
    }

    let reservation: Reservation;
    try {
      reservation = await this.bookingService.confirmHold({
        organizationId: input.organizationId,
        holdId: verification.bookingHoldId,
        now,
      });
      await this.repository.recordReservation(reservation);
    } catch (error) {
      if (error instanceof BookingError) {
        if (error.code === "expired") {
          await this.transition({
            verification,
            toStatus: "expired",
            actorType: "system",
            reason: "hold_expired_before_payment_approval",
            now,
          });
        }
        throw new ManualPaymentVerificationError(
          error.code === "not_found" ? "hold_not_found" : error.code
        );
      }
      throw error;
    }

    const approved = await this.transition({
      verification,
      toStatus: "approved",
      actorType: "operator",
      actorId: input.actorUserId,
      reason: "operator_confirmed_payment_received",
      note: input.note ?? null,
      now,
    });
    return { verification: approved, reservation };
  }

  async reject(input: {
    organizationId: string;
    id: string;
    actorUserId: string;
    reason?: string | null;
    note?: string | null;
    now?: Date;
  }): Promise<ManualPaymentVerification> {
    const verification = await this.get(input.organizationId, input.id);
    if (!canReview(verification.status)) {
      throw new ManualPaymentVerificationError("invalid_status");
    }
    return this.transition({
      verification,
      toStatus: "rejected",
      actorType: "operator",
      actorId: input.actorUserId,
      reason: input.reason ?? "operator_rejected_payment",
      note: input.note ?? null,
      now: input.now ?? new Date(),
    });
  }

  async cancel(input: {
    organizationId: string;
    id: string;
    actorUserId: string;
    note?: string | null;
    now?: Date;
  }): Promise<ManualPaymentVerification> {
    const verification = await this.get(input.organizationId, input.id);
    if (!canReview(verification.status)) {
      throw new ManualPaymentVerificationError("invalid_status");
    }
    return this.transition({
      verification,
      toStatus: "cancelled",
      actorType: "operator",
      actorId: input.actorUserId,
      reason: "operator_cancelled_manual_payment_verification",
      note: input.note ?? null,
      now: input.now ?? new Date(),
    });
  }

  private async transition(input: {
    verification: ManualPaymentVerification;
    toStatus: ManualPaymentVerificationStatus;
    actorType: ManualPaymentVerificationHistory["actorType"];
    actorId?: string | null;
    reason: string;
    note?: string | null;
    now: Date;
  }): Promise<ManualPaymentVerification> {
    const updated: ManualPaymentVerification = {
      ...input.verification,
      status: input.toStatus,
      reviewedByUserId:
        input.actorType === "operator" ? input.actorId ?? null : input.verification.reviewedByUserId,
      reviewedAt: input.actorType === "operator" ? input.now : input.verification.reviewedAt,
      reviewNote: input.note ?? input.verification.reviewNote,
      updatedAt: input.now,
    };
    const saved = await this.repository.update(updated);
    await this.repository.appendHistory(
      history({
        verification: saved,
        fromStatus: input.verification.status,
        toStatus: input.toStatus,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        reason: input.reason,
        metadataRedacted:
          input.note == null ? null : { note: redactReference(input.note) },
        now: input.now,
      })
    );
    return saved;
  }

  private async attachEvidence(input: {
    verification: ManualPaymentVerification;
    evidence: ManualPaymentEvidenceInput;
    now: Date;
  }): Promise<ManualPaymentVerification> {
    const nextStatus: ManualPaymentVerificationStatus = "needs_operator_review";
    const updated: ManualPaymentVerification = {
      ...input.verification,
      status: nextStatus,
      evidenceMessageId: input.evidence.evidenceMessageId ?? input.verification.evidenceMessageId,
      evidenceMediaId: input.evidence.evidenceMediaId ?? input.verification.evidenceMediaId,
      evidenceStorageRef:
        input.evidence.evidenceStorageRef ?? input.verification.evidenceStorageRef,
      customerReferenceRedacted:
        input.evidence.customerReferenceRedacted ??
        input.verification.customerReferenceRedacted,
      updatedAt: input.now,
    };
    const saved = await this.repository.update(updated);
    await this.repository.appendHistory(
      history({
        verification: saved,
        fromStatus: input.verification.status,
        toStatus: nextStatus,
        actorType: "system",
        reason: "customer_payment_evidence_attached",
        metadataRedacted: {
          evidenceMessageId: input.evidence.evidenceMessageId ?? null,
          evidenceMediaId: input.evidence.evidenceMediaId ? "[redacted]" : null,
          customerReferenceRedacted: input.evidence.customerReferenceRedacted ?? null,
        },
        now: input.now,
      })
    );
    return saved;
  }
}

export class DrizzleManualPaymentVerificationRepository
  implements ManualPaymentVerificationRepository
{
  constructor(private readonly db = getDb()) {}

  async findHoldById(organizationId: string, holdId: string): Promise<BookingHold | null> {
    const rows = await this.db
      .select()
      .from(schema.bookingHold)
      .where(
        and(eq(schema.bookingHold.organizationId, organizationId), eq(schema.bookingHold.id, holdId))
      )
      .limit(1);
    return rows[0] ? normalizeHold(rows[0]) : null;
  }

  async findById(
    organizationId: string,
    id: string
  ): Promise<ManualPaymentVerification | null> {
    const rows = await this.db
      .select()
      .from(schema.manualPaymentVerification)
      .where(
        and(
          eq(schema.manualPaymentVerification.organizationId, organizationId),
          eq(schema.manualPaymentVerification.id, id)
        )
      )
      .limit(1);
    return rows[0] ? normalizeVerification(rows[0]) : null;
  }

  async findActiveByHold(
    organizationId: string,
    holdId: string
  ): Promise<ManualPaymentVerification | null> {
    const rows = await this.db
      .select()
      .from(schema.manualPaymentVerification)
      .where(
        and(
          eq(schema.manualPaymentVerification.organizationId, organizationId),
          eq(schema.manualPaymentVerification.bookingHoldId, holdId),
          inArray(schema.manualPaymentVerification.status, [
            "waiting_for_evidence",
            "needs_operator_review",
          ])
        )
      )
      .limit(1);
    return rows[0] ? normalizeVerification(rows[0]) : null;
  }

  async findLatestOpenByConversation(
    organizationId: string,
    conversationId: string
  ): Promise<ManualPaymentVerification | null> {
    const rows = await this.db
      .select()
      .from(schema.manualPaymentVerification)
      .where(
        and(
          eq(schema.manualPaymentVerification.organizationId, organizationId),
          eq(schema.manualPaymentVerification.conversationId, conversationId),
          inArray(schema.manualPaymentVerification.status, [
            "waiting_for_evidence",
            "needs_operator_review",
          ])
        )
      )
      .orderBy(desc(schema.manualPaymentVerification.createdAt))
      .limit(1);
    return rows[0] ? normalizeVerification(rows[0]) : null;
  }

  async findLatestActivePaymentGatedHold(input: {
    organizationId: string;
    contactId: string;
    now: Date;
  }): Promise<{ hold: BookingHold; expectedAmountMinor: number; currency: string } | null> {
    const rows = await this.db
      .select({
        hold: schema.bookingHold,
        rule: schema.reservationServicePaymentRule,
      })
      .from(schema.bookingHold)
      .innerJoin(
        schema.reservationServicePaymentRule,
        and(
          eq(schema.reservationServicePaymentRule.organizationId, schema.bookingHold.organizationId),
          eq(schema.reservationServicePaymentRule.serviceId, schema.bookingHold.serviceId),
          eq(schema.reservationServicePaymentRule.active, true)
        )
      )
      .where(
        and(
          eq(schema.bookingHold.organizationId, input.organizationId),
          eq(schema.bookingHold.contactId, input.contactId),
          eq(schema.bookingHold.status, "active"),
          gt(schema.bookingHold.expiresAt, input.now)
        )
      )
      .orderBy(desc(schema.bookingHold.createdAt))
      .limit(5);

    for (const row of rows) {
      const quote = calculateServicePaymentQuote(normalizePaymentRule(row.rule));
      if (quote.depositDue && quote.depositDue.amountMinor > 0) {
        return {
          hold: normalizeHold(row.hold),
          expectedAmountMinor: quote.depositDue.amountMinor,
          currency: quote.depositDue.currency,
        };
      }
    }
    return null;
  }

  async findReservationByHoldId(
    organizationId: string,
    holdId: string
  ): Promise<Reservation | null> {
    const rows = await this.db
      .select()
      .from(schema.reservation)
      .where(
        and(eq(schema.reservation.organizationId, organizationId), eq(schema.reservation.holdId, holdId))
      )
      .limit(1);
    return rows[0] ? normalizeReservation(rows[0]) : null;
  }

  async recordReservation(): Promise<void> {
    // DrizzleBookingRepository already persisted the reservation transactionally.
  }

  async create(
    verification: ManualPaymentVerification
  ): Promise<ManualPaymentVerification> {
    const rows = await this.db
      .insert(schema.manualPaymentVerification)
      .values(verification)
      .returning();
    const created = rows[0];
    if (!created) throw new Error("manual_payment_verification_create_failed");
    return normalizeVerification(created);
  }

  async update(
    verification: ManualPaymentVerification
  ): Promise<ManualPaymentVerification> {
    const rows = await this.db
      .update(schema.manualPaymentVerification)
      .set({
        status: verification.status,
        evidenceMessageId: verification.evidenceMessageId,
        evidenceMediaId: verification.evidenceMediaId,
        evidenceStorageRef: verification.evidenceStorageRef,
        customerReferenceRedacted: verification.customerReferenceRedacted,
        reviewedByUserId: verification.reviewedByUserId,
        reviewedAt: verification.reviewedAt,
        reviewNote: verification.reviewNote,
        updatedAt: verification.updatedAt,
      })
      .where(
        and(
          eq(schema.manualPaymentVerification.organizationId, verification.organizationId),
          eq(schema.manualPaymentVerification.id, verification.id)
        )
      )
      .returning();
    const updated = rows[0];
    if (!updated) throw new Error("manual_payment_verification_update_failed");
    return normalizeVerification(updated);
  }

  async appendHistory(history: ManualPaymentVerificationHistory): Promise<void> {
    await this.db.insert(schema.manualPaymentVerificationHistory).values(history);
  }

  async list(input: {
    organizationId: string;
    conversationId?: string | null;
    statuses?: ManualPaymentVerificationStatus[];
    limit: number;
  }): Promise<ManualPaymentVerification[]> {
    const conditions = [eq(schema.manualPaymentVerification.organizationId, input.organizationId)];
    if (input.conversationId) {
      conditions.push(eq(schema.manualPaymentVerification.conversationId, input.conversationId));
    }
    if (input.statuses?.length) {
      conditions.push(inArray(schema.manualPaymentVerification.status, input.statuses));
    }
    const rows = await this.db
      .select()
      .from(schema.manualPaymentVerification)
      .where(and(...conditions))
      .orderBy(desc(schema.manualPaymentVerification.createdAt))
      .limit(input.limit);
    return rows.map(normalizeVerification);
  }
}

export class InMemoryManualPaymentVerificationRepository
  implements ManualPaymentVerificationRepository
{
  holds = new Map<string, BookingHold>();
  paymentRules = new Map<string, ServicePaymentRule>();
  verifications = new Map<string, ManualPaymentVerification>();
  reservations = new Map<string, Reservation>();
  histories: ManualPaymentVerificationHistory[] = [];

  async findHoldById(organizationId: string, holdId: string): Promise<BookingHold | null> {
    const hold = this.holds.get(holdId);
    return hold?.organizationId === organizationId ? cloneHold(hold) : null;
  }

  async findById(
    organizationId: string,
    id: string
  ): Promise<ManualPaymentVerification | null> {
    const verification = this.verifications.get(id);
    return verification?.organizationId === organizationId
      ? cloneVerification(verification)
      : null;
  }

  async findActiveByHold(
    organizationId: string,
    holdId: string
  ): Promise<ManualPaymentVerification | null> {
    const verification = [...this.verifications.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.bookingHoldId === holdId &&
        canReview(candidate.status)
    );
    return verification ? cloneVerification(verification) : null;
  }

  async findLatestOpenByConversation(
    organizationId: string,
    conversationId: string
  ): Promise<ManualPaymentVerification | null> {
    const verification = [...this.verifications.values()]
      .filter(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.conversationId === conversationId &&
          canReview(candidate.status)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return verification ? cloneVerification(verification) : null;
  }

  async findLatestActivePaymentGatedHold(input: {
    organizationId: string;
    contactId: string;
    now: Date;
  }): Promise<{ hold: BookingHold; expectedAmountMinor: number; currency: string } | null> {
    const holds = [...this.holds.values()]
      .filter(
        (hold) =>
          hold.organizationId === input.organizationId &&
          hold.contactId === input.contactId &&
          hold.status === "active" &&
          hold.expiresAt > input.now
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const hold of holds) {
      const rule = this.paymentRules.get(`${hold.organizationId}:${hold.serviceId}`);
      const quote = calculateServicePaymentQuote(rule ?? null);
      if (quote.depositDue && quote.depositDue.amountMinor > 0) {
        return {
          hold: cloneHold(hold),
          expectedAmountMinor: quote.depositDue.amountMinor,
          currency: quote.depositDue.currency,
        };
      }
    }
    return null;
  }

  async findReservationByHoldId(
    organizationId: string,
    holdId: string
  ): Promise<Reservation | null> {
    const reservation = [...this.reservations.values()].find(
      (candidate) => candidate.organizationId === organizationId && candidate.holdId === holdId
    );
    return reservation ? cloneReservation(reservation) : null;
  }

  async recordReservation(reservation: Reservation): Promise<void> {
    this.reservations.set(reservation.id, cloneReservation(reservation));
  }

  async create(
    verification: ManualPaymentVerification
  ): Promise<ManualPaymentVerification> {
    this.verifications.set(verification.id, cloneVerification(verification));
    return cloneVerification(verification);
  }

  async update(
    verification: ManualPaymentVerification
  ): Promise<ManualPaymentVerification> {
    this.verifications.set(verification.id, cloneVerification(verification));
    return cloneVerification(verification);
  }

  async appendHistory(history: ManualPaymentVerificationHistory): Promise<void> {
    this.histories.push(cloneHistory(history));
  }

  async list(input: {
    organizationId: string;
    conversationId?: string | null;
    statuses?: ManualPaymentVerificationStatus[];
    limit: number;
  }): Promise<ManualPaymentVerification[]> {
    return [...this.verifications.values()]
      .filter(
        (verification) =>
          verification.organizationId === input.organizationId &&
          (!input.conversationId || verification.conversationId === input.conversationId) &&
          (!input.statuses?.length || input.statuses.includes(verification.status))
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, input.limit)
      .map(cloneVerification);
  }
}

export function createManualPaymentVerificationService(): ManualPaymentVerificationService {
  return new ManualPaymentVerificationService(
    new DrizzleManualPaymentVerificationRepository(),
    new BookingService(new DrizzleBookingRepository())
  );
}

export function serializeManualPaymentVerification(
  verification: ManualPaymentVerification
) {
  return {
    id: verification.id,
    bookingHoldId: verification.bookingHoldId,
    conversationId: verification.conversationId,
    contactId: verification.contactId,
    resourceId: verification.resourceId,
    serviceId: verification.serviceId,
    status: verification.status,
    expectedAmountMinor: verification.expectedAmountMinor,
    currency: verification.currency,
    evidenceMessageId: verification.evidenceMessageId,
    evidenceMediaId: verification.evidenceMediaId,
    evidenceStorageRef: verification.evidenceStorageRef,
    customerReferenceRedacted: verification.customerReferenceRedacted,
    reviewedByUserId: verification.reviewedByUserId,
    reviewedAt: verification.reviewedAt?.toISOString() ?? null,
    reviewNote: verification.reviewNote,
    expiresAt: verification.expiresAt.toISOString(),
    createdAt: verification.createdAt.toISOString(),
    updatedAt: verification.updatedAt.toISOString(),
  };
}

export function manualPaymentVerificationErrorResponse(error: unknown): Response {
  if (error instanceof ManualPaymentVerificationError) {
    if (error.code === "hold_not_found" || error.code === "verification_not_found") {
      return Response.json(
        { error: { code: error.code, message: "Solicitud no encontrada" } },
        { status: 404 }
      );
    }
    if (error.code === "expired") {
      return Response.json(
        { error: { code: "hold_expired", message: "El hold ya expiró" } },
        { status: 409 }
      );
    }
    return Response.json(
      { error: { code: error.code, message: "La solicitud no puede procesarse" } },
      { status: 409 }
    );
  }
  throw error;
}

const createRequestSchema = z.object({
  organizationId: z.string().min(1),
  holdId: z.string().min(1),
  conversationId: z.string().min(1).nullable().optional(),
  expectedAmountMinor: z.coerce.number().int().min(1),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  evidence: z
    .object({
      evidenceMessageId: z.string().min(1).nullable().optional(),
      evidenceMediaId: z.string().min(1).nullable().optional(),
      evidenceStorageRef: z.string().min(1).nullable().optional(),
      customerReferenceRedacted: z.string().max(500).nullable().optional(),
    })
    .optional(),
  expiresAt: z.date().optional(),
  now: z.date().optional(),
});

const inboundEvidenceSchema = z.object({
  organizationId: z.string().min(1),
  conversationId: z.string().min(1),
  contactId: z.string().min(1),
  messageId: z.string().min(1),
  messageType: z.string().min(1),
  text: z.string().nullable().optional(),
  evidenceMediaId: z.string().min(1).nullable().optional(),
  evidenceStorageRef: z.string().min(1).nullable().optional(),
  now: z.date().optional(),
});

function hasEvidence(evidence?: ManualPaymentEvidenceInput): evidence is ManualPaymentEvidenceInput {
  return Boolean(
    evidence?.evidenceMessageId ||
      evidence?.evidenceMediaId ||
      evidence?.evidenceStorageRef ||
      evidence?.customerReferenceRedacted
  );
}

export function isLikelyPaymentEvidence(messageType: string, text: string | null): boolean {
  if (messageType === "image" || messageType === "document") return true;
  if (messageType !== "text" || !text) return false;
  return /\b(comprobante|transferencia|transferi|transferí|pago|pagu[eé]|pagado|deposit[eé]|dep[oó]sito|se[nñ]a|recibo|qr)\b/i.test(
    text
  );
}

function canReview(status: ManualPaymentVerificationStatus): boolean {
  return status === "waiting_for_evidence" || status === "needs_operator_review";
}

function history(input: {
  verification: ManualPaymentVerification;
  fromStatus: ManualPaymentVerificationStatus | null;
  toStatus: ManualPaymentVerificationStatus;
  actorType: ManualPaymentVerificationHistory["actorType"];
  actorId?: string | null;
  reason: string;
  metadataRedacted?: Record<string, unknown> | null;
  now: Date;
}): ManualPaymentVerificationHistory {
  return {
    id: newId("manualPaymentVerificationHistory"),
    organizationId: input.verification.organizationId,
    verificationId: input.verification.id,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    reason: input.reason,
    metadataRedacted: input.metadataRedacted ?? null,
    createdAt: input.now,
  };
}

function redactReference(value: string): string {
  return value.replace(/\b(?=[0-9A-Za-z]*\d)[0-9A-Za-z-]{6,}\b/g, "[redacted]");
}

function normalizeVerification(
  row: typeof schema.manualPaymentVerification.$inferSelect
): ManualPaymentVerification {
  return {
    ...row,
    status: manualPaymentVerificationStatusSchema.parse(row.status),
  };
}

function normalizeHold(row: typeof schema.bookingHold.$inferSelect): BookingHold {
  return {
    ...row,
    status: row.status as BookingHold["status"],
  };
}

function normalizeReservation(row: typeof schema.reservation.$inferSelect): Reservation {
  return {
    ...row,
    status: row.status as Reservation["status"],
  };
}

function normalizePaymentRule(
  row: typeof schema.reservationServicePaymentRule.$inferSelect
): ServicePaymentRule {
  return {
    ...row,
    depositType: row.depositType as ServicePaymentRule["depositType"],
  };
}

function cloneVerification(
  verification: ManualPaymentVerification
): ManualPaymentVerification {
  return {
    ...verification,
    reviewedAt: verification.reviewedAt ? new Date(verification.reviewedAt) : null,
    expiresAt: new Date(verification.expiresAt),
    createdAt: new Date(verification.createdAt),
    updatedAt: new Date(verification.updatedAt),
  };
}

function cloneHistory(history: ManualPaymentVerificationHistory): ManualPaymentVerificationHistory {
  return {
    ...history,
    createdAt: new Date(history.createdAt),
  };
}

function cloneHold(hold: BookingHold): BookingHold {
  return {
    ...hold,
    startsAt: new Date(hold.startsAt),
    endsAt: new Date(hold.endsAt),
    expiresAt: new Date(hold.expiresAt),
    createdAt: new Date(hold.createdAt),
    updatedAt: new Date(hold.updatedAt),
  };
}

function cloneReservation(reservation: Reservation): Reservation {
  return {
    ...reservation,
    startsAt: new Date(reservation.startsAt),
    endsAt: new Date(reservation.endsAt),
    createdAt: new Date(reservation.createdAt),
    updatedAt: new Date(reservation.updatedAt),
  };
}
