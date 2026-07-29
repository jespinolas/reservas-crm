import { describe, expect, it } from "vitest";
import {
  calculateServicePaymentQuote,
  InMemoryServicePaymentRuleRepository,
  ServicePaymentRuleError,
  ServicePaymentRuleService,
  type ServicePaymentRule,
} from "@/server/reservations/payment-rules";

const now = new Date("2026-07-29T12:00:00.000Z");

function fixture() {
  const repository = new InMemoryServicePaymentRuleRepository();
  repository.services.add("rsvc_1");
  return {
    repository,
    service: new ServicePaymentRuleService(repository),
  };
}

function paymentRule(overrides: Partial<ServicePaymentRule> = {}): ServicePaymentRule {
  return {
    id: "rpay_1",
    organizationId: "org_1",
    serviceId: "rsvc_1",
    currency: "PYG",
    amountMinor: 500000,
    depositType: "percentage",
    depositAmountMinor: null,
    depositPercentage: 30,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("ServicePaymentRuleService", () => {
  it("creates and updates one scoped payment rule per service", async () => {
    const { repository, service } = fixture();

    const created = await service.upsertRule({
      organizationId: "org_1",
      serviceId: "rsvc_1",
      rule: {
        amountMinor: 500000,
        depositType: "percentage",
        depositPercentage: 30,
      },
      now,
    });

    expect(created).toMatchObject({
      organizationId: "org_1",
      serviceId: "rsvc_1",
      currency: "PYG",
      amountMinor: 500000,
      depositType: "percentage",
      depositPercentage: 30,
    });

    const updated = await service.upsertRule({
      organizationId: "org_1",
      serviceId: "rsvc_1",
      rule: {
        amountMinor: 600000,
        depositType: "fixed",
        depositAmountMinor: 150000,
      },
      now: new Date("2026-07-29T12:01:00.000Z"),
    });

    expect(updated.id).toBe(created.id);
    expect(repository.rules.size).toBe(1);
    expect(updated).toMatchObject({
      amountMinor: 600000,
      depositType: "fixed",
      depositAmountMinor: 150000,
      depositPercentage: null,
    });
  });

  it("rejects rules for missing services", async () => {
    const { service } = fixture();

    await expect(
      service.upsertRule({
        organizationId: "org_1",
        serviceId: "missing",
        rule: { amountMinor: 500000, depositType: "none" },
        now,
      })
    ).rejects.toMatchObject({ code: "service_not_found" });
  });

  it("requires deterministic inputs for percentage and full deposits", async () => {
    const { service } = fixture();

    await expect(
      service.upsertRule({
        organizationId: "org_1",
        serviceId: "rsvc_1",
        rule: { depositType: "percentage", depositPercentage: 30 },
        now,
      })
    ).rejects.toBeInstanceOf(ServicePaymentRuleError);

    await expect(
      service.upsertRule({
        organizationId: "org_1",
        serviceId: "rsvc_1",
        rule: { depositType: "full" },
        now,
      })
    ).rejects.toMatchObject({ code: "invalid_full_deposit" });
  });
});

describe("calculateServicePaymentQuote", () => {
  it("calculates percentage deposits from CRM-owned price", () => {
    expect(calculateServicePaymentQuote(paymentRule())).toMatchObject({
      priceEstimate: {
        amountMinor: 500000,
        currency: "PYG",
      },
      depositDue: {
        amountMinor: 150000,
        currency: "PYG",
        type: "percentage",
      },
    });
  });

  it("caps fixed deposits at the known service price", () => {
    expect(
      calculateServicePaymentQuote(
        paymentRule({
          amountMinor: 100000,
          depositType: "fixed",
          depositAmountMinor: 150000,
          depositPercentage: null,
        })
      ).depositDue
    ).toMatchObject({
      amountMinor: 100000,
      type: "fixed",
    });
  });

  it("does not require payment when the rule is inactive or deposit type is none", () => {
    expect(calculateServicePaymentQuote(paymentRule({ active: false }))).toEqual({
      priceEstimate: null,
      depositDue: null,
    });
    expect(
      calculateServicePaymentQuote(
        paymentRule({ depositType: "none", depositPercentage: null })
      ).depositDue
    ).toBeNull();
  });
});
