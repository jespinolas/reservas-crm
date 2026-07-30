import { describe, expect, it } from "vitest";
import { buildBookingAttention, buildBookingAttentionMap } from "@/lib/booking-attention";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("booking attention", () => {
  it("creates a payment-review attention badge", () => {
    const attention = buildBookingAttention({
      now,
      verification: {
        conversationId: "conv_1",
        status: "needs_operator_review",
        expiresAt: "2026-08-01T12:30:00.000Z",
      },
    });

    expect(attention).toMatchObject({
      level: "review",
      label: "Revisar pago",
      title: "Comprobante recibido; falta validar pago",
    });
  });

  it("creates a missing-evidence attention badge", () => {
    const attention = buildBookingAttention({
      now,
      verification: {
        conversationId: "conv_1",
        status: "waiting_for_evidence",
        expiresAt: "2026-08-01T12:30:00.000Z",
      },
    });

    expect(attention).toMatchObject({
      level: "waiting",
      label: "Falta comprobante",
    });
  });

  it("prioritizes urgent and expired items over normal statuses", () => {
    const urgent = buildBookingAttention({
      now,
      verification: {
        conversationId: "conv_1",
        status: "waiting_for_evidence",
        expiresAt: "2026-08-01T12:04:30.000Z",
      },
    });
    const expired = buildBookingAttention({
      now,
      verification: {
        conversationId: "conv_1",
        status: "needs_operator_review",
        expiresAt: "2026-08-01T11:59:59.000Z",
      },
    });

    expect(urgent).toMatchObject({ level: "urgent", label: "Vence pronto" });
    expect(expired).toMatchObject({ level: "expired", label: "Vencido" });
  });

  it("keeps the highest-priority attention per conversation", () => {
    const attentionMap = buildBookingAttentionMap(
      [
        {
          conversationId: "conv_1",
          status: "needs_operator_review",
          expiresAt: "2026-08-01T12:30:00.000Z",
        },
        {
          conversationId: "conv_1",
          status: "waiting_for_evidence",
          expiresAt: "2026-08-01T11:59:00.000Z",
        },
        {
          conversationId: null,
          status: "needs_operator_review",
          expiresAt: "2026-08-01T11:59:00.000Z",
        },
      ],
      now
    );

    expect(attentionMap.get("conv_1")).toMatchObject({
      level: "expired",
      label: "Vencido",
    });
    expect(attentionMap.has("conv_2")).toBe(false);
  });
});
