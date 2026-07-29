import { describe, expect, it } from "vitest";
import {
  RESERVATION_TOOL_VERSION,
  ReservationToolExecutor,
  reservationToolInputSchema,
  type AiBookingSessionCoordinator,
  type ManualPaymentStatusReader,
  type ReservationToolAvailabilityReader,
} from "@/server/ai/reservation-tools";
import type {
  AiBookingSession,
  AiBookingSettings,
} from "@/server/ai/booking-sessions";
import {
  BookingError,
  type BookingHold,
  type Reservation,
} from "@/server/reservations/booking";

const now = new Date("2026-07-18T12:00:00.000Z");

describe("reservation AI tool contracts", () => {
  it("rejects model-supplied organization identifiers", () => {
    const parsed = reservationToolInputSchema.safeParse({
      version: RESERVATION_TOOL_VERSION,
      tool: "reservation.create_hold",
      organizationId: "org_attacker",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      startsAt: "2026-07-20T21:00:00.000Z",
      endsAt: "2026-07-20T22:00:00.000Z",
      idempotencyKey: "idem_1",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects model-supplied payment authority context", () => {
    const parsed = reservationToolInputSchema.safeParse({
      version: RESERVATION_TOOL_VERSION,
      tool: "payment.manual_verification_status",
      organizationId: "org_attacker",
      contactId: "ct_attacker",
      conversationId: "cv_attacker",
      holdId: "hold_1",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects model-supplied booking authority fields for create-hold-from-option", () => {
    const parsed = reservationToolInputSchema.safeParse({
      version: RESERVATION_TOOL_VERSION,
      tool: "reservation.create_hold_from_option",
      customerConfirmed: true,
      resourceId: "res_attacker",
      startsAt: "2026-07-20T21:00:00.000Z",
      idempotencyKey: "model_supplied",
      paymentApproved: true,
    });

    expect(parsed.success).toBe(false);
  });

  it("returns serialized availability slots", async () => {
    const { executor, availabilityReader } = fixture();
    availabilityReader.slots = [
      {
        resourceId: "res_1",
        serviceId: "rsvc_1",
        startsAt: new Date("2026-07-20T21:00:00.000Z"),
        endsAt: new Date("2026-07-20T22:00:00.000Z"),
      },
    ];

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.list_availability",
        resourceId: "res_1",
        serviceId: "rsvc_1",
        rangeStart: "2026-07-20T00:00:00.000Z",
        rangeEnd: "2026-07-21T00:00:00.000Z",
      },
      context()
    );

    expect(result).toEqual({
      ok: true,
      tool: "reservation.list_availability",
      slots: [
        {
          resourceId: "res_1",
          serviceId: "rsvc_1",
          startsAt: "2026-07-20T21:00:00.000Z",
          endsAt: "2026-07-20T22:00:00.000Z",
        },
      ],
    });
    expect(availabilityReader.calls[0]).toMatchObject({
      organizationId: "org_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
    });
  });

  it("creates holds with runtime organization and contact context", async () => {
    const { executor, apiService } = fixture();

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.create_hold",
        resourceId: "res_1",
        serviceId: "rsvc_1",
        startsAt: "2026-07-20T21:00:00.000Z",
        endsAt: "2026-07-20T22:00:00.000Z",
        idempotencyKey: "idem_1",
      },
      context()
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.tool === "reservation.create_hold") {
      expect(result.hold).toMatchObject({
        id: "hold_1",
        contactId: "ct_1",
        idempotencyKey: "idem_1",
      });
      expect(result.hold).not.toHaveProperty("organizationId");
    }
    expect(apiService.createHoldCalls[0]).toMatchObject({
      organizationId: "org_1",
      body: {
        contactId: "ct_1",
      },
    });
  });

  it("confirms holds and returns serialized reservations", async () => {
    const { executor } = fixture();

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.confirm_hold",
        holdId: "hold_1",
      },
      context()
    );

    expect(result).toMatchObject({
      ok: true,
      tool: "reservation.confirm_hold",
      reservation: {
        id: "rsv_1",
        holdId: "hold_1",
        status: "confirmed",
      },
    });
    if (result.ok && result.tool === "reservation.confirm_hold") {
      expect(result.reservation).not.toHaveProperty("organizationId");
    }
  });

  it("maps booking conflicts to typed tool errors", async () => {
    const { executor, apiService } = fixture();
    apiService.createHoldError = new BookingError("conflict");

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.create_hold",
        resourceId: "res_1",
        serviceId: "rsvc_1",
        startsAt: "2026-07-20T21:00:00.000Z",
        endsAt: "2026-07-20T22:00:00.000Z",
        idempotencyKey: "idem_1",
      },
      context()
    );

    expect(result).toEqual({
      ok: false,
      code: "booking_conflict",
      message: "Requested time is no longer available",
    });
  });

  it("creates holds only from the CRM-selected booking session option", async () => {
    const { executor, apiService, bookingSessionCoordinator } = fixture();
    bookingSessionCoordinator.settings = {
      ...bookingSessionCoordinator.settings,
      mode: "manual_payment_confirm",
      readinessStatus: "ready",
    };
    bookingSessionCoordinator.session = {
      ...bookingSessionCoordinator.session,
      status: "awaiting_customer_confirmation",
      selectedOptionJsonRedacted: {
        optionId: "opt_casa_3",
        resourceId: "res_3",
        resourceName: "Casa 3",
        serviceId: "rsvc_house",
        startsAt: "2026-07-25T18:00:00.000Z",
        endsAt: "2026-07-26T14:00:00.000Z",
        partySize: 4,
        depositRequired: true,
        depositAmountMinor: 240000,
      },
    };

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.create_hold_from_option",
        customerConfirmed: true,
      },
      { ...context(), conversationId: "cv_1" }
    );

    expect(result).toMatchObject({
      ok: true,
      tool: "reservation.create_hold_from_option",
      bookingSession: {
        id: "aibses_1",
        status: "hold_created",
      },
    });
    expect(apiService.createHoldCalls[0]).toMatchObject({
      organizationId: "org_1",
      body: {
        resourceId: "res_3",
        serviceId: "rsvc_house",
        contactId: "ct_1",
        startsAt: new Date("2026-07-25T18:00:00.000Z"),
        endsAt: new Date("2026-07-26T14:00:00.000Z"),
      },
    });
    const call = apiService.createHoldCalls[0] as {
      body: { idempotencyKey: string };
    };
    expect(call.body.idempotencyKey).toMatch(/^ai-option-hold:/);
    expect(call.body.idempotencyKey).not.toBe("model_supplied");
    expect(bookingSessionCoordinator.transitionCalls[0]).toMatchObject({
      toStatus: "hold_created",
      actorType: "ai",
      bookingHoldId: "hold_1",
      resourceId: "res_3",
      serviceId: "rsvc_house",
    });
  });

  it("blocks create-hold-from-option when AI booking is not ready", async () => {
    const { executor, apiService } = fixture();

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.create_hold_from_option",
        customerConfirmed: true,
      },
      { ...context(), conversationId: "cv_1" }
    );

    expect(result).toEqual({
      ok: false,
      code: "booking_not_active",
      message: "AI booking mode is not ready for auto-holds",
    });
    expect(apiService.createHoldCalls).toHaveLength(0);
  });

  it("blocks create-hold-from-option without a customer-confirmed session option", async () => {
    const { executor, apiService, bookingSessionCoordinator } = fixture();
    bookingSessionCoordinator.settings = {
      ...bookingSessionCoordinator.settings,
      mode: "auto_hold",
      readinessStatus: "ready",
    };

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.create_hold_from_option",
        customerConfirmed: true,
      },
      { ...context(), conversationId: "cv_1" }
    );

    expect(result).toEqual({
      ok: false,
      code: "invalid_booking_session",
      message: "Booking session does not have a customer-confirmed selected option",
    });
    expect(apiService.createHoldCalls).toHaveLength(0);
  });

  it("returns AI-safe manual payment status without evidence or operator details", async () => {
    const { executor, paymentStatusReader } = fixture();
    paymentStatusReader.result = {
      status: "needs_operator_review",
      holdId: "hold_1",
      expectedAmountMinor: 150000,
      currency: "PYG",
      expiresAt: "2026-07-18T12:10:00.000Z",
    };

    const result = await executor.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "payment.manual_verification_status",
        holdId: "hold_1",
      },
      { ...context(), conversationId: "cv_1" }
    );

    expect(result).toEqual({
      ok: true,
      tool: "payment.manual_verification_status",
      payment: {
        status: "needs_operator_review",
        holdId: "hold_1",
        expectedAmountMinor: 150000,
        currency: "PYG",
        expiresAt: "2026-07-18T12:10:00.000Z",
      },
    });
    expect(JSON.stringify(result)).not.toContain("evidence");
    expect(JSON.stringify(result)).not.toContain("reviewedBy");
    expect(paymentStatusReader.calls[0]).toMatchObject({
      organizationId: "org_1",
      contactId: "ct_1",
      conversationId: "cv_1",
      holdId: "hold_1",
    });
  });
});

