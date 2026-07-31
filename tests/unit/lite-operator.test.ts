import { describe, expect, it } from "vitest";
import { buildLiteLostMoneyReport } from "@/server/lite/operator";

describe("Lite operator leverage", () => {
  it("estimates lost money by unconfirmed request bucket and tracks unknown value", () => {
    const report = buildLiteLostMoneyReport(
      [
        {
          status: "declined",
          serviceId: "rsvc_house",
          serviceName: "Casa",
          quote: {
            priceEstimate: { amountMinor: 800000, currency: "PYG", display: "Gs. 800.000" },
          },
        },
        {
          status: "waiting_for_payment",
          serviceId: "rsvc_house",
          serviceName: "Casa",
          quote: {
            priceEstimate: { amountMinor: 800000, currency: "PYG", display: "Gs. 800.000" },
          },
        },
        {
          status: "new",
          serviceId: "rsvc_spa",
          serviceName: "Spa",
          quote: { priceEstimate: null },
        },
        {
          status: "confirmed",
          serviceId: "rsvc_house",
          serviceName: "Casa",
          quote: {
            priceEstimate: { amountMinor: 800000, currency: "PYG", display: "Gs. 800.000" },
          },
        },
      ],
      "PYG"
    );

    expect(report.estimatedTotalMinor).toBe(1_600_000);
    expect(report.unknownValueCount).toBe(1);
    expect(report.buckets.find((bucket) => bucket.key === "declined")).toMatchObject({
      count: 1,
      estimatedMinor: 800000,
    });
    expect(report.buckets.find((bucket) => bucket.key === "new_or_needs_reply")).toMatchObject({
      count: 1,
      unknownValueCount: 1,
    });
    expect(report.topServices[0]).toMatchObject({
      serviceId: "rsvc_house",
      count: 2,
      estimatedMinor: 1_600_000,
    });
  });

  it("does not count confirmed reservations as lost demand", () => {
    const report = buildLiteLostMoneyReport(
      [
        {
          status: "confirmed",
          serviceId: "rsvc_1",
          serviceName: "Turno",
          quote: {
            priceEstimate: { amountMinor: 100000, currency: "PYG", display: "Gs. 100.000" },
          },
        },
      ],
      "PYG"
    );

    expect(report.estimatedTotalMinor).toBe(0);
    expect(report.topServices).toHaveLength(0);
  });
});
