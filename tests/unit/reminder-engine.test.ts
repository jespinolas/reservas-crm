import { describe, expect, it } from "vitest";
import {
  InMemoryReservationReminderRepository,
  ReservationReminderService,
} from "@/server/reminders/engine";

const now = new Date("2026-07-18T12:00:00.000Z");
const startsAt = new Date("2026-07-19T15:00:00.000Z");

function fixture() {
  const repository = new InMemoryReservationReminderRepository();
  return {
    repository,
    service: new ReservationReminderService(repository),
  };
}

function scheduleInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org_1",
    reservationId: "rsv_1",
    kind: "pre_arrival" as const,
    reservationStartsAt: startsAt,
    leadMinutes: 120,
    now,
    ...overrides,
  };
}

describe("ReservationReminderService", () => {
  it("schedules pending reminders relative to reservation start", async () => {
    const { service } = fixture();

    const reminder = await service.scheduleReminder(scheduleInput());

    expect(reminder).toMatchObject({
      organizationId: "org_1",
      reservationId: "rsv_1",
      kind: "pre_arrival",
      dueAt: new Date("2026-07-19T13:00:00.000Z"),
      nextAttemptAt: new Date("2026-07-19T13:00:00.000Z"),
      status: "pending",
      attempts: 0,
      lockedAt: null,
      sentAt: null,
      lastError: null,
    });
  });

  it("schedules idempotently by organization, reservation, and kind", async () => {
    const { service } = fixture();

    const first = await service.scheduleReminder(scheduleInput());
    const second = await service.scheduleReminder(
      scheduleInput({
        leadMinutes: 30,
        reservationStartsAt: new Date("2026-07-20T15:00:00.000Z"),
      })
    );

    expect(second.id).toBe(first.id);
    expect(second.dueAt).toEqual(new Date("2026-07-19T13:00:00.000Z"));
  });

  it("claims due pending or failed reminders as processing", async () => {
    const { service } = fixture();
    const due = await service.scheduleReminder(
      scheduleInput({ reservationStartsAt: new Date("2026-07-18T13:00:00.000Z"), leadMinutes: 60 })
    );
    await service.scheduleReminder(
      scheduleInput({
        reservationId: "rsv_future",
        reservationStartsAt: new Date("2026-07-18T16:00:00.000Z"),
        leadMinutes: 60,
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

  it("marks processing reminders as sent", async () => {
    const { service } = fixture();
    const reminder = await service.scheduleReminder(
      scheduleInput({ reservationStartsAt: new Date("2026-07-18T13:00:00.000Z"), leadMinutes: 60 })
    );
    await service.claimDue({ organizationId: "org_1", now });

    const sent = await service.markSent({
      organizationId: "org_1",
      reminderId: reminder.id,
      now,
    });

    expect(sent).toMatchObject({
      status: "sent",
      sentAt: now,
      lockedAt: null,
      lastError: null,
    });
  });

  it("marks failures with attempts and retry time", async () => {
    const { service } = fixture();
    const reminder = await service.scheduleReminder(
      scheduleInput({ reservationStartsAt: new Date("2026-07-18T13:00:00.000Z"), leadMinutes: 60 })
    );
    await service.claimDue({ organizationId: "org_1", now });
    const nextAttemptAt = new Date("2026-07-18T12:05:00.000Z");

    const failed = await service.markFailed({
      organizationId: "org_1",
      reminderId: reminder.id,
      error: "template send unavailable",
      nextAttemptAt,
      now,
    });

    expect(failed).toMatchObject({
      status: "failed",
      attempts: 1,
      nextAttemptAt,
      lockedAt: null,
      lastError: "template send unavailable",
    });
  });

  it("does not claim cancelled or skipped reminders", async () => {
    const { service } = fixture();
    const cancelled = await service.scheduleReminder(
      scheduleInput({ reservationStartsAt: new Date("2026-07-18T13:00:00.000Z"), leadMinutes: 60 })
    );
    const skipped = await service.scheduleReminder(
      scheduleInput({
        reservationId: "rsv_skipped",
        reservationStartsAt: new Date("2026-07-18T13:00:00.000Z"),
        leadMinutes: 60,
      })
    );

    await service.markCancelled({ organizationId: "org_1", reminderId: cancelled.id, now });
    await service.markSkipped({
      organizationId: "org_1",
      reminderId: skipped.id,
      reason: "inside WhatsApp service window",
      now,
    });

    const claimed = await service.claimDue({ organizationId: "org_1", now });

    expect(claimed).toEqual([]);
  });
});