function fixture() {
  const apiService = new FakeReservationApiService();
  const availabilityReader = new FakeAvailabilityReader();
  const paymentStatusReader = new FakePaymentStatusReader();
  const bookingSessionCoordinator = new FakeBookingSessionCoordinator();
  return {
    apiService,
    availabilityReader,
    paymentStatusReader,
    bookingSessionCoordinator,
    executor: new ReservationToolExecutor(
      apiService,
      availabilityReader,
      paymentStatusReader,
      bookingSessionCoordinator
    ),
  };
}

function context() {
  return {
    organizationId: "org_1",
    contactId: "ct_1",
    now,
  };
}

class FakeReservationApiService {
  createHoldCalls: unknown[] = [];
  confirmHoldCalls: unknown[] = [];
  createHoldError: unknown = null;

  async createHold(input: unknown): Promise<BookingHold> {
    this.createHoldCalls.push(input);
    if (this.createHoldError) throw this.createHoldError;
    return {
      id: "hold_1",
      organizationId: "org_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      contactId: "ct_1",
      startsAt: new Date("2026-07-20T21:00:00.000Z"),
      endsAt: new Date("2026-07-20T22:00:00.000Z"),
      expiresAt: new Date("2026-07-18T12:10:00.000Z"),
      status: "active",
      idempotencyKey: "idem_1",
      createdAt: now,
      updatedAt: now,
    };
  }

