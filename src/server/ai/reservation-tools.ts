import { z } from "zod";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  AiBookingSessionError,
  AiBookingSessionService,
  DrizzleAiBookingSessionRepository,
  type AiBookingSession,
  type AiBookingSettings,
} from "@/server/ai/booking-sessions";
import {
  BookingError,
  type BookingHold,
  type Reservation,
} from "@/server/reservations/booking";
import {
  createReservationApiService,
  reservationApiErrorResponse,
  serializeHold,
  serializeReservation,
  type ReservationApiService,
} from "@/server/reservations/api";
import {
  createManualPaymentVerificationService,
  type ManualPaymentVerification,
} from "@/server/payments/manual-verifications";
import type { AvailabilitySlot } from "@/server/reservations/availability";

export const RESERVATION_TOOL_VERSION = "2026-07-18";

const baseToolSchema = z
  .object({
    version: z.literal(RESERVATION_TOOL_VERSION),
  })
  .strict();

export const reservationToolInputSchema = z.discriminatedUnion("tool", [
  baseToolSchema
    .extend({
      tool: z.literal("reservation.list_availability"),
      resourceId: z.string().trim().min(1),
      serviceId: z.string().trim().min(1),
      rangeStart: z.coerce.date(),
      rangeEnd: z.coerce.date(),
      maxSlots: z.number().int().min(1).max(50).default(10),
    })
    .strict(),
  baseToolSchema
    .extend({
      tool: z.literal("reservation.create_hold"),
      resourceId: z.string().trim().min(1),
      serviceId: z.string().trim().min(1),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      idempotencyKey: z.string().trim().min(1).max(200),
    })
    .strict(),
  baseToolSchema
    .extend({
      tool: z.literal("reservation.create_hold_from_option"),
      customerConfirmed: z.literal(true),
    })
    .strict(),
  baseToolSchema
    .extend({
      tool: z.literal("reservation.confirm_hold"),
      holdId: z.string().trim().min(1),
    })
    .strict(),
  baseToolSchema
    .extend({
      tool: z.literal("payment.manual_verification_status"),
      holdId: z.string().trim().min(1).optional(),
    })
    .strict(),
]);

export type ReservationToolInput = z.infer<typeof reservationToolInputSchema>;

export type ReservationToolContext = {
  organizationId: string;
  contactId: string | null;
  conversationId?: string | null;
  now?: Date;
};

export type ManualPaymentToolStatus =
  | "not_requested"
  | "waiting_for_evidence"
  | "needs_operator_review"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export type ManualPaymentToolStatusResult = {
  status: ManualPaymentToolStatus;
  holdId: string | null;
  expectedAmountMinor: number | null;
  currency: string | null;
  expiresAt: string | null;
};

export type ReservationToolResult =
  | {
      ok: true;
      tool: "reservation.list_availability";
      slots: ReturnType<typeof serializeSlot>[];
    }
  | {
      ok: true;
      tool: "reservation.create_hold";
      hold: ReturnType<typeof serializeHold>;
    }
  | {
      ok: true;
      tool: "reservation.create_hold_from_option";
      hold: ReturnType<typeof serializeHold>;
      bookingSession: {
        id: string;
        status: AiBookingSession["status"];
      };
      paymentVerification: ReturnType<typeof serializeAiPaymentVerification> | null;
    }
  | {
      ok: true;
      tool: "reservation.confirm_hold";
      reservation: ReturnType<typeof serializeReservation>;
    }
  | {
      ok: true;
      tool: "payment.manual_verification_status";
      payment: ManualPaymentToolStatusResult;
    }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "booking_conflict"
        | "booking_not_active"
        | "hold_expired"
        | "hold_not_found"
        | "resource_not_found"
        | "service_not_found"
        | "contact_not_found"
        | "booking_session_not_found"
        | "invalid_booking_session"
        | "internal";
      message: string;
    };

export interface ReservationToolAvailabilityReader {
  listSlots(input: {
    organizationId: string;
    resourceId: string;
    serviceId: string;
    rangeStart: Date;
    rangeEnd: Date;
  }): Promise<AvailabilitySlot[]>;
}

export interface ManualPaymentStatusReader {
  getManualVerificationStatus(input: {
    organizationId: string;
    contactId: string | null;
    conversationId?: string | null;
    holdId?: string;
  }): Promise<ManualPaymentToolStatusResult>;
}

export interface AiBookingSessionCoordinator {
  getSettings(organizationId: string): Promise<AiBookingSettings>;
  getSessionByConversation(input: {
    organizationId: string;
    conversationId: string;
  }): Promise<AiBookingSession | null>;
  transition(input: Parameters<AiBookingSessionService["transition"]>[0]): Promise<AiBookingSession>;
}

