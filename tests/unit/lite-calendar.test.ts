import { describe, expect, it } from "vitest";
import { buildLiteCalendarFeed, serializeLiteCalendarFeed } from "@/server/lite/calendar";

describe("Lite OSS scheduler calendar", () => {
  it("maps CRM reservations, Lite requests, payment waits, and manual blocks into calendar categories", () => {
    const feed = buildLiteCalendarFeed({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
      reservations: [
        {
          id: "rsv_1",
          resourceId: "res_house_3",
          resourceName: "Casa 3",
          serviceName: "Estadía",
          customerName: "Ana",
          customerPhone: "595981123456",
          startsAt: new Date("2026-08-02T18:00:00.000Z"),
          endsAt: new Date("2026-08-03T14:00:00.000Z"),
          status: "confirmed",
        },
      ],
      requests: [
        {
          id: "lbr_1",
          resourceId: "res_house_7",
          resourceName: "Casa 7",
          serviceName: "Estadía",
          customerName: "Carlos",
          customerPhone: "595981000111",
          startsAt: new Date("2026-08-05T18:00:00.000Z"),
          endsAt: new Date("2026-08-06T14:00:00.000Z"),
          status: "new",
          customerNote: "Quiere piscina.",
          operatorNote: null,
          paymentExpectedAmountMinor: null,
          paymentCurrency: "PYG",
          paymentStatus: "not_required",
        },
        {
          id: "lbr_2",
          resourceId: "res_house_3",
          resourceName: "Casa 3",
          serviceName: "Estadía",
          customerName: "Marta",
          customerPhone: "595982000222",
          startsAt: new Date("2026-08-07T18:00:00.000Z"),
          endsAt: new Date("2026-08-08T14:00:00.000Z"),
          status: "waiting_for_payment",
          customerNote: null,
          operatorNote: "Pago prometido hoy.",
          paymentExpectedAmountMinor: 255000,
          paymentCurrency: "PYG",
          paymentStatus: "requested",
        },
      ],
      blocks: [
        {
          id: "lab_1",
          resourceId: "res_house_3",
          resourceName: "Casa 3",
          startsAt: new Date("2026-08-09T12:00:00.000Z"),
          endsAt: new Date("2026-08-09T16:00:00.000Z"),
          status: "blocked",
          label: "Limpieza",
          operatorNote: "Equipo interno.",
        },
      ],
    });

    expect(feed.summary).toEqual({
      confirmedReservations: 1,
      pendingRequests: 1,
      paymentPending: 1,
      manualBlocks: 1,
    });
    expect(feed.events.map((event) => event.calendarId)).toEqual([
      "confirmed",
      "request",
      "payment",
      "blocked",
    ]);
    expect(feed.events.find((event) => event.sourceId === "lbr_2")).toMatchObject({
      kind: "payment_pending",
      paymentExpectedDisplay: "Gs. 255.000",
      actionHref: "/lite",
    });
  });

  it("does not expose raw payment evidence in event descriptions", () => {
    const feed = buildLiteCalendarFeed({
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
      reservations: [],
      requests: [
        {
          id: "lbr_secret",
          resourceId: null,
          resourceName: null,
          serviceName: "Turno",
          customerName: "Ana",
          customerPhone: "595981123456",
          startsAt: new Date("2026-08-10T13:00:00.000Z"),
          endsAt: new Date("2026-08-10T14:00:00.000Z"),
          status: "waiting_for_payment",
          customerNote: "Cliente preguntó por disponibilidad.",
          operatorNote: "No incluir comprobante completo en vistas públicas.",
          paymentExpectedAmountMinor: 100000,
          paymentCurrency: "PYG",
          paymentStatus: "evidence_received",
        },
      ],
      blocks: [],
    });

    const serialized = JSON.stringify(serializeLiteCalendarFeed(feed));
    expect(serialized).toContain("Cliente preguntó");
    expect(serialized).not.toContain("paymentEvidenceRedacted");
    expect(serialized).not.toContain("comprobante completo");
  });
});

