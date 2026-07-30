import { describe, expect, it } from "vitest";
import { serializeAiBookingTimeline } from "@/server/ai/booking-timeline";
import type { AiBookingSessionEvent } from "@/server/ai/booking-sessions";

describe("serializeAiBookingTimeline", () => {
  it("sorts events oldest to newest and returns operator-readable labels", () => {
    const timeline = serializeAiBookingTimeline([
      event({
        id: "evt_2",
        eventType: "ai_booking.hold_created",
        actorType: "system",
        createdAt: new Date("2026-07-30T12:02:00.000Z"),
      }),
      event({
        id: "evt_1",
        eventType: "ai_booking.session_started",
        actorType: "ai",
        createdAt: new Date("2026-07-30T12:00:00.000Z"),
      }),
    ]);

    expect(timeline.map((item) => item.id)).toEqual(["evt_1", "evt_2"]);
    expect(timeline[0]).toMatchObject({
      label: "Reserva iniciada",
      actorLabel: "IA",
    });
    expect(timeline[1]).toMatchObject({
      label: "Hold creado",
      actorLabel: "CRM",
    });
  });

  it("omits raw actor IDs and summarizes redacted metadata only", () => {
    const timeline = serializeAiBookingTimeline([
      event({
        actorId: "user_sensitive",
        metadataRedacted: {
          fromStatus: "showing_options",
          toStatus: "awaiting_customer_confirmation",
          optionsShown: 2,
          rawPaymentEvidence: "should_not_be_rendered",
        },
      }),
    ]);
    const payload = JSON.stringify(timeline);

    expect(payload).not.toContain("user_sensitive");
    expect(payload).not.toContain("rawPaymentEvidence");
    expect(payload).not.toContain("should_not_be_rendered");
    expect(timeline[0]?.metadataSummary).toBe(
      "showing options → awaiting customer confirmation · 2 opciones"
    );
  });
});

function event(overrides: Partial<AiBookingSessionEvent> = {}): AiBookingSessionEvent {
  return {
    id: "evt_1",
    organizationId: "org_1",
    sessionId: "session_1",
    eventType: "ai_booking.awaiting_customer_confirmation",
    actorType: "operator",
    actorId: "user_1",
    metadataRedacted: null,
    createdAt: new Date("2026-07-30T12:00:00.000Z"),
    ...overrides,
  };
}
