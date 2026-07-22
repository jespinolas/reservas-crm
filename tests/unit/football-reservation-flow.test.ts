import { describe, expect, it } from "vitest";
import {
  FootballReservationFlow,
  type FootballReservationToolExecutor,
} from "@/server/ai/football-reservation-flow";
import type {
  ReservationToolContext,
  ReservationToolInput,
  ReservationToolResult,
} from "@/server/ai/reservation-tools";

const startsAt = new Date("2026-07-21T21:00:00.000Z");
const endsAt = new Date("2026-07-21T22:00:00.000Z");

describe("FootballReservationFlow", () => {
  it("returns alternatives without creating a hold when requested slot is unavailable", async () => {
    const tools = new FakeTools([
      {
        ok: true,
        tool: "reservation.list_availability",
        slots: [
          {
            resourceId: "res_1",
            serviceId: "rsvc_1",
            startsAt: "2026-07-21T22:00:00.000Z",
            endsAt: "2026-07-21T23:00:00.000Z",
          },
        ],
      },
    ]);

    const result = await new FootballReservationFlow(tools).run(input(), context());

    expect(result.stage).toBe("unavailable");
    expect(result.alternatives).toHaveLength(1);
    expect(tools.calls.map((call) => call.tool)).toEqual(["reservation.list_availability"]);
  });

  it("creates a hold when the requested slot is available", async () => {
    const tools = new FakeTools([availabilityWithRequestedSlot(), holdResult()]);

    const result = await new FootballReservationFlow(tools).run(input({ confirm: false }), context());

    expect(result).toMatchObject({
      ok: true,
      stage: "held",
      hold: { id: "hold_1" },
    });
    expect(tools.calls.map((call) => call.tool)).toEqual([
      "reservation.list_availability",
      "reservation.create_hold",
    ]);
  });

  it("confirms a reservation only when explicitly requested", async () => {
    const tools = new FakeTools([
      availabilityWithRequestedSlot(),
      holdResult(),
      reservationResult(),
    ]);

    const result = await new FootballReservationFlow(tools).run(input({ confirm: true }), context());

    expect(result).toMatchObject({
      ok: true,
      stage: "confirmed",
      reservation: { id: "rsv_1", status: "confirmed" },
    });
    expect(tools.calls.map((call) => call.tool)).toEqual([
      "reservation.list_availability",
      "reservation.create_hold",
      "reservation.confirm_hold",
    ]);
  });

  it("does not expose organization identifiers in output", async () => {
    const tools = new FakeTools([
      availabilityWithRequestedSlot(),
      holdResult(),
      reservationResult(),
    ]);

    const result = await new FootballReservationFlow(tools).run(input({ confirm: true }), context());

    expect(JSON.stringify(result)).not.toContain("organizationId");
    expect(JSON.stringify(result)).not.toContain("org_1");
  });
});

function input(overrides: Partial<Parameters<FootballReservationFlow["run"]>[0]> = {}) {
  return {
    resourceId: "res_1",
    serviceId: "rsvc_1",
    startsAt,
    endsAt,
    idempotencyKey: "idem_1",
    confirm: false,
    ...overrides,
  };
}

function context(): ReservationToolContext {
  return {
    organizationId: "org_1",
    contactId: "ct_1",
  };
}

function availabilityWithRequestedSlot(): ReservationToolResult {
  return {
    ok: true,
    tool: "reservation.list_availability",
    slots: [
      {
        resourceId: "res_1",
        serviceId: "rsvc_1",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
    ],
  };
}

function holdResult(): ReservationToolResult {
  return {
    ok: true,
    tool: "reservation.create_hold",
    hold: {
      id: "hold_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      contactId: "ct_1",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      expiresAt: "2026-07-18T12:10:00.000Z",
      status: "active",
      idempotencyKey: "idem_1",
    },
  };
}

function reservationResult(): ReservationToolResult {
  return {
    ok: true,
    tool: "reservation.confirm_hold",
    reservation: {
      id: "rsv_1",
      resourceId: "res_1",
      serviceId: "rsvc_1",
      contactId: "ct_1",
      holdId: "hold_1",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "confirmed",
    },
  };
}

class FakeTools implements FootballReservationToolExecutor {
  calls: ReservationToolInput[] = [];

  constructor(private readonly results: ReservationToolResult[]) {}

  async execute(input: ReservationToolInput, _context: ReservationToolContext) {
    this.calls.push(input);
    const result = this.results.shift();
    if (!result) throw new Error("missing fake result");
    return result;
  }
}
