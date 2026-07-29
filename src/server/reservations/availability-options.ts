import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  AvailabilityService,
  DrizzleAvailabilityRepository,
  type AvailabilitySlot,
} from "@/server/reservations/availability";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";
import {
  calculateServicePaymentQuote,
  type ServicePaymentQuote,
  type ServicePaymentRule,
} from "@/server/reservations/payment-rules";

export type AvailabilityBlockingRange = {
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  source: "hold" | "reservation";
};

export type AvailabilityOption = {
  resource: {
    id: string;
    name: string;
    kind: ReservableResource["kind"];
    capacity: number;
    location: string | null;
    description: string | null;
  };
  service: {
    id: string;
    name: string;
    durationMinutes: number;
  };
  startsAt: Date;
  endsAt: Date;
  partySize: number | null;
  priceEstimate: ServicePaymentQuote["priceEstimate"];
  depositDue: ServicePaymentQuote["depositDue"];
};

export type AvailabilityOptionsResult = {
  options: AvailabilityOption[];
  diagnostics: {
    candidateResourceCount: number;
    capacityRejectedCount: number;
    scheduleSlotCount: number;
    conflictRejectedCount: number;
    returnedCount: number;
  };
};

export interface AvailabilityOptionsRepository {
  findBusinessConfiguration(organizationId: string): Promise<BusinessConfiguration | null>;
  findReservationServiceById(
    organizationId: string,
    serviceId: string
  ): Promise<ReservationServiceDefinition | null>;
  findPaymentRule(organizationId: string, serviceId: string): Promise<ServicePaymentRule | null>;
  listResources(organizationId: string): Promise<ReservableResource[]>;
  listBlockingRanges(input: {
    organizationId: string;
    resourceIds: string[];
    rangeStart: Date;
    rangeEnd: Date;
    now: Date;
  }): Promise<AvailabilityBlockingRange[]>;
}

export class AvailabilityOptionsError extends Error {
  constructor(readonly code: "service_not_found" | "invalid_range") {
    super(code);
    this.name = "AvailabilityOptionsError";
  }
}

export class AvailabilityOptionsService {
  constructor(
    private readonly repository: AvailabilityOptionsRepository,
    private readonly availabilityService: AvailabilityService
  ) {}

  async findAvailableOptions(input: {
    organizationId: string;
    serviceId: string;
    rangeStart: Date;
    rangeEnd: Date;
    partySize?: number | null;
    maxOptions?: number;
    now?: Date;
  }): Promise<AvailabilityOptionsResult> {
    if (input.rangeEnd <= input.rangeStart) throw new AvailabilityOptionsError("invalid_range");
    const now = input.now ?? new Date();
    const maxOptions = Math.min(Math.max(input.maxOptions ?? 12, 1), 50);
    const [configuration, service, resources, paymentRule] = await Promise.all([
      this.repository.findBusinessConfiguration(input.organizationId),
      this.repository.findReservationServiceById(input.organizationId, input.serviceId),
      this.repository.listResources(input.organizationId),
      this.repository.findPaymentRule(input.organizationId, input.serviceId),
    ]);
    if (!service || !service.active) throw new AvailabilityOptionsError("service_not_found");
    const paymentQuote = calculateServicePaymentQuote(paymentRule);

    const activeResources = resources.filter((resource) => resource.active);
    const capacityEligibleResources = activeResources.filter(
      (resource) => !input.partySize || resource.capacity >= input.partySize
    );
    const blockingRanges = await this.repository.listBlockingRanges({
      organizationId: input.organizationId,
      resourceIds: capacityEligibleResources.map((resource) => resource.id),
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      now,
    });

    let scheduleSlotCount = 0;
    let conflictRejectedCount = 0;
    const options: AvailabilityOption[] = [];

    for (const resource of capacityEligibleResources) {
      const slots = await this.availabilityService.listAvailableSlots({
        configuration: configuration ?? defaultConfiguration(input.organizationId, now),
        resource,
        service,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
      });
      scheduleSlotCount += slots.length;

      for (const slot of slots) {
        const conflicts = blockingRanges.some(
          (range) =>
            range.resourceId === resource.id &&
            slot.startsAt < range.endsAt &&
            slot.endsAt > range.startsAt
        );
        if (conflicts) {
          conflictRejectedCount += 1;
          continue;
        }
        options.push(
          toOption({
            slot,
            resource,
            service,
            partySize: input.partySize ?? null,
            paymentQuote,
          })
        );
      }
    }

    const ranked = options
      .sort(
        (a, b) =>
          a.startsAt.getTime() - b.startsAt.getTime() ||
          a.resource.capacity - b.resource.capacity ||
          a.resource.name.localeCompare(b.resource.name)
      )
      .slice(0, maxOptions);

    return {
      options: ranked,
      diagnostics: {
        candidateResourceCount: activeResources.length,
        capacityRejectedCount: activeResources.length - capacityEligibleResources.length,
        scheduleSlotCount,
        conflictRejectedCount,
        returnedCount: ranked.length,
      },
    };
  }
}

