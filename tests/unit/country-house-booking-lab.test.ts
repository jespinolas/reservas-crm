import { describe, expect, it } from "vitest";
import { runCountryHouseBookingLab } from "@/server/lab/country-house-booking";

describe("country-house booking lab", () => {
  it("runs the House 3 Saturday flow through CRM services without external credentials", async () => {
    const result = await runCountryHouseBookingLab();

    expect(result.externalCredentialsRequired).toBe(false);
    expect(result.catalog.resourceCount).toBe(10);
    expect(result.catalog.resources.map((resource) => resource.name)).toContain("Casa 3");
    expect(result.request).toMatchObject({
      targetLocalDate: "2026-08-01",
      requestedResourceName: "Casa 3",
      partySize: 4,
    });
    expect(result.availability.optionCount).toBeGreaterThan(0);
    expect(result.availability.house3OptionId).toBe("opt_country_house_lab_house_3");
    expect(result.payment).toMatchObject({
      expectedAmountMinor: 150000,
      currency: "PYG",
      statusBeforeApproval: "needs_operator_review",
      statusAfterApproval: "approved",
    });
    expect(result.booking).toMatchObject({
      sessionStatusBeforeApproval: "awaiting_operator_payment_review",
      finalSessionStatus: "confirmed",
      holdStatusAfterApproval: "converted",
      reservationStatus: "confirmed",
    });
    expect(result.booking.reservationId).toMatch(/^rsv_/);
    expect(result.transcript.map((entry) => entry.role)).toEqual([
      "customer",
      "ai",
      "customer",
      "crm",
      "operator",
      "crm",
    ]);
  });
});
