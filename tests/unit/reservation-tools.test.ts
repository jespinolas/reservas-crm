import { describe, expect, it } from "vitest";
import {
  RESERVATION_TOOL_VERSION,
  ReservationToolExecutor,
  reservationToolInputSchema,
  type ReservationToolAvailabilityReader,
} from "@/server/ai/reservation-tools";
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
});

function fixture() {
  const apiService = new FakeReservationApiService();
  const availabilityReader = new FakeAvailabilityReader();
  return {
    apiService,
    availabilityReader,
    executor: new ReservationToolExecutor(apiService, availabilityReader),
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
