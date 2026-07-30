import { describe, expect, it } from "vitest";
import { buildBookingWorkQueueInboxAction } from "@/lib/booking-work-queue-link";

describe("buildBookingWorkQueueInboxAction", () => {
  it("builds a conversation-scoped inbox link", () => {
    const action = buildBookingWorkQueueInboxAction({
      conversationId: "conv_123",
      status: "needs_operator_review",
    });

    expect(action).toEqual({
      href: "/inbox?conversation=conv_123",
      label: "Abrir chat",
      title: "Abrí el chat para revisar contexto antes de decidir el pago.",
    });
  });

  it("encodes the conversation id and does not include message text", () => {
    const action = buildBookingWorkQueueInboxAction({
      conversationId: "conv_1 with spaces",
      status: "waiting_for_evidence",
    });

    expect(action?.href).toBe("/inbox?conversation=conv_1%20with%20spaces");
    expect(action?.href).not.toContain("comprobante");
    expect(action?.title).toContain("pedir el comprobante");
  });

  it("returns no action without a linked conversation", () => {
    expect(
      buildBookingWorkQueueInboxAction({
        conversationId: null,
        status: "waiting_for_evidence",
      })
    ).toBeNull();
  });
});
