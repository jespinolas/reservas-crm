import { describe, expect, it } from "vitest";
import { buildPendingBookingWorkQueue } from "@/lib/pending-booking-work-queue";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("buildPendingBookingWorkQueue", () => {
  it("computes operational summary counts", () => {
    const queue = buildPendingBookingWorkQueue(
      [
        {
          id: "pay_review",
          status: "needs_operator_review",
          expiresAt: "2026-08-01T12:30:00.000Z",
          createdAt: "2026-08-01T11:55:00.000Z",
        },
        {
          id: "missing_evidence",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:30:00.000Z",
          createdAt: "2026-08-01T11:20:00.000Z",
        },
        {
          id: "urgent",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:04:00.000Z",
          createdAt: "2026-08-01T11:55:00.000Z",
        },
        {
          id: "expired",
          status: "needs_operator_review",
          expiresAt: "2026-08-01T11:59:00.000Z",
          createdAt: "2026-08-01T11:55:00.000Z",
        },
      ],
      now
    );

    expect(queue.summary).toEqual({
      total: 4,
      needsReview: 2,
      waitingForEvidence: 2,
      urgent: 1,
      expired: 1,
      stale: 1,
    });
  });

  it("sorts expired and urgent items before normal pending work", () => {
    const queue = buildPendingBookingWorkQueue(
      [
        {
          id: "waiting",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:30:00.000Z",
        },
        {
          id: "review",
          status: "needs_operator_review",
          expiresAt: "2026-08-01T12:20:00.000Z",
        },
        {
          id: "urgent",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:04:00.000Z",
        },
        {
          id: "expired",
          status: "needs_operator_review",
          expiresAt: "2026-08-01T11:59:00.000Z",
        },
      ],
      now
    );

    expect(queue.items.map((item) => item.id)).toEqual([
      "expired",
      "urgent",
      "review",
      "waiting",
    ]);
  });

  it("uses conservative action text for missing evidence", () => {
    const queue = buildPendingBookingWorkQueue(
      [
        {
          id: "missing",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:30:00.000Z",
        },
      ],
      now
    );

    expect(queue.items[0]).toMatchObject({
      level: "waiting",
      label: "Falta comprobante",
      actionText: "Pedile al cliente que envíe el comprobante para continuar.",
    });
    expect(queue.items[0]?.actionText).not.toContain("Confirmá");
  });

  it("marks old pending evidence work as stale without overriding urgent or review priority", () => {
    const queue = buildPendingBookingWorkQueue(
      [
        {
          id: "stale_waiting",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:30:00.000Z",
          createdAt: "2026-08-01T11:20:00.000Z",
        },
        {
          id: "fresh_waiting",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:30:00.000Z",
          createdAt: "2026-08-01T11:50:00.000Z",
        },
        {
          id: "urgent_waiting",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T12:04:00.000Z",
          createdAt: "2026-08-01T11:20:00.000Z",
        },
        {
          id: "review",
          status: "needs_operator_review",
          expiresAt: "2026-08-01T12:30:00.000Z",
          createdAt: "2026-08-01T11:20:00.000Z",
        },
      ],
      now
    );

    expect(queue.summary.stale).toBe(1);
    expect(queue.items.map((item) => item.id)).toEqual([
      "urgent_waiting",
      "review",
      "stale_waiting",
      "fresh_waiting",
    ]);
    expect(queue.items.find((item) => item.id === "stale_waiting")).toMatchObject({
      level: "stale",
      label: "Sin atender",
    });
  });
});
