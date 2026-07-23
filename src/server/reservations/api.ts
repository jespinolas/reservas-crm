import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import {
  BookingError,
  BookingService,
  DrizzleBookingRepository,
  type BookingHold,
  type Reservation,
} from "@/server/reservations/booking";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";
import type { ReservationResourceDto, ReservationServiceDto } from "@/lib/types";

export const createHoldBodySchema = z.object({
  resourceId: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  contactId: z.string().trim().min(1).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export type CreateHoldBody = z.infer<typeof createHoldBodySchema>;

export interface ReservationApiRepository {
  findBusinessConfiguration(organizationId: string): Promise<BusinessConfiguration | null>;
  findResourceById(organizationId: string, id: string): Promise<ReservableResource | null>;
  findReservationServiceById(
    organizationId: string,
    id: string
  ): Promise<ReservationServiceDefinition | null>;
  listResources(organizationId: string): Promise<ReservableResource[]>;
  listReservationServices(organizationId: string): Promise<ReservationServiceDefinition[]>;
  contactExists(organizationId: string, id: string): Promise<boolean>;
}

export class ReservationApiService {
  constructor(
    private readonly repository: ReservationApiRepository,
    private readonly bookingService: BookingService
  ) {}

  async createHold(input: {
    organizationId: string;
    body: CreateHoldBody;
    now?: Date;
  }): Promise<BookingHold> {
    const now = input.now ?? new Date();
    const [configuration, resource, service] = await Promise.all([
      this.repository.findBusinessConfiguration(input.organizationId),
      this.repository.findResourceById(input.organizationId, input.body.resourceId),
      this.repository.findReservationServiceById(input.organizationId, input.body.serviceId),
    ]);

    if (!resource) throw new ReservationApiError("resource_not_found");
    if (!service) throw new ReservationApiError("service_not_found");
    if (input.body.contactId) {
      const exists = await this.repository.contactExists(input.organizationId, input.body.contactId);
      if (!exists) throw new ReservationApiError("contact_not_found");
    }

    return this.bookingService.createHold({
      organizationId: input.organizationId,
      resource,
      service,
      contactId: input.body.contactId ?? null,
      startsAt: input.body.startsAt,
      endsAt: input.body.endsAt,
      expiresAt: addMinutes(now, configuration?.defaultHoldMinutes ?? 10),
      idempotencyKey: input.body.idempotencyKey,
      now,
    });
  }

  async confirmHold(input: {
    organizationId: string;
    holdId: string;
    now?: Date;
  }): Promise<Reservation> {
    return this.bookingService.confirmHold({
      organizationId: input.organizationId,
      holdId: input.holdId,
      now: input.now,
    });
  }

  async listActiveCatalog(input: {
    organizationId: string;
  }): Promise<{
    resources: ReservationResourceDto[];
    services: ReservationServiceDto[];
  }> {
    const [resources, services] = await Promise.all([
      this.repository.listResources(input.organizationId),
      this.repository.listReservationServices(input.organizationId),
    ]);
    return {
      resources: resources.filter((resource) => resource.active).map(serializeResource),
      services: services.filter((service) => service.active).map(serializeService),
    };
  }
}

export class DrizzleReservationApiRepository implements ReservationApiRepository {
  constructor(private readonly db = getDb()) {}

  async findBusinessConfiguration(organizationId: string): Promise<BusinessConfiguration | null> {
    const rows = await this.db
      .select()
      .from(schema.businessConfiguration)
      .where(eq(schema.businessConfiguration.organizationId, organizationId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findResourceById(
    organizationId: string,
    id: string
  ): Promise<ReservableResource | null> {
    const rows = await this.db
      .select()
      .from(schema.resource)
      .where(and(eq(schema.resource.organizationId, organizationId), eq(schema.resource.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findReservationServiceById(
    organizationId: string,
    id: string
  ): Promise<ReservationServiceDefinition | null> {
    const rows = await this.db
      .select()
      .from(schema.reservationService)
      .where(
        and(
          eq(schema.reservationService.organizationId, organizationId),
          eq(schema.reservationService.id, id)
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
      .orderBy(schema.resource.sortOrder, schema.resource.name);
    return rows;
  }

  async listReservationServices(
    organizationId: string
  ): Promise<ReservationServiceDefinition[]> {
    const rows = await this.db
      .select()
      .from(schema.reservationService)
      .where(eq(schema.reservationService.organizationId, organizationId))
      .orderBy(schema.reservationService.sortOrder, schema.reservationService.name);
    return rows;
  }

  async contactExists(organizationId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(and(eq(schema.contact.organizationId, organizationId), eq(schema.contact.id, id)))
      .limit(1);
    return Boolean(rows[0]);
  }
}

export class ReservationApiError extends Error {
  constructor(readonly code: "resource_not_found" | "service_not_found" | "contact_not_found") {
    super(code);
    this.name = "ReservationApiError";
  }
}

export function createReservationApiService(): ReservationApiService {
  return new ReservationApiService(
    new DrizzleReservationApiRepository(),
    new BookingService(new DrizzleBookingRepository())
  );
}

export function serializeHold(hold: BookingHold) {
  return {
    id: hold.id,
    resourceId: hold.resourceId,
    serviceId: hold.serviceId,
    contactId: hold.contactId,
    startsAt: hold.startsAt.toISOString(),
    endsAt: hold.endsAt.toISOString(),
    expiresAt: hold.expiresAt.toISOString(),
    status: hold.status,
    idempotencyKey: hold.idempotencyKey,
  };
}

export function serializeReservation(reservation: Reservation) {
  return {
    id: reservation.id,
    resourceId: reservation.resourceId,
    serviceId: reservation.serviceId,
    contactId: reservation.contactId,
    holdId: reservation.holdId,
    startsAt: reservation.startsAt.toISOString(),
    endsAt: reservation.endsAt.toISOString(),
    status: reservation.status,
  };
}

export function serializeResource(resource: ReservableResource): ReservationResourceDto {
  return {
    id: resource.id,
    name: resource.name,
    description: resource.description,
    kind: resource.kind,
    location: resource.location,
    capacity: resource.capacity,
  };
}

export function serializeService(
  service: ReservationServiceDefinition
): ReservationServiceDto {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.durationMinutes,
  };
}

export function reservationApiErrorResponse(error: unknown): Response {
  if (error instanceof ReservationApiError) {
    if (error.code === "resource_not_found") {
      return apiError(404, error.code, "Resource was not found");
    }
    if (error.code === "service_not_found") {
      return apiError(404, error.code, "Reservation service was not found");
    }
    return apiError(404, error.code, "Contact was not found");
  }
  if (error instanceof BookingError) {
    if (error.code === "conflict") {
      return apiError(409, "booking_conflict", "Requested time is no longer available");
    }
    if (error.code === "not_found") {
      return apiError(404, "hold_not_found", "Booking hold was not found");
    }
    if (error.code === "expired") {
      return apiError(409, "hold_expired", "Booking hold has expired");
    }
    return apiError(409, "booking_not_active", "Booking hold is not active");
  }
  throw error;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