export class DrizzleAvailabilityOptionsRepository implements AvailabilityOptionsRepository {
  constructor(private readonly db = getDb()) {}

  async findBusinessConfiguration(organizationId: string): Promise<BusinessConfiguration | null> {
    const rows = await this.db
      .select()
      .from(schema.businessConfiguration)
      .where(eq(schema.businessConfiguration.organizationId, organizationId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findReservationServiceById(
    organizationId: string,
    serviceId: string
  ): Promise<ReservationServiceDefinition | null> {
    const rows = await this.db
      .select()
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

  async listResources(organizationId: string): Promise<ReservableResource[]> {
    const rows = await this.db
      .select()
      .from(schema.resource)
      .where(eq(schema.resource.organizationId, organizationId))
      .orderBy(asc(schema.resource.sortOrder), asc(schema.resource.name));
    return rows as ReservableResource[];
  }

  async findPaymentRule(
    organizationId: string,
    serviceId: string
  ): Promise<ServicePaymentRule | null> {
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
    return rows[0]
      ? {
          ...rows[0],
          depositType: rows[0].depositType as ServicePaymentRule["depositType"],
        }
      : null;
  }

  async listBlockingRanges(input: {
    organizationId: string;
    resourceIds: string[];
    rangeStart: Date;
    rangeEnd: Date;
    now: Date;
  }): Promise<AvailabilityBlockingRange[]> {
    if (input.resourceIds.length === 0) return [];
    const [holds, reservations] = await Promise.all([
      this.db
        .select({
          resourceId: schema.bookingHold.resourceId,
          startsAt: schema.bookingHold.startsAt,
          endsAt: schema.bookingHold.endsAt,
        })
        .from(schema.bookingHold)
        .where(
          and(
            eq(schema.bookingHold.organizationId, input.organizationId),
            inArray(schema.bookingHold.resourceId, input.resourceIds),
            eq(schema.bookingHold.status, "active"),
            gt(schema.bookingHold.expiresAt, input.now),
            lt(schema.bookingHold.startsAt, input.rangeEnd),
            gt(schema.bookingHold.endsAt, input.rangeStart)
          )
        ),
      this.db
        .select({
          resourceId: schema.reservation.resourceId,
          startsAt: schema.reservation.startsAt,
          endsAt: schema.reservation.endsAt,
        })
        .from(schema.reservation)
        .where(
          and(
            eq(schema.reservation.organizationId, input.organizationId),
            inArray(schema.reservation.resourceId, input.resourceIds),
            eq(schema.reservation.status, "confirmed"),
            lt(schema.reservation.startsAt, input.rangeEnd),
            gt(schema.reservation.endsAt, input.rangeStart)
          )
        ),
    ]);
    return [
      ...holds.map((hold) => ({ ...hold, source: "hold" as const })),
      ...reservations.map((reservation) => ({
        ...reservation,
        source: "reservation" as const,
      })),
    ];
  }
}

export class InMemoryAvailabilityOptionsRepository implements AvailabilityOptionsRepository {
  configuration: BusinessConfiguration | null = null;
  services = new Map<string, ReservationServiceDefinition>();
  resources = new Map<string, ReservableResource>();
  paymentRules = new Map<string, ServicePaymentRule>();
  blockingRanges: AvailabilityBlockingRange[] = [];

  async findBusinessConfiguration(): Promise<BusinessConfiguration | null> {
    return this.configuration ? cloneConfiguration(this.configuration) : null;
  }

  async findReservationServiceById(
    organizationId: string,
    serviceId: string
  ): Promise<ReservationServiceDefinition | null> {
    const service = this.services.get(serviceId);
    return service?.organizationId === organizationId ? cloneService(service) : null;
  }

  async listResources(organizationId: string): Promise<ReservableResource[]> {
    return [...this.resources.values()]
      .filter((resource) => resource.organizationId === organizationId)
      .map(cloneResource);
  }

  async findPaymentRule(
    organizationId: string,
    serviceId: string
  ): Promise<ServicePaymentRule | null> {
    const rule = this.paymentRules.get(`${organizationId}:${serviceId}`);
    return rule
      ? { ...rule, createdAt: new Date(rule.createdAt), updatedAt: new Date(rule.updatedAt) }
      : null;
  }

  async listBlockingRanges(input: {
    organizationId: string;
    resourceIds: string[];
    rangeStart: Date;
    rangeEnd: Date;
  }): Promise<AvailabilityBlockingRange[]> {
    return this.blockingRanges
      .filter(
        (range) =>
          input.resourceIds.includes(range.resourceId) &&
          range.startsAt < input.rangeEnd &&
          range.endsAt > input.rangeStart
      )
      .map((range) => ({ ...range, startsAt: new Date(range.startsAt), endsAt: new Date(range.endsAt) }));
  }
}

export function createAvailabilityOptionsService(): AvailabilityOptionsService {
  return new AvailabilityOptionsService(
    new DrizzleAvailabilityOptionsRepository(),
    new AvailabilityService(new DrizzleAvailabilityRepository())
  );
}

export function serializeAvailabilityOption(option: AvailabilityOption) {
  return {
    resource: option.resource,
    service: option.service,
    startsAt: option.startsAt.toISOString(),
    endsAt: option.endsAt.toISOString(),
    partySize: option.partySize,
    priceEstimate: option.priceEstimate,
    depositDue: option.depositDue,
  };
}

function toOption(input: {
  slot: AvailabilitySlot;
  resource: ReservableResource;
  service: ReservationServiceDefinition;
  partySize: number | null;
  paymentQuote: ServicePaymentQuote;
}): AvailabilityOption {
  return {
    resource: {
      id: input.resource.id,
      name: input.resource.name,
      kind: input.resource.kind,
      capacity: input.resource.capacity,
      location: input.resource.location,
      description: input.resource.description,
    },
    service: {
      id: input.service.id,
      name: input.service.name,
      durationMinutes: input.service.durationMinutes,
    },
    startsAt: input.slot.startsAt,
    endsAt: input.slot.endsAt,
    partySize: input.partySize,
    priceEstimate: input.paymentQuote.priceEstimate,
    depositDue: input.paymentQuote.depositDue,
  };
}

function defaultConfiguration(organizationId: string, now: Date): BusinessConfiguration {
  return {
    id: "bcfg_default",
    organizationId,
    timezone: "America/Asuncion",
    defaultSlotMinutes: 60,
    defaultHoldMinutes: 10,
    holdsBlockAvailability: true,
    createdAt: now,
    updatedAt: now,
  };
}

function cloneConfiguration(configuration: BusinessConfiguration): BusinessConfiguration {
  return {
    ...configuration,
    createdAt: new Date(configuration.createdAt),
    updatedAt: new Date(configuration.updatedAt),
  };
}

function cloneResource(resource: ReservableResource): ReservableResource {
  return {
    ...resource,
    createdAt: new Date(resource.createdAt),
    updatedAt: new Date(resource.updatedAt),
  };
}

function cloneService(service: ReservationServiceDefinition): ReservationServiceDefinition {
  return {
    ...service,
    createdAt: new Date(service.createdAt),
    updatedAt: new Date(service.updatedAt),
  };
}
