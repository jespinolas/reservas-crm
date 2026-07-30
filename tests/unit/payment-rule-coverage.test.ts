import { describe, expect, it } from "vitest";
import { buildPaymentRuleCoverage } from "@/lib/payment-rule-coverage";

describe("buildPaymentRuleCoverage", () => {
  it("reports active services without rules as missing", () => {
    const coverage = buildPaymentRuleCoverage({
      services: [
        { id: "svc_1", name: "Estadía", active: true },
        { id: "svc_2", name: "Spa", active: true },
      ],
      rulesByServiceId: new Map([
        ["svc_1", { serviceId: "svc_1", amountMinor: 500000, active: true }],
      ]),
    });

    expect(coverage).toEqual({
      totalActiveServices: 2,
      configuredServices: 1,
      missingServiceNames: ["Spa"],
      ready: false,
    });
  });

  it("treats inactive or price-less rules as missing", () => {
    const coverage = buildPaymentRuleCoverage({
      services: [
        { id: "svc_1", name: "Estadía", active: true },
        { id: "svc_2", name: "Masaje", active: true },
      ],
      rulesByServiceId: new Map([
        ["svc_1", { serviceId: "svc_1", amountMinor: 500000, active: false }],
        ["svc_2", { serviceId: "svc_2", amountMinor: null, active: true }],
      ]),
    });

    expect(coverage).toMatchObject({
      configuredServices: 0,
      missingServiceNames: ["Estadía", "Masaje"],
      ready: false,
    });
  });

  it("returns ready when every active service has an active priced rule", () => {
    const coverage = buildPaymentRuleCoverage({
      services: [
        { id: "svc_1", name: "Estadía", active: true },
        { id: "svc_inactive", name: "Archivado", active: false },
      ],
      rulesByServiceId: new Map([
        ["svc_1", { serviceId: "svc_1", amountMinor: 500000, active: true }],
      ]),
    });

    expect(coverage).toEqual({
      totalActiveServices: 1,
      configuredServices: 1,
      missingServiceNames: [],
      ready: true,
    });
  });
});