  async confirmHold(input: unknown): Promise<Reservation> {
    this.confirmHoldCalls.push(input);
    return {
      id: "rsv_1",
      organizationId: "org_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      contactId: "ct_1",
      holdId: "hold_1",
      startsAt: new Date("2026-07-20T21:00:00.000Z"),
      endsAt: new Date("2026-07-20T22:00:00.000Z"),
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
  }
}

class FakeAvailabilityReader implements ReservationToolAvailabilityReader {
  slots: Awaited<ReturnType<ReservationToolAvailabilityReader["listSlots"]>> = [];
  calls: unknown[] = [];

  async listSlots(input: Parameters<ReservationToolAvailabilityReader["listSlots"]>[0]) {
    this.calls.push(input);
    return this.slots;
  }
}

class FakePaymentStatusReader implements ManualPaymentStatusReader {
  result: Awaited<ReturnType<ManualPaymentStatusReader["getManualVerificationStatus"]>> = {
    status: "not_requested",
    holdId: null,
    expectedAmountMinor: null,
    currency: null,
    expiresAt: null,
  };
  calls: unknown[] = [];

  async getManualVerificationStatus(
    input: Parameters<ManualPaymentStatusReader["getManualVerificationStatus"]>[0]
  ) {
    this.calls.push(input);
    return this.result;
  }
}

class FakeBookingSessionCoordinator implements AiBookingSessionCoordinator {
  settings: AiBookingSettings = {
    id: "aibs_1",
    organizationId: "org_1",
    mode: "disabled",
    enabledByUserId: null,
    enabledAt: null,
    readinessLastCheckedAt: null,
    readinessStatus: "unknown",
    createdAt: now,
    updatedAt: now,
  };
  session: AiBookingSession = {
    id: "aibses_1",
    organizationId: "org_1",
    conversationId: "cv_1",
    contactId: "ct_1",
    status: "collecting_intent",
    serviceId: null,
    resourceId: null,
    requestedStartsAt: null,
    requestedEndsAt: null,
    partySize: null,
    selectedOptionJsonRedacted: null,
    bookingHoldId: null,
    manualPaymentVerificationId: null,
    reservationId: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  transitionCalls: unknown[] = [];

  async getSettings(): Promise<AiBookingSettings> {
    return this.settings;
  }

  async getSessionByConversation(input: {
    organizationId: string;
    conversationId: string;
  }): Promise<AiBookingSession | null> {
    return this.session.organizationId === input.organizationId &&
      this.session.conversationId === input.conversationId
      ? this.session
      : null;
  }

  async transition(input: Parameters<AiBookingSessionCoordinator["transition"]>[0]) {
    this.transitionCalls.push(input);
    this.session = {
      ...input.session,
      status: input.toStatus,
      bookingHoldId: input.bookingHoldId ?? input.session.bookingHoldId,
      serviceId: input.serviceId ?? input.session.serviceId,
      resourceId: input.resourceId ?? input.session.resourceId,
      requestedStartsAt: input.requestedStartsAt ?? input.session.requestedStartsAt,
      requestedEndsAt: input.requestedEndsAt ?? input.session.requestedEndsAt,
      partySize: input.partySize ?? input.session.partySize,
      expiresAt: input.expiresAt ?? input.session.expiresAt,
      updatedAt: input.now ?? now,
    };
    return this.session;
  }
}
