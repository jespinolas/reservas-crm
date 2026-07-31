import { describe, expect, it } from "vitest";
import {
  buildLiteHandoffTemplate,
  normalizePhoneForWaMe,
} from "@/server/lite/whatsapp-handoff";

describe("Lite WhatsApp handoff", () => {
  it("builds deterministic copy and a personal wa.me link", () => {
    const template = buildLiteHandoffTemplate({
      kind: "payment_request",
      businessName: "Casa Quinta",
      customerName: "Ana",
      customerPhone: "+595 981 123456",
      serviceName: "Estadía",
      resourceName: "Casa 3",
      startsAt: new Date("2026-08-01T18:00:00.000Z"),
      endsAt: new Date("2026-08-02T14:00:00.000Z"),
      partySize: 4,
      depositDisplay: "Gs. 150.000",
      paymentInstructions: "Transferencia a cuenta redacted.",
    });

    expect(template.body).toContain("Casa 3");
    expect(template.body).toContain("Gs. 150.000");
    expect(template.waMeUrl).toContain("https://wa.me/595981123456");
    expect(template.disclaimer).toContain("no envía este mensaje automáticamente");
  });

  it("includes the end date when a Lite booking spans multiple local days", () => {
    const template = buildLiteHandoffTemplate({
      kind: "payment_request",
      businessName: "Casa Quinta",
      customerName: "Ana",
      customerPhone: "+595 981 123456",
      serviceName: "Estadía",
      resourceName: "Casa 3",
      startsAt: new Date("2026-08-01T19:00:00.000Z"),
      endsAt: new Date("2026-08-02T19:00:00.000Z"),
      partySize: 4,
      depositDisplay: "Gs. 150.000",
    });

    expect(template.body).toContain("1 ago. 2026");
    expect(template.body).toContain("2 ago. 2026");
  });

  it("falls back to copy-only when the phone is not valid", () => {
    expect(normalizePhoneForWaMe("abc")).toBeNull();
    expect(
      buildLiteHandoffTemplate({
        kind: "confirmation",
        businessName: "Negocio",
        customerName: "Ana",
        customerPhone: "abc",
        serviceName: "Turno",
        startsAt: new Date("2026-08-01T18:00:00.000Z"),
        endsAt: new Date("2026-08-01T19:00:00.000Z"),
        partySize: 1,
      }).sendMode
    ).toBe("copy_only");
  });
});
