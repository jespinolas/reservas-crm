import { describe, expect, it } from "vitest";
import {
  AiBookingOrchestrator,
  type BookingAvailabilityFinder,
} from "@/server/ai/booking-orchestrator";
import {
  AiBookingSessionService,
  InMemoryAiBookingSessionRepository,
} from "@/server/ai/booking-sessions";
import type {
  AvailabilityOptionsResult,
} from "@/server/reservations/availability-options";

const now = new Date("2026-07-29T12:00:00.000Z");

describe("AiBookingOrchestrator", () => {
  it("blocks option lookup when booking is disabled", async () => {
    const { orchestrator, availability } = fixture();

    const result = await orchestrator.presentOptions(input());

    expect(result).toMatchObject({
      ok: false,
      code: "booking_disabled",
    });
    expect(availability.calls).toHaveLength(0);
  });

  it("stores the CRM-selected option and asks for customer confirmation", async () => {
    const { orchestrator, sessions, repository } = fixture();
    await sessions.saveSettings({
      organizationId: "org_1",
      mode: "manual_payment_confirm",
      readinessStatus: "ready",
      now,
    });

    const result = await orchestrator.presentOptions(input());

    expect(result).toMatchObject({
      ok: true,
      selectedOption: {
        resourceId: "res_3",
        resourceName: "Casa 3",
        serviceId: "rsvc_house",
        serviceName: "Estadía",
        partySize: 4,
        amountMinor: 800000,
        depositRequired: true,
        depositAmountMinor: 240000,
      },
    });
    expect(result.ok && result.reply).toContain("¿Querés que te la guarde temporalmente?");
    const session = [...repository.sessions.values()][0]!;
    expect(session).toMatchObject({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      status: "awaiting_customer_confirmation",
      selectedOptionJsonRedacted: {
        resourceId: "res_3",
        serviceId: "rsvc_house",
      },
    });
    expect(repository.events.map((event) => event.eventType)).toEqual([
      "ai_booking.session_started",
      "ai_booking.option_presented",
      "ai_booking.awaiting_customer_confirmation",
    ]);
  });

  it("keeps the session in showing_options when no options are available", async () => {
    const { orchestrator, sessions, repository, availability } = fixture();
    availability.result = {
      options: [],
      diagnostics: {
        candidateResourceCount: 1,
        capacityRejectedCount: 0,
        scheduleSlotCount: 0,
        conflictRejectedCount: 0,
        returnedCount: 0,
      },
    };
    await sessions.saveSettings({
      organizationId: "org_1",
      mode: "auto_hold",
      readinessStatus: "ready",
      now,
    });

    const result = await orchestrator.presentOptions(input());

    expect(result).toMatchObject({
      ok: true,
      options: [],
      selectedOption: null,
    });
    const session = [...repository.sessions.values()][0]!;
    expect(session).toMatchObject({
      status: "showing_options",
      selectedOptionJsonRedacted: null,
    });
  });
});

function fixture() {
  const repository = new InMemoryAiBookingSessionRepository();
  const sessions = new AiBookingSessionService(repository);
  const availability = new FakeAvailabilityFinder();
  const orchestrator = new AiBookingOrchestrator(sessions, availability);
  return { orchestrator, sessions, repository, availability };
}

function input() {
  return {
    context: {
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      now,
    },
    serviceId: "rsvc_house",
    rangeStart: new Date("2026-08-01T00:00:00.000Z"),
    rangeEnd: new Date("2026-08-03T00:00:00.000Z"),
    partySize: 4,
    maxOptions: 3,
  };
}

class FakeAvailabilityFinder implements BookingAvailabilityFinder {
  calls: unknown[] = [];
  result: AvailabilityOptionsResult = {
    options: [
      {
        resource: {
          id: "res_3",
          name: "Casa 3",
          kind: "house",
          capacity: 6,
          location: "San Bernardino",
          description: "Casa equipada.",
        },
        service: {
          id: "rsvc_house",
          name: "Estadía",
          durationMinutes: 1200,
        },
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        endsAt: new Date("2026-08-02T14:00:00.000Z"),
        partySize: 4,
        priceEstimate: {
          amountMinor: 800000,
          currency: "PYG",
          display: "Gs. 800.000",
        },
        depositDue: {
          amountMinor: 240000,
          currency: "PYG",
          display: "Gs. 240.000",
          type: "percentage",
        },
      },
    ],
    diagnostics: {
      candidateResourceCount: 1,
      capacityRejectedCount: 0,
      scheduleSlotCount: 1,
      conflictRejectedCount: 0,
      returnedCount: 1,
    },
  };

  async findAvailableOptions(
    input: Parameters<BookingAvailabilityFinder["findAvailableOptions"]>[0]
  ): Promise<AvailabilityOptionsResult> {
    this.calls.push(input);
    return this.result;
  }
}
