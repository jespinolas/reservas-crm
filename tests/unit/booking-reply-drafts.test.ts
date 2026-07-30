import { describe, expect, it } from "vitest";
import { buildBookingReplyDraftActions } from "@/lib/booking-reply-drafts";

describe("buildBookingReplyDraftActions", () => {
  it("does not claim confirmation for payment approval without a reservation", () => {
    const actions = buildBookingReplyDraftActions({
      session: {
        status: "awaiting_operator_payment_review",
        resourceId: "res_house_3",
        serviceId: "rsvc_stay",
        requestedStartsAt: "2026-08-01T18:00:00.000Z",
        partySize: 4,
        reservationId: null,
        selectedOptionJsonRedacted: {
          resourceName: "Casa 3",
          serviceName: "Estadía",
          startsAt: "2026-08-01T18:00:00.000Z",
          partySize: 4,
        },
      },
      paymentVerification: { status: "approved" },
    });

    expect(actions.map((action) => action.id)).not.toContain("confirmed");
    expect(actions.map((action) => action.text).join(" ")).not.toContain("confirmada");
  });

  it("creates a confirmation draft only when CRM state supports it", () => {
    const actions = buildBookingReplyDraftActions({
      session: {
        status: "confirmed",
        resourceId: "res_house_3",
        serviceId: "rsvc_stay",
        requestedStartsAt: "2026-08-01T18:00:00.000Z",
        partySize: 4,
        reservationId: "resv_1",
        selectedOptionJsonRedacted: {
          resourceName: "Casa 3",
          serviceName: "Estadía",
          startsAt: "2026-08-01T18:00:00.000Z",
          partySize: 4,
        },
      },
      paymentVerification: { status: "approved" },
    });

    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "confirmed",
        label: "Respuesta: confirmado",
      })
    );
    expect(actions.find((action) => action.id === "confirmed")?.text).toContain(
      "tu reserva está confirmada"
    );
  });

  it("asks for payment evidence without claiming payment or confirmation", () => {
    const actions = buildBookingReplyDraftActions({
      session: {
        status: "awaiting_payment_evidence",
        resourceId: "res_house_3",
        serviceId: "rsvc_stay",
        requestedStartsAt: null,
        partySize: null,
        reservationId: null,
        selectedOptionJsonRedacted: null,
      },
      paymentVerification: { status: "waiting_for_evidence" },
    });
    const evidenceRequest = actions.find((action) => action.id === "payment_evidence_request");

    expect(evidenceRequest).toEqual(
      expect.objectContaining({
        label: "Pedir comprobante",
      })
    );
    expect(actions.map((action) => action.id)).not.toContain("payment_review");
    expect(evidenceRequest?.text).toContain("enviá el comprobante");
    expect(evidenceRequest?.text).toContain("todavía no queda confirmada");
    expect(evidenceRequest?.text).not.toContain("recibimos");
    expect(evidenceRequest?.text).not.toContain("está confirmada");
  });

  it("creates conservative drafts for payment review and rejected states", () => {
    const review = buildBookingReplyDraftActions({
      session: {
        status: "awaiting_operator_payment_review",
        resourceId: "res_house_3",
        serviceId: "rsvc_stay",
        requestedStartsAt: null,
        partySize: null,
        reservationId: null,
        selectedOptionJsonRedacted: null,
      },
      paymentVerification: { status: "needs_operator_review" },
    });
    const rejected = buildBookingReplyDraftActions({
      session: {
        status: "rejected",
        resourceId: "res_house_3",
        serviceId: "rsvc_stay",
        requestedStartsAt: null,
        partySize: null,
        reservationId: null,
        selectedOptionJsonRedacted: null,
      },
      paymentVerification: { status: "rejected" },
    });

    expect(review.map((action) => action.id)).toContain("payment_review");
    expect(rejected.map((action) => action.id)).toContain("payment_rejected");
    expect(rejected.map((action) => action.text).join(" ")).not.toContain(
      "reserva cancelada"
    );
  });
});
