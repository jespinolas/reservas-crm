import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/db/ids";
import { getDb, schema } from "@/lib/db";

export const depositTypeSchema = z.enum(["none", "fixed", "percentage", "full"]);

export const servicePaymentRuleInputSchema = z.object({
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default("PYG"),
  amountMinor: z.coerce.number().int().min(0).nullable().optional(),
  depositType: depositTypeSchema.default("none"),
  depositAmountMinor: z.coerce.number().int().min(0).nullable().optional(),
  depositPercentage: z.coerce.number().int().min(0).max(100).nullable().optional(),
  active: z.boolean().default(true),
});

export type DepositType = z.infer<typeof depositTypeSchema>;

export type ServicePaymentRuleInput = z.input<typeof servicePaymentRuleInputSchema>;

export type ServicePaymentRule = {
  id: string;
  organizationId: string;
  serviceId: string;
  currency: string;
  amountMinor: number | null;
  depositType: DepositType;
  depositAmountMinor: number | null;
  depositPercentage: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MoneyAmount = {
  amountMinor: number;
  currency: string;
  display: string;
};

export type ServicePaymentQuote = {
  priceEstimate: MoneyAmount | null;
  depositDue: (MoneyAmount & { type: DepositType }) | null;
};

export interface ServicePaymentRuleRepository {
  findService(organizationId: string, serviceId: string): Promise<{ id: string } | null>;
  findRule(organizationId: string, serviceId: string): Promise<ServicePaymentRule | null>;
  saveRule(rule: ServicePaymentRule): Promise<ServicePaymentRule>;
}

export class ServicePaymentRuleError extends Error {
  constructor(
    readonly code:
      | "service_not_found"
      | "invalid_fixed_deposit"
      | "invalid_percentage_deposit"
      | "invalid_full_deposit"
  ) {
    super(code);
    this.name = "ServicePaymentRuleError";
  }
}

export class ServicePaymentRuleService {
  constructor(private readonly repository: ServicePaymentRuleRepository) {}

  async getRule(organizationId: string, serviceId: string): Promise<ServicePaymentRule | null> {
    const service = await this.repository.findService(organizationId, serviceId);
    if (!service) throw new ServicePaymentRuleError("service_not_found");
    return this.repository.findRule(organizationId, serviceId);
  }

  async upsertRule(input: {
    organizationId: string;
    serviceId: string;
    rule: ServicePaymentRuleInput;
    now?: Date;
  }): Promise<ServicePaymentRule> {
    const service = await this.repository.findService(input.organizationId, input.serviceId);
    if (!service) throw new ServicePaymentRuleError("service_not_found");

    const parsed = servicePaymentRuleInputSchema.parse(input.rule);
    validateRule(parsed);

    const existing = await this.repository.findRule(input.organizationId, input.serviceId);
    const now = input.now ?? new Date();
    return this.repository.saveRule({
      id: existing?.id ?? newId("reservationServicePaymentRule"),
      organizationId: input.organizationId,
      serviceId: input.serviceId,
      currency: parsed.currency,
      amountMinor: parsed.amountMinor ?? null,
      depositType: parsed.depositType,
      depositAmountMinor:
        parsed.depositType === "fixed" ? parsed.depositAmountMinor ?? null : null,
      depositPercentage:
        parsed.depositType === "percentage" ? parsed.depositPercentage ?? null : null,
      active: parsed.active,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }
}

export class DrizzleServicePaymentRuleRepository implements ServicePaymentRuleRepository {
  constructor(private readonly db = getDb()) {}

  async findService(organizationId: string, serviceId: string): Promise<{ id: string } | null> {
    const rows = await this.db
      .select({ id: schema.reservationService.id })
      .from(schema.reservationService)
      .where(
        and(
          eq(schema.reservationService.organizationId, organizationId),
          eq(schema.reservationService.id, serviceId)
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async findRule(organizationId: string, serviceId: string): Promise<ServicePaymentRule | null> {
    const rows = await this.db
      .select()
      .from(schema.reservationServicePaymentRule)
      .where(
        and(
          eq(schema.reservationServicePaymentRule.organizationId, organizationId),
          eq(schema.reservationServicePaymentRule.serviceId, serviceId)
        )
      )
      .limit(1);
    return rows[0] ? normalizeRule(rows[0]) : null;
  }

  async saveRule(rule: ServicePaymentRule): Promise<ServicePaymentRule> {
    const rows = await this.db
      .insert(schema.reservationServicePaymentRule)
      .values(rule)
      .onConflictDoUpdate({
        target: [
          schema.reservationServicePaymentRule.organizationId,
          schema.reservationServicePaymentRule.serviceId,
        ],
        set: {
          currency: rule.currency,
          amountMinor: rule.amountMinor,
          depositType: rule.depositType,
          depositAmountMinor: rule.depositAmountMinor,
          depositPercentage: rule.depositPercentage,
          active: rule.active,
          updatedAt: rule.updatedAt,
        },
      })
      .returning();
    const saved = rows[0];
    if (!saved) throw new Error("reservation_service_payment_rule_save_failed");
    return normalizeRule(saved);
  }
}

export class InMemoryServicePaymentRuleRepository implements ServicePaymentRuleRepository {
  services = new Set<string>();
  rules = new Map<string, ServicePaymentRule>();

  async findService(_organizationId: string, serviceId: string): Promise<{ id: string } | null> {
    return this.services.has(serviceId) ? { id: serviceId } : null;
  }

  async findRule(organizationId: string, serviceId: string): Promise<ServicePaymentRule | null> {
    const rule = this.rules.get(ruleKey(organizationId, serviceId));
    return rule ? cloneRule(rule) : null;
  }

  async saveRule(rule: ServicePaymentRule): Promise<ServicePaymentRule> {
    this.rules.set(ruleKey(rule.organizationId, rule.serviceId), cloneRule(rule));
    return cloneRule(rule);
  }
}

export function createServicePaymentRuleService(): ServicePaymentRuleService {
  return new ServicePaymentRuleService(new DrizzleServicePaymentRuleRepository());
}

export function calculateServicePaymentQuote(
  rule: ServicePaymentRule | null
): ServicePaymentQuote {
  if (!rule || !rule.active) return { priceEstimate: null, depositDue: null };

  const priceEstimate =
    rule.amountMinor == null
      ? null
      : moneyAmount({ amountMinor: rule.amountMinor, currency: rule.currency });

  const depositAmountMinor = calculateDepositAmountMinor(rule);
  return {
    priceEstimate,
    depositDue:
      depositAmountMinor == null || depositAmountMinor <= 0
        ? null
        : {
            ...moneyAmount({ amountMinor: depositAmountMinor, currency: rule.currency }),
            type: rule.depositType,
          },
  };
}

export function serializeServicePaymentRule(rule: ServicePaymentRule | null) {
  return rule
    ? {
        id: rule.id,
        organizationId: rule.organizationId,
        serviceId: rule.serviceId,
        currency: rule.currency,
        amountMinor: rule.amountMinor,
        depositType: rule.depositType,
        depositAmountMinor: rule.depositAmountMinor,
        depositPercentage: rule.depositPercentage,
        active: rule.active,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      }
    : null;
}

function validateRule(rule: z.infer<typeof servicePaymentRuleInputSchema>) {
  if (rule.depositType === "fixed" && rule.depositAmountMinor == null) {
    throw new ServicePaymentRuleError("invalid_fixed_deposit");
  }
  if (rule.depositType === "percentage" && rule.depositPercentage == null) {
    throw new ServicePaymentRuleError("invalid_percentage_deposit");
  }
  if (
    (rule.depositType === "percentage" || rule.depositType === "full") &&
    rule.amountMinor == null
  ) {
    throw new ServicePaymentRuleError("invalid_full_deposit");
  }
}

function calculateDepositAmountMinor(rule: ServicePaymentRule): number | null {
  if (rule.depositType === "none") return null;
  if (rule.depositType === "fixed") {
    if (rule.depositAmountMinor == null) return null;
    return rule.amountMinor == null
      ? rule.depositAmountMinor
      : Math.min(rule.depositAmountMinor, rule.amountMinor);
  }
  if (rule.depositType === "percentage") {
    if (rule.amountMinor == null || rule.depositPercentage == null) return null;
    return Math.ceil((rule.amountMinor * rule.depositPercentage) / 100);
  }
  if (rule.depositType === "full") return rule.amountMinor;
  return null;
}

function moneyAmount(input: { amountMinor: number; currency: string }): MoneyAmount {
  return {
    amountMinor: input.amountMinor,
    currency: input.currency,
    display: new Intl.NumberFormat("es-PY", {
      style: "currency",
      currency: input.currency,
      maximumFractionDigits: input.currency === "PYG" ? 0 : 2,
    }).format(input.amountMinor),
  };
}

function normalizeRule(row: typeof schema.reservationServicePaymentRule.$inferSelect): ServicePaymentRule {
  return {
    ...row,
    depositType: depositTypeSchema.parse(row.depositType),
  };
}

function cloneRule(rule: ServicePaymentRule): ServicePaymentRule {
  return {
    ...rule,
    createdAt: new Date(rule.createdAt),
    updatedAt: new Date(rule.updatedAt),
  };
}

function ruleKey(organizationId: string, serviceId: string) {
  return `${organizationId}:${serviceId}`;
}
