export type PaymentRuleCoverageService = {
  id: string;
  name: string;
  active: boolean;
};

export type PaymentRuleCoverageRule = {
  serviceId: string;
  amountMinor: number | null;
  active: boolean;
} | null;

export type PaymentRuleCoverageSummary = {
  totalActiveServices: number;
  configuredServices: number;
  missingServiceNames: string[];
  ready: boolean;
};

export function buildPaymentRuleCoverage(input: {
  services: PaymentRuleCoverageService[];
  rulesByServiceId: Map<string, PaymentRuleCoverageRule>;
}): PaymentRuleCoverageSummary {
  const activeServices = input.services.filter((service) => service.active);
  const missingServiceNames: string[] = [];
  let configuredServices = 0;

  for (const service of activeServices) {
    const rule = input.rulesByServiceId.get(service.id) ?? null;
    if (rule?.active && rule.amountMinor != null) {
      configuredServices += 1;
    } else {
      missingServiceNames.push(service.name);
    }
  }

  return {
    totalActiveServices: activeServices.length,
    configuredServices,
    missingServiceNames,
    ready: activeServices.length > 0 && missingServiceNames.length === 0,
  };
}
