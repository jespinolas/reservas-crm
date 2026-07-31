import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  buildLiteHandoffTemplate,
  type LiteHandoffTemplate,
} from "@/server/lite/whatsapp-handoff";
import {
  calculateServicePaymentQuote,
  type ServicePaymentRule,
} from "@/server/reservations/payment-rules";

export const liteAvailabilityBlockStatusSchema = z.enum([
  "available",
  "busy",
  "tentative",
  "blocked",
]);

export const liteReliabilitySchema = z.enum([
  "new",
  "good",
  "late_payer",
  "no_show_risk",
  "vip",
  "blocked",
]);

export type LiteAvailabilityBlockStatus = z.infer<
  typeof liteAvailabilityBlockStatusSchema
>;
export type LiteReliability = z.infer<typeof liteReliabilitySchema>;

export type LiteAvailabilityBlock = {
  id: string;
  organizationId: string;
  resourceId: string;
  resourceName?: string;
  status: LiteAvailabilityBlockStatus;
  startsAt: Date;
  endsAt: Date;
  label: string | null;
  operatorNote: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LiteReminderTask = {
  key: string;
  kind:
    | "reservation_reminder"
    | "payment_reminder"
    | "request_follow_up"
    | "customer_waiting_follow_up";
  targetId: string;
  customerName: string;
  customerPhone: string;
  title: string;
  dueAt: Date;
  template: LiteHandoffTemplate;
  completed: boolean;
};

export type LiteCustomerProfile = {
  id: string;
  organizationId: string;
  phone: string;
  reliability: LiteReliability;
  operatorNote: string | null;
  lastReviewedAt: Date | null;
  reviewedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LiteCustomerProfileSummary = {
  profile: LiteCustomerProfile | null;
  counts: {
    requests: number;
    confirmedReservations: number;
    declinedOrExpired: number;
    paymentsApproved: number;
    paymentsRejectedOrExpired: number;
  };
};

export type LiteLostMoneyReport = {
  currency: string;
  estimatedTotalMinor: number;
  unknownValueCount: number;
  buckets: Array<{
    key:
      | "declined"
      | "expired"
      | "waiting_for_payment"
      | "new_or_needs_reply"
      | "waiting_for_customer";
    label: string;
    count: number;
    estimatedMinor: number;
    unknownValueCount: number;
  }>;
  topServices: Array<{ serviceId: string; serviceName: string; count: number; estimatedMinor: number }>;
};

export type LiteAgenda = {
  summary: {
    todayReservations: number;
    pendingRequests: number;
    paymentsDue: number;
    remindersDue: number;
    manualBlocksToday: number;
    duplicateRisk: number;
  };
  reservationsToday: Array<{
    id: string;
    customerName: string | null;
    customerPhone: string | null;
    resourceName: string;
    serviceName: string;
    startsAt: Date;
    endsAt: Date;
  }>;
  pendingRequests: Array<{
    id: string;
    customerName: string;
    customerPhone: string;
    status: string;
    serviceName: string;
    resourceName: string | null;
    startsAt: Date;
    duplicateRisk: boolean;
  }>;
  paymentRequests: Array<{
    id: string;
    customerName: string;
    customerPhone: string;
    expectedAmountMinor: number | null;
    currency: string;
    status: string;
  }>;
  reminders: LiteReminderTask[];
  availabilityBlocks: LiteAvailabilityBlock[];
};

type Db = ReturnType<typeof getDb>;

export class LiteOperatorService {
  constructor(private readonly db: Db = getDb()) {}

  async createAvailabilityBlock(input: {
    organizationId: string;
    resourceId: string;
    status: LiteAvailabilityBlockStatus;
    startsAt: Date;
    endsAt: Date;
    label?: string | null;
    operatorNote?: string | null;
    actorUserId: string;
    now?: Date;
  }): Promise<LiteAvailabilityBlock> {
    const parsed = availabilityInputSchema.parse(input);
    if (parsed.endsAt <= parsed.startsAt) throw new LiteOperatorError("invalid_range");
    const resource = await this.findResource(parsed.organizationId, parsed.resourceId);
    if (!resource) throw new LiteOperatorError("resource_not_found");
    const now = parsed.now ?? new Date();
    const [row] = await this.db
      .insert(schema.liteAvailabilityBlock)
      .values({
        id: newId("liteAvailabilityBlock"),
        organizationId: parsed.organizationId,
        resourceId: parsed.resourceId,
        status: parsed.status,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        label: parsed.label ?? null,
        operatorNote: parsed.operatorNote ?? null,
        createdByUserId: parsed.actorUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error("lite_availability_block_create_failed");
    return { ...row, status: liteAvailabilityBlockStatusSchema.parse(row.status), resourceName: resource.name };
  }

  async listAvailabilityBlocks(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<LiteAvailabilityBlock[]> {
    const rows = await this.db
      .select({ block: schema.liteAvailabilityBlock, resourceName: schema.resource.name })
      .from(schema.liteAvailabilityBlock)
      .innerJoin(schema.resource, eq(schema.liteAvailabilityBlock.resourceId, schema.resource.id))
      .where(
        and(
          eq(schema.liteAvailabilityBlock.organizationId, input.organizationId),
          gte(schema.liteAvailabilityBlock.endsAt, input.from),
          lte(schema.liteAvailabilityBlock.startsAt, input.to)
        )
      )
      .orderBy(asc(schema.liteAvailabilityBlock.startsAt));
    return rows.map((row) => ({
      ...row.block,
      status: liteAvailabilityBlockStatusSchema.parse(row.block.status),
      resourceName: row.resourceName,
    }));
  }

  async listReminderTasks(input: {
    organizationId: string;
    now?: Date;
    horizonHours?: number;
  }): Promise<LiteReminderTask[]> {
    const now = input.now ?? new Date();
    const horizon = new Date(now.getTime() + (input.horizonHours ?? 36) * 60 * 60_000);
    const [org] = await this.db
      .select({ name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.id, input.organizationId))
      .limit(1);
    const completions = await this.listReminderCompletions(input.organizationId);
    const completedKeys = new Set(completions.map((completion) => completion.taskKey));

    const reservations = await this.db
      .select({
        id: schema.reservation.id,
        startsAt: schema.reservation.startsAt,
        endsAt: schema.reservation.endsAt,
        customerName: schema.contact.name,
        customerPhone: schema.contact.phone,
        resourceName: schema.resource.name,
        serviceName: schema.reservationService.name,
      })
      .from(schema.reservation)
      .innerJoin(schema.resource, eq(schema.reservation.resourceId, schema.resource.id))
      .innerJoin(
        schema.reservationService,
        eq(schema.reservation.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.contact, eq(schema.reservation.contactId, schema.contact.id))
      .where(
        and(
          eq(schema.reservation.organizationId, input.organizationId),
          eq(schema.reservation.status, "confirmed"),
          gte(schema.reservation.startsAt, now),
          lte(schema.reservation.startsAt, horizon)
        )
      );

    const requests = await this.db
      .select({
        request: schema.liteBookingRequest,
        resourceName: schema.resource.name,
        serviceName: schema.reservationService.name,
      })
      .from(schema.liteBookingRequest)
      .innerJoin(
        schema.reservationService,
        eq(schema.liteBookingRequest.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.resource, eq(schema.liteBookingRequest.resourceId, schema.resource.id))
      .where(
        and(
          eq(schema.liteBookingRequest.organizationId, input.organizationId),
          inArray(schema.liteBookingRequest.status, [
            "new",
            "needs_reply",
            "waiting_for_customer",
            "waiting_for_payment",
          ])
        )
      );

    const reservationTasks = reservations.map((reservation): LiteReminderTask => {
      const key = `reservation_reminder:${reservation.id}`;
      return {
        key,
        kind: "reservation_reminder",
        targetId: reservation.id,
        customerName: reservation.customerName ?? "Cliente",
        customerPhone: reservation.customerPhone ?? "",
        title: `Recordar reserva: ${reservation.serviceName}`,
        dueAt: reservation.startsAt,
        completed: completedKeys.has(key),
        template: buildLiteHandoffTemplate({
          kind: "reminder",
          businessName: org?.name ?? "Reservas",
          customerName: reservation.customerName ?? "Cliente",
          customerPhone: reservation.customerPhone ?? null,
          serviceName: reservation.serviceName,
          resourceName: reservation.resourceName,
          startsAt: reservation.startsAt,
          endsAt: reservation.endsAt,
          partySize: 1,
        }),
      };
    });

    const requestTasks = requests.map((row): LiteReminderTask => {
      const request = row.request;
      const kind =
        request.status === "waiting_for_payment"
          ? "payment_reminder"
          : request.status === "waiting_for_customer"
            ? "customer_waiting_follow_up"
            : "request_follow_up";
      const key = `${kind}:${request.id}`;
      return {
        key,
        kind,
        targetId: request.id,
        customerName: request.customerName,
        customerPhone: request.customerPhone,
        title:
          kind === "payment_reminder"
            ? `Recordar seña: ${row.serviceName}`
            : `Dar seguimiento: ${row.serviceName}`,
        dueAt: request.updatedAt,
        completed: completedKeys.has(key),
        template: buildLiteHandoffTemplate({
          kind: kind === "payment_reminder" ? "payment_request" : "availability_follow_up",
          businessName: org?.name ?? "Reservas",
          customerName: request.customerName,
          customerPhone: request.customerPhone,
          serviceName: row.serviceName,
          resourceName: row.resourceName,
          startsAt: request.startsAt,
          endsAt: request.endsAt,
          partySize: request.partySize,
          depositDisplay: request.paymentExpectedAmountMinor
            ? formatMoney(request.paymentExpectedAmountMinor, request.paymentCurrency)
            : null,
          paymentInstructions: request.paymentInstructions,
        }),
      };
    });

    return [...reservationTasks, ...requestTasks]
      .filter((task) => !task.completed)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  }

  async markReminderDone(input: {
    organizationId: string;
    taskKey: string;
    taskKind: string;
    targetId: string;
    actorUserId: string;
    note?: string | null;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    await this.db
      .insert(schema.liteReminderCompletion)
      .values({
        id: newId("liteReminderCompletion"),
        organizationId: input.organizationId,
        taskKey: input.taskKey,
        taskKind: input.taskKind,
        targetId: input.targetId,
        completedByUserId: input.actorUserId,
        completedAt: now,
        note: input.note ?? null,
      })
      .onConflictDoNothing({
        target: [
          schema.liteReminderCompletion.organizationId,
          schema.liteReminderCompletion.taskKey,
        ],
      });
  }

  async getCustomerProfile(input: {
    organizationId: string;
    phone: string;
  }): Promise<LiteCustomerProfileSummary> {
    const phone = normalizePhone(input.phone);
    const [profile] = await this.db
      .select()
      .from(schema.liteCustomerProfile)
      .where(
        and(
          eq(schema.liteCustomerProfile.organizationId, input.organizationId),
          eq(schema.liteCustomerProfile.phone, phone)
        )
      )
      .limit(1);
    const requests = await this.db
      .select()
      .from(schema.liteBookingRequest)
      .where(
        and(
          eq(schema.liteBookingRequest.organizationId, input.organizationId),
          eq(schema.liteBookingRequest.customerPhone, input.phone)
        )
      );
    const contacts = await this.db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(
        and(eq(schema.contact.organizationId, input.organizationId), eq(schema.contact.phone, input.phone))
      );
    const contactIds = contacts.map((contact) => contact.id);
    const reservations = contactIds.length
      ? await this.db
          .select()
          .from(schema.reservation)
          .where(
            and(
              eq(schema.reservation.organizationId, input.organizationId),
              inArray(schema.reservation.contactId, contactIds)
            )
          )
      : [];
    return {
      profile: profile ? normalizeProfile(profile) : null,
      counts: {
        requests: requests.length,
        confirmedReservations: reservations.filter((reservation) => reservation.status === "confirmed").length,
        declinedOrExpired: requests.filter((request) => ["declined", "expired"].includes(request.status)).length,
        paymentsApproved: requests.filter((request) => request.paymentStatus === "approved").length,
        paymentsRejectedOrExpired: requests.filter((request) => ["rejected", "expired"].includes(request.paymentStatus)).length,
      },
    };
  }

  async upsertCustomerProfile(input: {
    organizationId: string;
    phone: string;
    reliability: LiteReliability;
    operatorNote?: string | null;
    actorUserId: string;
    now?: Date;
  }): Promise<LiteCustomerProfile> {
    const parsed = profileInputSchema.parse(input);
    const phone = normalizePhone(parsed.phone);
    const now = parsed.now ?? new Date();
    const [row] = await this.db
      .insert(schema.liteCustomerProfile)
      .values({
        id: newId("liteCustomerProfile"),
        organizationId: parsed.organizationId,
        phone,
        reliability: parsed.reliability,
        operatorNote: parsed.operatorNote ?? null,
        reviewedByUserId: parsed.actorUserId,
        lastReviewedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.liteCustomerProfile.organizationId,
          schema.liteCustomerProfile.phone,
        ],
        set: {
          reliability: parsed.reliability,
          operatorNote: parsed.operatorNote ?? null,
          reviewedByUserId: parsed.actorUserId,
          lastReviewedAt: now,
          updatedAt: now,
        },
      })
      .returning();
    if (!row) throw new Error("lite_customer_profile_save_failed");
    return normalizeProfile(row);
  }

  async buildLostMoneyReport(input: {
    organizationId: string;
    currency?: string;
  }): Promise<LiteLostMoneyReport> {
    const currency = input.currency ?? "PYG";
    const rows = await this.db
      .select({
        request: schema.liteBookingRequest,
        service: schema.reservationService,
        rule: schema.reservationServicePaymentRule,
      })
      .from(schema.liteBookingRequest)
      .innerJoin(
        schema.reservationService,
        eq(schema.liteBookingRequest.serviceId, schema.reservationService.id)
      )
      .leftJoin(
        schema.reservationServicePaymentRule,
        and(
          eq(schema.reservationServicePaymentRule.organizationId, input.organizationId),
          eq(schema.reservationServicePaymentRule.serviceId, schema.liteBookingRequest.serviceId)
        )
      )
      .where(eq(schema.liteBookingRequest.organizationId, input.organizationId));

    return buildLiteLostMoneyReport(
      rows
        .filter((row) => row.request.status !== "confirmed")
        .map((row) => ({
          status: row.request.status,
          serviceId: row.service.id,
          serviceName: row.service.name,
          quote: calculateServicePaymentQuote(
            row.rule
              ? {
                  ...row.rule,
                  depositType: row.rule.depositType as ServicePaymentRule["depositType"],
                }
              : null
          ),
        })),
      currency
    );
  }

  async buildAgenda(input: { organizationId: string; now?: Date }): Promise<LiteAgenda> {
    const now = input.now ?? new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const [reservationsToday, pendingRequests, paymentRequests, reminders, availabilityBlocks] =
      await Promise.all([
        this.listReservationsBetween(input.organizationId, dayStart, dayEnd),
        this.listAgendaRequests(input.organizationId),
        this.listPaymentRequests(input.organizationId),
        this.listReminderTasks({ organizationId: input.organizationId, now }),
        this.listAvailabilityBlocks({
          organizationId: input.organizationId,
          from: dayStart,
          to: dayEnd,
        }),
      ]);
    return {
      summary: {
        todayReservations: reservationsToday.length,
        pendingRequests: pendingRequests.length,
        paymentsDue: paymentRequests.length,
        remindersDue: reminders.length,
        manualBlocksToday: availabilityBlocks.length,
        duplicateRisk: pendingRequests.filter((request) => request.duplicateRisk).length,
      },
      reservationsToday,
      pendingRequests,
      paymentRequests,
      reminders: reminders.slice(0, 20),
      availabilityBlocks,
    };
  }

  private async findResource(organizationId: string, resourceId: string) {
    const [resource] = await this.db
      .select()
      .from(schema.resource)
      .where(and(eq(schema.resource.organizationId, organizationId), eq(schema.resource.id, resourceId)))
      .limit(1);
    return resource ?? null;
  }

  private async listReminderCompletions(organizationId: string) {
    return this.db
      .select()
      .from(schema.liteReminderCompletion)
      .where(eq(schema.liteReminderCompletion.organizationId, organizationId));
  }

  private async listReservationsBetween(organizationId: string, from: Date, to: Date) {
    return this.db
      .select({
        id: schema.reservation.id,
        customerName: schema.contact.name,
        customerPhone: schema.contact.phone,
        resourceName: schema.resource.name,
        serviceName: schema.reservationService.name,
        startsAt: schema.reservation.startsAt,
        endsAt: schema.reservation.endsAt,
      })
      .from(schema.reservation)
      .innerJoin(schema.resource, eq(schema.reservation.resourceId, schema.resource.id))
      .innerJoin(
        schema.reservationService,
        eq(schema.reservation.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.contact, eq(schema.reservation.contactId, schema.contact.id))
      .where(
        and(
          eq(schema.reservation.organizationId, organizationId),
          eq(schema.reservation.status, "confirmed"),
          gte(schema.reservation.startsAt, from),
          lte(schema.reservation.startsAt, to)
        )
      )
      .orderBy(asc(schema.reservation.startsAt));
  }

  private async listAgendaRequests(organizationId: string) {
    const rows = await this.db
      .select({
        request: schema.liteBookingRequest,
        resourceName: schema.resource.name,
        serviceName: schema.reservationService.name,
      })
      .from(schema.liteBookingRequest)
      .innerJoin(
        schema.reservationService,
        eq(schema.liteBookingRequest.serviceId, schema.reservationService.id)
      )
      .leftJoin(schema.resource, eq(schema.liteBookingRequest.resourceId, schema.resource.id))
      .where(
        and(
          eq(schema.liteBookingRequest.organizationId, organizationId),
          inArray(schema.liteBookingRequest.status, [
            "new",
            "needs_reply",
            "waiting_for_customer",
            "waiting_for_payment",
          ])
        )
      )
      .orderBy(desc(schema.liteBookingRequest.createdAt))
      .limit(50);
    return rows.map((row) => ({
      id: row.request.id,
      customerName: row.request.customerName,
      customerPhone: row.request.customerPhone,
      status: row.request.status,
      serviceName: row.serviceName,
      resourceName: row.resourceName,
      startsAt: row.request.startsAt,
      duplicateRisk: false,
    }));
  }

  private async listPaymentRequests(organizationId: string) {
    const rows = await this.db
      .select()
      .from(schema.liteBookingRequest)
      .where(
        and(
          eq(schema.liteBookingRequest.organizationId, organizationId),
          eq(schema.liteBookingRequest.status, "waiting_for_payment")
        )
      )
      .orderBy(desc(schema.liteBookingRequest.updatedAt))
      .limit(50);
    return rows.map((request) => ({
      id: request.id,
      customerName: request.customerName,
      customerPhone: request.customerPhone,
      expectedAmountMinor: request.paymentExpectedAmountMinor,
      currency: request.paymentCurrency,
      status: request.paymentStatus,
    }));
  }
}

export class LiteOperatorError extends Error {
  constructor(readonly code: "resource_not_found" | "invalid_range") {
    super(code);
    this.name = "LiteOperatorError";
  }
}

export function buildLiteLostMoneyReport(
  rows: Array<{
    status: string;
    serviceId: string;
    serviceName: string;
    quote: { priceEstimate: { amountMinor: number; currency: string; display: string } | null };
  }>,
  currency = "PYG"
): LiteLostMoneyReport {
  const buckets: LiteLostMoneyReport["buckets"] = [
    { key: "declined", label: "Declinadas", count: 0, estimatedMinor: 0, unknownValueCount: 0 },
    { key: "expired", label: "Expiradas", count: 0, estimatedMinor: 0, unknownValueCount: 0 },
    { key: "waiting_for_payment", label: "Esperando seña", count: 0, estimatedMinor: 0, unknownValueCount: 0 },
    { key: "new_or_needs_reply", label: "Sin responder", count: 0, estimatedMinor: 0, unknownValueCount: 0 },
    { key: "waiting_for_customer", label: "Esperando cliente", count: 0, estimatedMinor: 0, unknownValueCount: 0 },
  ];
  const serviceMap = new Map<string, { serviceId: string; serviceName: string; count: number; estimatedMinor: number }>();

  for (const row of rows) {
    const bucket = buckets.find((candidate) => candidate.key === bucketKey(row.status));
    if (!bucket) continue;
    bucket.count += 1;
    const amount = row.quote.priceEstimate?.amountMinor ?? null;
    if (amount == null) {
      bucket.unknownValueCount += 1;
      continue;
    }
    bucket.estimatedMinor += amount;
    const service = serviceMap.get(row.serviceId) ?? {
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      count: 0,
      estimatedMinor: 0,
    };
    service.count += 1;
    service.estimatedMinor += amount;
    serviceMap.set(row.serviceId, service);
  }

  return {
    currency,
    estimatedTotalMinor: buckets.reduce((sum, bucket) => sum + bucket.estimatedMinor, 0),
    unknownValueCount: buckets.reduce((sum, bucket) => sum + bucket.unknownValueCount, 0),
    buckets,
    topServices: [...serviceMap.values()]
      .sort((a, b) => b.estimatedMinor - a.estimatedMinor)
      .slice(0, 5),
  };
}

export function serializeAvailabilityBlock(block: LiteAvailabilityBlock) {
  return {
    ...block,
    startsAt: block.startsAt.toISOString(),
    endsAt: block.endsAt.toISOString(),
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

export function serializeReminderTask(task: LiteReminderTask) {
  return {
    ...task,
    dueAt: task.dueAt.toISOString(),
  };
}

export function serializeCustomerProfileSummary(summary: LiteCustomerProfileSummary) {
  return {
    profile: summary.profile
      ? {
          ...summary.profile,
          lastReviewedAt: summary.profile.lastReviewedAt?.toISOString() ?? null,
          createdAt: summary.profile.createdAt.toISOString(),
          updatedAt: summary.profile.updatedAt.toISOString(),
        }
      : null,
    counts: summary.counts,
  };
}

function bucketKey(status: string): LiteLostMoneyReport["buckets"][number]["key"] | null {
  if (status === "declined") return "declined";
  if (status === "expired") return "expired";
  if (status === "waiting_for_payment") return "waiting_for_payment";
  if (status === "new" || status === "needs_reply") return "new_or_needs_reply";
  if (status === "waiting_for_customer") return "waiting_for_customer";
  return null;
}

function normalizePhone(phone: string): string {
  return phone.trim();
}

function normalizeProfile(row: typeof schema.liteCustomerProfile.$inferSelect): LiteCustomerProfile {
  return { ...row, reliability: liteReliabilitySchema.parse(row.reliability) };
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amountMinor);
}

const availabilityInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  status: liteAvailabilityBlockStatusSchema,
  startsAt: z.date(),
  endsAt: z.date(),
  label: z.string().trim().max(160).nullable().optional(),
  operatorNote: z.string().trim().max(1000).nullable().optional(),
  actorUserId: z.string().min(1),
  now: z.date().optional(),
});

const profileInputSchema = z.object({
  organizationId: z.string().min(1),
  phone: z.string().trim().min(6).max(40),
  reliability: liteReliabilitySchema,
  operatorNote: z.string().trim().max(1000).nullable().optional(),
  actorUserId: z.string().min(1),
  now: z.date().optional(),
});
