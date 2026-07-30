import { describe, expect, it } from "vitest";
import { buildBookingExpiryGuard } from "@/lib/booking-expiry-guard";

const now = new Date("2026-07-30T12:00:00.000Z");

describe("buildBookingExpiryGuard", () => {
  it("shows an urgent warning for payment reviews close to expiration", () => {
    const guard = buildBookingExpiryGuard({
      now,
      session: { status: "awaiting_operator_payment_review", expiresAt: "2026-07-30T12:04:00.000Z" },
      paymentVerification: {
        status: "needs_operator_review",
        expiresAt: "2026-07-30T12:04:00.000Z",
      },
    });

    expect(guard).toMatchObject({
      level: "warning",
      title: "Pago por revisar está por vencer",
      minutesRemaining: 4,
    });
    expect(guard?.message).not.toContain("confirmada");
  });

  it("shows a customer evidence warning when evidence is still missing", () => {
    const guard = buildBookingExpiryGuard({
      now,
      session: { status: "awaiting_payment_evidence", expiresAt: "2026-07-30T12:03:00.000Z" },
      paymentVerification: {
        status: "waiting_for_evidence",
        expiresAt: "2026-07-30T12:03:00.000Z",
      },
    });

    expect(guard).toMatchObject({
      level: "warning",
      title: "Falta comprobante de pago",
      actionHint: "Pedile al cliente que envíe el comprobante.",
    });
  });

  it("shows expired state when the hold or review is already expired", () => {
    const guard = buildBookingExpiryGuard({
      now,
      session: { status: "hold_created", expiresAt: "2026-07-30T11:59:00.000Z" },
      paymentVerification: null,
    });

    expect(guard).toMatchObject({
      level: "expired",
      title: "Hold vencido",
    });
    expect(guard?.message).not.toContain("cancelada");
  });

  it("does not show warnings for terminal booking or payment states", () => {
    expect(
      buildBookingExpiryGuard({
        now,
        session: { status: "confirmed", expiresAt: "2026-07-30T12:01:00.000Z" },
        paymentVerification: {
          status: "approved",
          expiresAt: "2026-07-30T12:01:00.000Z",
        },
      })
    ).toBeNull();
  });

  it("does not show warnings outside the urgency window", () => {
    expect(
      buildBookingExpiryGuard({
        now,
        session: { status: "hold_created", expiresAt: "2026-07-30T12:30:00.000Z" },
        paymentVerification: null,
      })
    ).toBeNull();
  });
});
