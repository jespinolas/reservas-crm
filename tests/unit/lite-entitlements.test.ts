import { describe, expect, it } from "vitest";
import { getLiteTierSalesCopy, getPlanEntitlements } from "@/server/lite/entitlements";

describe("Lite entitlements", () => {
  it("enables manual Lite value while disabling automation dependencies", () => {
    expect(getPlanEntitlements("lite")).toMatchObject({
      publicBookingRequestPage: true,
      manualRequestInbox: true,
      personalWhatsappHandoff: true,
      manualPaymentTracker: true,
      calendarExport: true,
      upgradeReadiness: true,
      whatsappApi: false,
      aiReplies: false,
      autoHold: false,
      paymentProcessor: false,
      googleCalendarOAuth: false,
    });
  });

  it("positions Lite as organized manual reservations without Meta Business", () => {
    expect(getLiteTierSalesCopy().hook).toContain("without WhatsApp Business API or AI");
  });
});
