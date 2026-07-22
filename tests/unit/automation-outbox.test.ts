import { describe, expect, it } from "vitest";
import {
  AutomationOutboxService,
  InMemoryAutomationOutboxRepository,
} from "@/server/automation/outbox";

const now = new Date("2026-07-18T12:00:00.000Z");

function fixture() {
  const repository = new InMemoryAutomationOutboxRepository();
  return {
    repository,
    service: new AutomationOutboxService(repository),
  };
}

function enqueueInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org_1",
    eventType: "reservation.confirmed",
    eventVersion: "2026-07-18",
    idempotencyKey: "rsv_1:confirmed",
    payload: { reservationId: "rsv_1" },
    now,
    ...overrides,
  };
}

describe("AutomationOutboxService", () => {
  it("enqueues pending events idempotently by organization and key", async () => {
    const { service } = fixture();

    const first = await service.enqueue(enqueueInput());
    const second = await service.enqueue(enqueueInput({ payload: { reservationId: "other" } }));

    expect(second.id).toBe(first.id);
    expect(second.payload).toEqual({ reservationId: "rsv_1" });
    expect(first).toMatchObject({
      organizationId: "org_1",
      eventType: "reservation.confirmed",
      status: "pending",
      attempts: 0,
    });
  });

  it("claims due pending or failed events as processing", async () => {
    const { service } = fixture();
    const due = await service.enqueue(enqueueInput());
    await service.enqueue(
      enqueueInput({
        idempotencyKey: "future",
        now: new Date("2026-07-18T12:10:00.000Z"),
      })
    );

    const claimed = await service.claimDue({ organizationId: "org_1", now, limit: 10 });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      id: due.id,
      status: "processing",
      lockedAt: now,
    });
  });

  it("marks processing events as delivered", async () => {
    const { service } = fixture();
    const event = await service.enqueue(enqueueInput());
    await service.claimDue({ organizationId: "org_1", now });

    const delivered = await service.markDelivered({
      organizationId: "org_1",
      eventId: event.id,
      now,
    });

    expect(delivered).toMatchObject({
      status: "delivered",
      deliveredAt: now,
      lockedAt: null,
      lastError: null,
    });
  });

  it("marks failures with attempts and retry time", async () => {
    const { service } = fixture();
    const event = await service.enqueue(enqueueInput());
    await service.claimDue({ organizationId: "org_1", now });
    const nextAttemptAt = new Date("2026-07-18T12:05:00.000Z");

    const failed = await service.markFailed({
      organizationId: "org_1",
      eventId: event.id,
      error: "n8n unavailable",
      nextAttemptAt,
      now,
    });

    expect(failed).toMatchObject({
      status: "failed",
      attempts: 1,
      nextAttemptAt,
      lockedAt: null,
      lastError: "n8n unavailable",
    });
  });

  it("marks exhausted events as dead-letter", async () => {
    const { service } = fixture();
    const event = await service.enqueue(enqueueInput());

    const dead = await service.markDeadLetter({
      organizationId: "org_1",
      eventId: event.id,
      error: "max attempts exceeded",
      now,
    });

    expect(dead).toMatchObject({
      status: "dead_letter",
      lockedAt: null,
      lastError: "max attempts exceeded",
    });
  });
});