export interface ManualPaymentRequestCreator {
  createReviewRequest(input: {
    organizationId: string;
    holdId: string;
    conversationId?: string | null;
    expectedAmountMinor: number;
    currency: string;
    expiresAt?: Date;
    now?: Date;
  }): Promise<ManualPaymentVerification>;
}

export class ReservationToolExecutor {
  constructor(
    private readonly apiService: Pick<ReservationApiService, "createHold" | "confirmHold">,
    private readonly availabilityReader: ReservationToolAvailabilityReader,
    private readonly paymentStatusReader: ManualPaymentStatusReader = new EmptyManualPaymentStatusReader(),
    private readonly bookingSessionCoordinator: AiBookingSessionCoordinator =
      new EmptyAiBookingSessionCoordinator(),
    private readonly paymentRequestCreator: ManualPaymentRequestCreator =
      new EmptyManualPaymentRequestCreator()
  ) {}

  async execute(
    rawInput: unknown,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const parsed = reservationToolInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        code: "invalid_input",
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
          .join("; "),
      };
    }
    const rangeError = validateRange(parsed.data);
    if (rangeError) return rangeError;

    try {
      switch (parsed.data.tool) {
        case "reservation.list_availability":
          return await this.listAvailability(parsed.data, context);
        case "reservation.create_hold":
          return await this.createHold(parsed.data, context);
        case "reservation.create_hold_from_option":
          return await this.createHoldFromOption(parsed.data, context);
        case "reservation.confirm_hold":
          return await this.confirmHold(parsed.data, context);
        case "payment.manual_verification_status":
          return await this.getManualVerificationStatus(parsed.data, context);
      }
    } catch (error) {
      return reservationToolError(error);
    }
  }

  private async listAvailability(
    input: Extract<ReservationToolInput, { tool: "reservation.list_availability" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const slots = await this.availabilityReader.listSlots({
      organizationId: context.organizationId,
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
    });
    return {
      ok: true,
      tool: input.tool,
      slots: slots.slice(0, input.maxSlots).map(serializeSlot),
    };
  }

  private async createHold(
    input: Extract<ReservationToolInput, { tool: "reservation.create_hold" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const hold = await this.apiService.createHold({
      organizationId: context.organizationId,
      body: {
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        contactId: context.contactId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        idempotencyKey: input.idempotencyKey,
      },
      now: context.now,
    });
    return { ok: true, tool: input.tool, hold: serializeHold(hold as BookingHold) };
  }

  private async createHoldFromOption(
    input: Extract<ReservationToolInput, { tool: "reservation.create_hold_from_option" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    if (!input.customerConfirmed) {
      return {
        ok: false,
        code: "invalid_input",
        message: "customerConfirmed must be true",
      };
    }
    if (!context.conversationId) {
      return {
        ok: false,
        code: "invalid_input",
        message: "conversationId is required to create a hold from a booking option",
      };
    }

    const settings = await this.bookingSessionCoordinator.getSettings(context.organizationId);
    if (
      settings.readinessStatus !== "ready" ||
      (settings.mode !== "auto_hold" && settings.mode !== "manual_payment_confirm")
    ) {
      return {
        ok: false,
        code: "booking_not_active",
        message: "AI booking mode is not ready for auto-holds",
      };
    }

    const session = await this.bookingSessionCoordinator.getSessionByConversation({
      organizationId: context.organizationId,
      conversationId: context.conversationId,
    });
    if (!session) {
      return {
        ok: false,
        code: "booking_session_not_found",
        message: "Booking session was not found",
      };
    }
    if (session.status !== "awaiting_customer_confirmation" || !session.selectedOptionJsonRedacted) {
      return {
        ok: false,
        code: "invalid_booking_session",
        message: "Booking session does not have a customer-confirmed selected option",
      };
    }
    if (session.contactId && context.contactId && session.contactId !== context.contactId) {
      return {
        ok: false,
        code: "invalid_booking_session",
        message: "Booking session contact does not match the conversation context",
      };
    }

    const option = session.selectedOptionJsonRedacted;
    const hold = await this.apiService.createHold({
      organizationId: context.organizationId,
      body: {
        resourceId: option.resourceId,
        serviceId: option.serviceId,
        contactId: context.contactId,
        startsAt: new Date(option.startsAt),
        endsAt: new Date(option.endsAt),
        idempotencyKey: createOptionHoldIdempotencyKey({
          organizationId: context.organizationId,
          conversationId: context.conversationId,
          sessionId: session.id,
          optionId: option.optionId ?? null,
          resourceId: option.resourceId,
          serviceId: option.serviceId,
          startsAt: option.startsAt,
          endsAt: option.endsAt,
        }),
      },
      now: context.now,
    });
    const holdCreatedSession = await this.bookingSessionCoordinator.transition({
      session,
      toStatus: "hold_created",
      actorType: "ai",
      eventType: "ai_booking.hold_created",
      bookingHoldId: (hold as BookingHold).id,
      resourceId: option.resourceId,
      serviceId: option.serviceId,
      requestedStartsAt: new Date(option.startsAt),
      requestedEndsAt: new Date(option.endsAt),
      partySize: option.partySize ?? session.partySize,
      expiresAt: (hold as BookingHold).expiresAt,
      metadataRedacted: {
        tool: "reservation.create_hold_from_option",
        customerConfirmed: true,
      },
      now: context.now,
    });
    const payment = await this.maybeCreatePaymentVerification({
      context,
      hold: hold as BookingHold,
      session: holdCreatedSession,
      option,
    });
    return {
      ok: true,
      tool: input.tool,
      hold: serializeHold(hold as BookingHold),
      bookingSession: {
        id: payment.session.id,
        status: payment.session.status,
      },
      paymentVerification: payment.verification
        ? serializeAiPaymentVerification(payment.verification)
        : null,
    };
  }

  private async maybeCreatePaymentVerification(input: {
    context: ReservationToolContext;
    hold: BookingHold;
    session: AiBookingSession;
    option: NonNullable<AiBookingSession["selectedOptionJsonRedacted"]>;
  }): Promise<{ session: AiBookingSession; verification: ManualPaymentVerification | null }> {
    if (
      !input.option.depositRequired ||
      input.option.depositAmountMinor == null ||
      input.option.depositAmountMinor <= 0 ||
      !input.option.currency
    ) {
      return { session: input.session, verification: null };
    }

    const verification = await this.paymentRequestCreator.createReviewRequest({
      organizationId: input.context.organizationId,
      holdId: input.hold.id,
      conversationId: input.context.conversationId ?? null,
      expectedAmountMinor: input.option.depositAmountMinor,
      currency: input.option.currency,
      expiresAt: input.hold.expiresAt,
      now: input.context.now,
    });
    const session = await this.bookingSessionCoordinator.transition({
      session: input.session,
      toStatus: "awaiting_payment_evidence",
      actorType: "ai",
      eventType: "ai_booking.payment_evidence_requested",
      manualPaymentVerificationId: verification.id,
      metadataRedacted: {
        verificationId: verification.id,
        expectedAmountMinor: verification.expectedAmountMinor,
        currency: verification.currency,
      },
      now: input.context.now,
    });
    return { session, verification };
  }

  private async confirmHold(
    input: Extract<ReservationToolInput, { tool: "reservation.confirm_hold" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const reservation = await this.apiService.confirmHold({
      organizationId: context.organizationId,
      holdId: input.holdId,
      now: context.now,
    });
    return {
      ok: true,
      tool: input.tool,
      reservation: serializeReservation(reservation as Reservation),
    };
  }

  private async getManualVerificationStatus(
    input: Extract<ReservationToolInput, { tool: "payment.manual_verification_status" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const payment = await this.paymentStatusReader.getManualVerificationStatus({
      organizationId: context.organizationId,
      contactId: context.contactId,
      conversationId: context.conversationId ?? null,
      holdId: input.holdId,
    });
    return { ok: true, tool: input.tool, payment };
  }
}

function validateRange(input: ReservationToolInput): ReservationToolResult | null {
  if (input.tool === "reservation.list_availability" && input.rangeEnd <= input.rangeStart) {
    return {
      ok: false,
      code: "invalid_input",
      message: "rangeEnd must be greater than rangeStart",
    };
  }
  if (input.tool === "reservation.create_hold" && input.endsAt <= input.startsAt) {
    return {
      ok: false,
      code: "invalid_input",
      message: "endsAt must be greater than startsAt",
    };
  }
  return null;
}

export function createReservationToolExecutor(
  availabilityReader: ReservationToolAvailabilityReader
): ReservationToolExecutor {
  return new ReservationToolExecutor(
    createReservationApiService(),
    availabilityReader,
    new DrizzleManualPaymentStatusReader(),
    new AiBookingSessionService(new DrizzleAiBookingSessionRepository()),
    createManualPaymentVerificationService()
  );
}

class EmptyManualPaymentStatusReader implements ManualPaymentStatusReader {
  async getManualVerificationStatus(): Promise<ManualPaymentToolStatusResult> {
    return {
      status: "not_requested",
      holdId: null,
      expectedAmountMinor: null,
      currency: null,
      expiresAt: null,
    };
  }
}

class EmptyAiBookingSessionCoordinator implements AiBookingSessionCoordinator {
  async getSettings(organizationId: string): Promise<AiBookingSettings> {
    const now = new Date();
    return {
      id: "aibs_empty",
      organizationId,
      mode: "disabled",
      enabledByUserId: null,
      enabledAt: null,
      readinessLastCheckedAt: null,
      readinessStatus: "unknown",
      createdAt: now,
      updatedAt: now,
    };
  }

  async getSessionByConversation(): Promise<AiBookingSession | null> {
    return null;
  }

  async transition(): Promise<AiBookingSession> {
    throw new AiBookingSessionError("invalid_input");
  }
}

class EmptyManualPaymentRequestCreator implements ManualPaymentRequestCreator {
  async createReviewRequest(): Promise<ManualPaymentVerification> {
    throw new Error("manual_payment_request_creator_not_configured");
  }
}

export class DrizzleManualPaymentStatusReader implements ManualPaymentStatusReader {
  constructor(private readonly db = getDb()) {}

  async getManualVerificationStatus(input: {
    organizationId: string;
    contactId: string | null;
    conversationId?: string | null;
    holdId?: string;
  }): Promise<ManualPaymentToolStatusResult> {
    const conditions = [
      eq(schema.manualPaymentVerification.organizationId, input.organizationId),
    ];
    if (input.holdId) {
      conditions.push(eq(schema.manualPaymentVerification.bookingHoldId, input.holdId));
    } else if (input.conversationId) {
      conditions.push(eq(schema.manualPaymentVerification.conversationId, input.conversationId));
    } else if (input.contactId) {
      conditions.push(eq(schema.manualPaymentVerification.contactId, input.contactId));
    } else {
      return {
        status: "not_requested",
        holdId: null,
        expectedAmountMinor: null,
        currency: null,
        expiresAt: null,
      };
    }
    if (input.contactId) {
      conditions.push(eq(schema.manualPaymentVerification.contactId, input.contactId));
    }

    const rows = await this.db
      .select()
      .from(schema.manualPaymentVerification)
      .where(and(...conditions))
      .orderBy(desc(schema.manualPaymentVerification.createdAt))
      .limit(1);
    const verification = rows[0];
    if (!verification) {
      return {
        status: "not_requested",
        holdId: input.holdId ?? null,
        expectedAmountMinor: null,
        currency: null,
        expiresAt: null,
      };
    }
    return {
      status: verification.status as ManualPaymentToolStatus,
      holdId: verification.bookingHoldId,
      expectedAmountMinor: verification.expectedAmountMinor,
      currency: verification.currency,
      expiresAt: verification.expiresAt.toISOString(),
    };
  }
}

function serializeSlot(slot: AvailabilitySlot) {
  return {
    resourceId: slot.resourceId,
    serviceId: slot.serviceId,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
  };
}

function reservationToolError(error: unknown): ReservationToolResult {
  if (error instanceof BookingError) {
    if (error.code === "conflict") {
      return {
        ok: false,
        code: "booking_conflict",
        message: "Requested time is no longer available",
      };
    }
    if (error.code === "not_found") {
      return { ok: false, code: "hold_not_found", message: "Booking hold was not found" };
    }
    if (error.code === "expired") {
      return { ok: false, code: "hold_expired", message: "Booking hold has expired" };
    }
    return { ok: false, code: "booking_not_active", message: "Booking hold is not active" };
  }

  if (error instanceof AiBookingSessionError) {
    return {
      ok: false,
      code: "invalid_booking_session",
      message: "Booking session transition is not allowed",
    };
  }

  const response = reservationApiErrorResponseOrNull(error);
  if (response) return response;
  return { ok: false, code: "internal", message: "Reservation tool failed" };
}

function createOptionHoldIdempotencyKey(input: {
  organizationId: string;
  conversationId: string;
  sessionId: string;
  optionId: string | null;
  resourceId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
}): string {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
  return `ai-option-hold:${digest}`;
}

function reservationApiErrorResponseOrNull(error: unknown): ReservationToolResult | null {
  try {
    const response = reservationApiErrorResponse(error);
    return {
      ok: false,
      code: responseStatusToCode(response.status),
      message: responseStatusToMessage(response.status),
    };
  } catch {
    return null;
  }
}

function responseStatusToCode(status: number): Exclude<
  Extract<ReservationToolResult, { ok: false }>["code"],
  "invalid_input" | "internal"
> {
  if (status === 404) return "resource_not_found";
  return "booking_conflict";
}

function responseStatusToMessage(status: number): string {
  return status === 404
    ? "Reservation tool referenced a missing CRM record"
    : "Reservation tool request cannot be completed";
}

function serializeAiPaymentVerification(verification: ManualPaymentVerification) {
  return {
    id: verification.id,
    bookingHoldId: verification.bookingHoldId,
    status: verification.status,
    expectedAmountMinor: verification.expectedAmountMinor,
    currency: verification.currency,
    expiresAt: verification.expiresAt.toISOString(),
  };
}
