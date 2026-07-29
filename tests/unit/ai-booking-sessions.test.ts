import { describe, expect, it } from "vitest";
import {
  AiBookingSessionError,
  AiBookingSessionService,
  InMemoryAiBookingSessionRepository,
  selectedBookingOptionSchema,
} from "@/server/ai/booking-sessions";

const now = new Date("2026-07-29T12:00:00.000Z");

describe("AI booking sessions", () => {
  it("defaults booking settings to disabled", async () => {
    const service = new AiBookingSessionService(new InMemoryAiBookingSessionRepository());

    const settings = await service.getSettings("org_1");

    expect(settings).toMatchObject({
      organizationId: "org_1",
      mode: "disabled",
      enabledByUserId: null,
      enabledAt: null,
      readinessStatus: "unknown",
    });
  });

  it("saves explicit booking settings without enabling by default", async () => {
    const repository = new InMemoryAiBookingSessionRepository();
    const service = new AiBookingSessionService(repository);

    await service.saveSettings({
      organizationId: "org_1",
      mode: "suggest_only",
      enabledByUserId: "user_1",
      readinessStatus: "not_ready",
      readinessLastCheckedAt: now,
      now,
    });

    const settings = await service.getSettings("org_1");
    expect(settings).toMatchObject({
      mode: "suggest_only",
      enabledByUserId: "user_1",
      readinessStatus: "not_ready",
      readinessLastCheckedAt: now,
      enabledAt: now,
    });
  });

  it("starts one idempotent session per organization conversation", async () => {
    const repository = new InMemoryAiBookingSessionRepository();
    const service = new AiBookingSessionService(repository);

    const first = await service.startSession({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      partySize: 4,
      actorType: "ai",
      now,
    });
    const second = await service.startSession({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      partySize: 6,
      actorType: "ai",
      now: new Date("2026-07-29T12:01:00.000Z"),
    });

    expect(second).toEqual(first);
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({
      sessionId: first.id,
      eventType: "ai_booking.session_started",
      actorType: "ai",
    });
  });

  it("transitions sessions with an audit event", async () => {
    const repository = new InMemoryAiBookingSessionRepository();
    const service = new AiBookingSessionService(repository);
    const session = await service.startSession({
      organizationId: "org_1",
      conversationId: "cv_1",
      contactId: "ct_1",
      now,
    });

    const updated = await service.transition({
      session,
      toStatus: "showing_options",
      actorType: "system",
      selectedOptionJsonRedacted: {
        optionId: "opt_1",
        resourceId: "res_1",
        resourceName: "Casa 3",
        serviceId: "rsvc_1",
        startsAt: "2026-08-01T18:00:00.000Z",
        endsAt: "2026-08-02T14:00:00.000Z",
        partySize: 4,
        currency: "PYG",
        amountMinor: 800000,
        depositRequired: true,
        depositAmountMinor: 240000,
      },
      metadataRedacted: { optionsShown: 1 },
      now: new Date("2026-07-29T12:02:00.000Z"),
    });

    expect(updated.status).toBe("showing_options");
    expect(updated.selectedOptionJsonRedacted).toMatchObject({
      resourceName: "Casa 3",
      depositAmountMinor: 240000,
    });
    const events = await service.listEvents(session.id);
    expect(events[0]).toMatchObject({
      eventType: "ai_booking.showing_options",
      actorType: "system",
      metadataRedacted: { optionsShown: 1 },
    });
  });

  it("fails closed on invalid transitions", async () => {
    const service = new AiBookingSessionService(new InMemoryAiBookingSessionRepository());
    const session = await service.startSession({
      organizationId: "org_1",
      conversationId: "cv_1",
      now,
    });

    await expect(
      service.transition({
        session,
        toStatus: "confirmed",
        actorType: "ai",
        reservationId: "rsv_1",
        now,
      })
    ).rejects.toMatchObject(new AiBookingSessionError("invalid_transition"));
  });

  it("rejects model-supplied authority fields in selected option JSON", () => {
    const parsed = selectedBookingOptionSchema.safeParse({
      resourceId: "res_1",
      serviceId: "rsvc_1",
      startsAt: "2026-08-01T18:00:00.000Z",
      endsAt: "2026-08-02T14:00:00.000Z",
      organizationId: "org_attacker",
      paymentApproved: true,
      reservationConfirmed: true,
    });

    expect(parsed.success).toBe(false);
  });
});
