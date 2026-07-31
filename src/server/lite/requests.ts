import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import type { ReservableResource, ReservationServiceDefinition } from "@/server/reservations/catalog";
import type { ServicePaymentRule } from "@/server/reservations/payment-rules";
import { calculateServicePaymentQuote } from "@/server/reservations/payment-rules";
import type { Reservation, ReservationStatusHistory } from "@/server/reservations/booking";

export const liteBookingRequestStatusSchema = z.enum([
  "new",
  "needs_reply",
  "waiting_for_customer",
  "waiting_for_payment",
  "confirmed",
  "declined",
  "expired",
]);

export const litePaymentStatusSchema = z.enum([
  "not_required",
  "requested",
  "evidence_received",
  "approved",
  "rejected",
  "expired",
]);

export type LiteBookingRequestStatus = z.infer<typeof liteBookingRequestStatusSchema>;
export type LitePaymentStatus = z.infer<typeof litePaymentStatusSchema>;

export type LiteBookingRequest = {
  id: string;
  organizationId: string;
  resourceId: string | null;
  serviceId: string;
  reservationId: string | null;
  status: LiteBookingRequestStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  partySize: number;
  startsAt: Date;
  endsAt: Date;
  customerNote: string | null;
  operatorNote: string | null;
  paymentStatus: LitePaymentStatus;
  paymentExpectedAmountMinor: number | null;
  paymentCurrency: string;
  paymentInstructions: string | null;
  paymentEvidenceRedacted: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

export type LiteBookingRequestEvent = {
  id: string;
  organizationId: string;
  requestId: string;
  eventType: string;
  actorType: "system" | "operator" | "customer";
  actorId: string | null;
  metadataRedacted: Record<string, unknown> | null;
  createdAt: Date;
};

export type LiteRequestListItem = LiteBookingRequest & {
  resource: Pick<ReservableResource, "id" | "name" | "kind" | "capacity" | "location"> | null;
  service: Pick<ReservationServiceDefinition, "id" | "name" | "durationMinutes">;
  duplicateRisk: boolean;
};

export type LitePublicCatalog = {
  business: { id: string; name: string; slug: string };
  resources: ReservableResource[];
  services: Array<
    ReservationServiceDefinition & {
      priceEstimate: { amountMinor: number; currency: string; display: string } | null;
      depositDue:
        | ({ amountMinor: number; currency: string; display: string } & { type: string })
        | null;
    }
  >;
};

export interface LiteBookingRequestRepository {
  findOrganizationBySlug(
    slug: string
  ): Promise<{ id: string; name: string; slug: string | null } | null>;
  listActiveResources(organizationId: string): Promise<ReservableResource[]>;
  listActiveServices(organizationId: string): Promise<ReservationServiceDefinition[]>;
  findResourceById(organizationId: string, id: string): Promise<ReservableResource | null>;
  findServiceById(organizationId: string, id: string): Promise<ReservationServiceDefinition | null>;
  findPaymentRule(organizationId: string, serviceId: string): Promise<ServicePaymentRule | null>;
  createRequest(request: LiteBookingRequest, event: LiteBookingRequestEvent): Promise<LiteBookingRequest>;
  findRequestById(organizationId: string, id: string): Promise<LiteBookingRequest | null>;
  listRequests(input: {
    organizationId: string;
    statuses?: LiteBookingRequestStatus[];
    limit: number;
  }): Promise<LiteRequestListItem[]>;
  updateRequest(
    request: LiteBookingRequest,
    event: LiteBookingRequestEvent
  ): Promise<LiteBookingRequest>;
  createReservationFromRequest(input: {
    request: LiteBookingRequest;
    reservation: Reservation;
    history: ReservationStatusHistory;
    contact: { id: string; organizationId: string; name: string; phone: string; now: Date };
    event: LiteBookingRequestEvent;
    now: Date;
  }): Promise<{ ok: true; request: LiteBookingRequest; reservation: Reservation } | { ok: false; code: "conflict" }>;
}

export class LiteBookingRequestError extends Error {
  constructor(
    readonly code:
      | "business_not_found"
      | "resource_not_found"
      | "service_not_found"
      | "invalid_request"
      | "request_not_found"
      | "invalid_status"
      | "payment_required"
      | "conflict"
      | "spam_rejected"
  ) {
    super(code);
    this.name = "LiteBookingRequestError";
  }
}

export class LiteBookingRequestService {
  constructor(private readonly repository: LiteBookingRequestRepository) {}

  async getPublicCatalog(slug: string): Promise<LitePublicCatalog> {
    const business = await this.repository.findOrganizationBySlug(slug);
    if (!business?.slug) throw new LiteBookingRequestError("business_not_found");
    const [resources, services] = await Promise.all([
      this.repository.listActiveResources(business.id),
      this.repository.listActiveServices(business.id),
    ]);
    const servicesWithPricing = await Promise.all(
      services.map(async (service) => {
        const quote = calculateServicePaymentQuote(
          await this.repository.findPaymentRule(business.id, service.id)
        );
        return { ...service, ...quote };
      })
    );
    return {
      business: { id: business.id, name: business.name, slug: business.slug },
      resources,
      services: servicesWithPricing,
    };
  }

  async submitPublicRequest(input: PublicLiteRequestInput): Promise<LiteBookingRequest> {
    const parsed = publicRequestSchema.parse(input);
    if (parsed.website) throw new LiteBookingRequestError("spam_rejected");
    const business = await this.repository.findOrganizationBySlug(parsed.businessSlug);
    if (!business) throw new LiteBookingRequestError("business_not_found");
    const [resource, service] = await Promise.all([
      parsed.resourceId
        ? this.repository.findResourceById(business.id, parsed.resourceId)
        : Promise.resolve(null),
      this.repository.findServiceById(business.id, parsed.serviceId),
    ]);
    if (parsed.resourceId && !resource) throw new LiteBookingRequestError("resource_not_found");
    if (!service) throw new LiteBookingRequestError("service_not_found");
    if (resource && parsed.partySize > resource.capacity) {
      throw new LiteBookingRequestError("invalid_request");
    }

    const startsAt = parsed.startsAt;
    const endsAt =
      parsed.endsAt ?? new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    if (endsAt <= startsAt) throw new LiteBookingRequestError("invalid_request");

    const now = parsed.now ?? new Date();
    const request: LiteBookingRequest = {
      id: newId("liteBookingRequest"),
      organizationId: business.id,
      resourceId: resource?.id ?? null,
      serviceId: service.id,
      reservationId: null,
      status: "new",
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      customerEmail: parsed.customerEmail ?? null,
      partySize: parsed.partySize,
      startsAt,
      endsAt,
      customerNote: parsed.customerNote ?? null,
      operatorNote: null,
      paymentStatus: "not_required",
      paymentExpectedAmountMinor: null,
      paymentCurrency: "PYG",
      paymentInstructions: null,
      paymentEvidenceRedacted: null,
      source: "public_lite_page",
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.createRequest(
      request,
      event({
        request,
        eventType: "lite_request_submitted",
        actorType: "customer",
        metadataRedacted: { source: request.source },
        now,
      })
    );
  }

  async list(input: {
    organizationId: string;
    statuses?: LiteBookingRequestStatus[];
    limit?: number;
  }): Promise<LiteRequestListItem[]> {
    return this.repository.listRequests({
      organizationId: input.organizationId,
      statuses: input.statuses,
      limit: Math.min(Math.max(input.limit ?? 100, 1), 200),
    });
  }

  async updateStatus(input: {
    organizationId: string;
    requestId: string;
    status: LiteBookingRequestStatus;
    actorUserId: string;
    operatorNote?: string | null;
    now?: Date;
  }): Promise<LiteBookingRequest> {
    const current = await this.get(input.organizationId, input.requestId);
    if (current.status === "confirmed") throw new LiteBookingRequestError("invalid_status");
    const now = input.now ?? new Date();
    const next: LiteBookingRequest = {
      ...current,
      status: input.status,
      operatorNote: input.operatorNote ?? current.operatorNote,
      updatedAt: now,
    };
    return this.repository.updateRequest(
      next,
      event({
        request: next,
        eventType: "lite_request_status_changed",
        actorType: "operator",
        actorId: input.actorUserId,
        metadataRedacted: { fromStatus: current.status, toStatus: input.status },
        now,
      })
    );
  }

  async requestPayment(input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    expectedAmountMinor?: number | null;
    currency?: string | null;
    instructions: string;
    now?: Date;
  }): Promise<LiteBookingRequest> {
    const current = await this.get(input.organizationId, input.requestId);
    const rule = await this.repository.findPaymentRule(current.organizationId, current.serviceId);
    const quote = calculateServicePaymentQuote(rule);
    const expectedAmountMinor =
      input.expectedAmountMinor ?? quote.depositDue?.amountMinor ?? null;
    if (!expectedAmountMinor || expectedAmountMinor <= 0) {
      throw new LiteBookingRequestError("invalid_request");
    }
    const now = input.now ?? new Date();
    const next: LiteBookingRequest = {
      ...current,
      status: "waiting_for_payment",
      paymentStatus: "requested",
      paymentExpectedAmountMinor: expectedAmountMinor,
      paymentCurrency: (input.currency ?? quote.depositDue?.currency ?? "PYG").toUpperCase(),
      paymentInstructions: input.instructions,
      updatedAt: now,
    };
    return this.repository.updateRequest(
      next,
      event({
        request: next,
        eventType: "lite_payment_requested",
        actorType: "operator",
        actorId: input.actorUserId,
        metadataRedacted: {
          expectedAmountMinor: next.paymentExpectedAmountMinor,
          currency: next.paymentCurrency,
        },
        now,
      })
    );
  }

  async recordPaymentEvidence(input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    evidenceRedacted: string;
    now?: Date;
  }): Promise<LiteBookingRequest> {
    const current = await this.get(input.organizationId, input.requestId);
    if (current.paymentStatus === "not_required") {
      throw new LiteBookingRequestError("invalid_status");
    }
    const now = input.now ?? new Date();
    const next: LiteBookingRequest = {
      ...current,
      paymentStatus: "evidence_received",
      paymentEvidenceRedacted: input.evidenceRedacted.slice(0, 1000),
      updatedAt: now,
    };
    return this.repository.updateRequest(
      next,
      event({
        request: next,
        eventType: "lite_payment_evidence_recorded",
        actorType: "operator",
        actorId: input.actorUserId,
        metadataRedacted: { evidenceStored: true },
        now,
      })
    );
  }

  async approvePayment(input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    now?: Date;
  }): Promise<LiteBookingRequest> {
    const current = await this.get(input.organizationId, input.requestId);
    if (!["requested", "evidence_received"].includes(current.paymentStatus)) {
      throw new LiteBookingRequestError("invalid_status");
    }
    const now = input.now ?? new Date();
    const next: LiteBookingRequest = {
      ...current,
      paymentStatus: "approved",
      updatedAt: now,
    };
    return this.repository.updateRequest(
      next,
      event({
        request: next,
        eventType: "lite_payment_approved",
        actorType: "operator",
        actorId: input.actorUserId,
        now,
      })
    );
  }

  async rejectPayment(input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    now?: Date;
  }): Promise<LiteBookingRequest> {
    const current = await this.get(input.organizationId, input.requestId);
    if (!["requested", "evidence_received"].includes(current.paymentStatus)) {
      throw new LiteBookingRequestError("invalid_status");
    }
    const now = input.now ?? new Date();
    const next: LiteBookingRequest = {
      ...current,
      paymentStatus: "rejected",
      updatedAt: now,
    };
    return this.repository.updateRequest(
      next,
      event({
        request: next,
        eventType: "lite_payment_rejected",
        actorType: "operator",
        actorId: input.actorUserId,
        now,
      })
    );
  }

  async confirm(input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    now?: Date;
  }): Promise<{ request: LiteBookingRequest; reservation: Reservation }> {
    const current = await this.get(input.organizationId, input.requestId);
    if (current.status === "confirmed" && current.reservationId) {
      throw new LiteBookingRequestError("invalid_status");
    }
    if (current.paymentStatus !== "not_required" && current.paymentStatus !== "approved") {
      throw new LiteBookingRequestError("payment_required");
    }
    const now = input.now ?? new Date();
    const reservation: Reservation = {
      id: newId("reservation"),
      organizationId: current.organizationId,
      resourceId: current.resourceId ?? "",
      serviceId: current.serviceId,
      contactId: null,
      holdId: null,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    if (!reservation.resourceId) throw new LiteBookingRequestError("resource_not_found");
    const history: ReservationStatusHistory = {
      id: newId("reservationStatusHistory"),
      organizationId: current.organizationId,
      reservationId: reservation.id,
      status: "confirmed",
      reason: "lite_manual_request_confirmed",
      createdAt: now,
    };
    const next: LiteBookingRequest = {
      ...current,
      status: "confirmed",
      reservationId: reservation.id,
      updatedAt: now,
    };
    const result = await this.repository.createReservationFromRequest({
      request: next,
      reservation,
      history,
      contact: {
        id: newId("contact"),
        organizationId: current.organizationId,
        name: current.customerName,
        phone: current.customerPhone,
        now,
      },
      event: event({
        request: next,
        eventType: "lite_request_confirmed",
        actorType: "operator",
        actorId: input.actorUserId,
        metadataRedacted: { reservationId: reservation.id },
        now,
      }),
      now,
    });
    if (!result.ok) throw new LiteBookingRequestError(result.code);
    return { request: result.request, reservation: result.reservation };
  }

  async get(organizationId: string, requestId: string): Promise<LiteBookingRequest> {
    const request = await this.repository.findRequestById(organizationId, requestId);
    if (!request) throw new LiteBookingRequestError("request_not_found");
    return request;
  }
}

export class DrizzleLiteBookingRequestRepository implements LiteBookingRequestRepository {
  constructor(private readonly db = getDb()) {}

  async findOrganizationBySlug(slug: string) {
    const rows = await this.db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
      })
      .from(schema.organization)
      .where(eq(schema.organization.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  async listActiveResources(organizationId: string): Promise<ReservableResource[]> {
    const rows = await this.db
      .select()
      .from(schema.resource)
      .where(and(eq(schema.resource.organizationId, organizationId), eq(schema.resource.active, true)))
      .orderBy(asc(schema.resource.sortOrder), asc(schema.resource.name));
    return rows;
  }

  async listActiveServices(organizationId: string): Promise<ReservationServiceDefinition[]> {
    const rows = await this.db
      .select()
      .from(schema.reservationService)
      .where(
        and(
          eq(schema.reservationService.organizationId, organizationId),
          eq(schema.reservationService.active, true)
        )
      )
      .orderBy(asc(schema.reservationService.sortOrder), asc(schema.reservationService.name));
    return rows;
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

  async findServiceById(
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
    return rows[0] ? { ...rows[0], depositType: rows[0].depositType as ServicePaymentRule["depositType"] } : null;
  }

  async createRequest(
    request: LiteBookingRequest,
    requestEvent: LiteBookingRequestEvent
  ): Promise<LiteBookingRequest> {
    const rows = await this.db
      .insert(schema.liteBookingRequest)
      .values(request)
      .returning();
    if (!rows[0]) throw new Error("lite_booking_request_create_failed");
    await this.db.insert(schema.liteBookingRequestEvent).values(requestEvent);
    return rowToLiteRequest(rows[0]);
  }

  async findRequestById(
    organizationId: string,
    id: string
  ): Promise<LiteBookingRequest | null> {
    const rows = await this.db
      .select()
      .from(schema.liteBookingRequest)
      .where(
        and(
          eq(schema.liteBookingRequest.organizationId, organizationId),
          eq(schema.liteBookingRequest.id, id)
        )
      )
      .limit(1);
    return rows[0] ? rowToLiteRequest(rows[0]) : null;
  }

  async listRequests(input: {
    organizationId: string;
    statuses?: LiteBookingRequestStatus[];
    limit: number;
  }): Promise<LiteRequestListItem[]> {
    const statusSet = input.statuses?.length ? new Set(input.statuses) : null;
    const rows = await this.db
      .select({
        request: schema.liteBookingRequest,
        resource: schema.resource,
        service: schema.reservationService,
      })
      .from(schema.liteBookingRequest)
      .leftJoin(schema.resource, eq(schema.liteBookingRequest.resourceId, schema.resource.id))
      .innerJoin(
        schema.reservationService,
        eq(schema.liteBookingRequest.serviceId, schema.reservationService.id)
      )
      .where(eq(schema.liteBookingRequest.organizationId, input.organizationId))
      .orderBy(desc(schema.liteBookingRequest.createdAt))
      .limit(input.limit);

    const items: LiteRequestListItem[] = [];
    for (const row of rows) {
      const request = rowToLiteRequest(row.request);
      if (statusSet && !statusSet.has(request.status)) continue;
      items.push({
        ...request,
        resource: row.resource
          ? {
              id: row.resource.id,
              name: row.resource.name,
              kind: row.resource.kind,
              capacity: row.resource.capacity,
              location: row.resource.location,
            }
          : null,
        service: {
          id: row.service.id,
          name: row.service.name,
          durationMinutes: row.service.durationMinutes,
        },
        duplicateRisk: await this.hasReservationConflict(request),
      });
    }
    return items;
  }

  async updateRequest(
    request: LiteBookingRequest,
    requestEvent: LiteBookingRequestEvent
  ): Promise<LiteBookingRequest> {
    const rows = await this.db
      .update(schema.liteBookingRequest)
      .set(request)
      .where(
        and(
          eq(schema.liteBookingRequest.organizationId, request.organizationId),
          eq(schema.liteBookingRequest.id, request.id)
        )
      )
      .returning();
    if (!rows[0]) throw new Error("lite_booking_request_update_failed");
    await this.db.insert(schema.liteBookingRequestEvent).values(requestEvent);
    return rowToLiteRequest(rows[0]);
  }

  async createReservationFromRequest(input: {
    request: LiteBookingRequest;
    reservation: Reservation;
    history: ReservationStatusHistory;
    contact: { id: string; organizationId: string; name: string; phone: string; now: Date };
    event: LiteBookingRequestEvent;
    now: Date;
  }): Promise<
    { ok: true; request: LiteBookingRequest; reservation: Reservation } | { ok: false; code: "conflict" }
  > {
    return this.db.transaction(async (tx) => {
      const existingContact = await tx
        .select()
        .from(schema.contact)
        .where(
          and(
            eq(schema.contact.organizationId, input.contact.organizationId),
            eq(schema.contact.phone, input.contact.phone)
          )
        )
        .limit(1);
      let contact = existingContact[0];
      if (!contact) {
        const insertedContacts = await tx
          .insert(schema.contact)
          .values({
            id: input.contact.id,
            organizationId: input.contact.organizationId,
            name: input.contact.name,
            phone: input.contact.phone,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
        contact = insertedContacts[0];
      }
      if (!contact) return { ok: false, code: "conflict" };

      const reservation = { ...input.reservation, contactId: contact.id };
      const conflict = await tx
        .select({ id: schema.reservation.id })
        .from(schema.reservation)
        .where(
          and(
            eq(schema.reservation.organizationId, reservation.organizationId),
            eq(schema.reservation.resourceId, reservation.resourceId),
            eq(schema.reservation.status, "confirmed"),
            lt(schema.reservation.startsAt, reservation.endsAt),
            gt(schema.reservation.endsAt, reservation.startsAt)
          )
        )
        .limit(1);
      if (conflict[0]) return { ok: false, code: "conflict" };

      const inserted = await tx.insert(schema.reservation).values(reservation).returning();
      const savedReservation = inserted[0];
      if (!savedReservation) return { ok: false, code: "conflict" };
      await tx.insert(schema.reservationStatusHistory).values(input.history);

      const updatedRequest = {
        ...input.request,
        reservationId: savedReservation.id,
        updatedAt: input.now,
      };
      const requestRows = await tx
        .update(schema.liteBookingRequest)
        .set(updatedRequest)
        .where(
          and(
            eq(schema.liteBookingRequest.organizationId, input.request.organizationId),
            eq(schema.liteBookingRequest.id, input.request.id)
          )
        )
        .returning();
      if (!requestRows[0]) return { ok: false, code: "conflict" };
      await tx.insert(schema.liteBookingRequestEvent).values(input.event);
      return {
        ok: true,
        request: rowToLiteRequest(requestRows[0]),
        reservation: savedReservation,
      };
    });
  }

  private async hasReservationConflict(request: LiteBookingRequest): Promise<boolean> {
    if (!request.resourceId || request.status === "confirmed") return false;
    const rows = await this.db
      .select({ id: schema.reservation.id })
      .from(schema.reservation)
      .where(
        and(
          eq(schema.reservation.organizationId, request.organizationId),
          eq(schema.reservation.resourceId, request.resourceId),
          eq(schema.reservation.status, "confirmed"),
          lt(schema.reservation.startsAt, request.endsAt),
          gt(schema.reservation.endsAt, request.startsAt)
        )
      )
      .limit(1);
    return Boolean(rows[0]);
  }
}

export function createLiteBookingRequestService(): LiteBookingRequestService {
  return new LiteBookingRequestService(new DrizzleLiteBookingRequestRepository());
}

export function serializeLiteRequest(request: LiteBookingRequest | LiteRequestListItem) {
  return {
    id: request.id,
    resourceId: request.resourceId,
    serviceId: request.serviceId,
    reservationId: request.reservationId,
    status: request.status,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    customerEmail: request.customerEmail,
    partySize: request.partySize,
    startsAt: request.startsAt.toISOString(),
    endsAt: request.endsAt.toISOString(),
    customerNote: request.customerNote,
    operatorNote: request.operatorNote,
    paymentStatus: request.paymentStatus,
    paymentExpectedAmountMinor: request.paymentExpectedAmountMinor,
    paymentCurrency: request.paymentCurrency,
    paymentInstructions: request.paymentInstructions,
    paymentEvidenceRedacted: request.paymentEvidenceRedacted,
    source: request.source,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    resource: "resource" in request ? request.resource : undefined,
    service: "service" in request ? request.service : undefined,
    duplicateRisk: "duplicateRisk" in request ? request.duplicateRisk : undefined,
  };
}

export function liteRequestErrorResponse(error: unknown): Response {
  if (error instanceof LiteBookingRequestError) {
    const statusByCode: Record<LiteBookingRequestError["code"], number> = {
      business_not_found: 404,
      resource_not_found: 404,
      service_not_found: 404,
      request_not_found: 404,
      invalid_request: 422,
      invalid_status: 409,
      payment_required: 409,
      conflict: 409,
      spam_rejected: 204,
    };
    return Response.json(
      { error: { code: error.code, message: liteErrorMessage(error.code) } },
      { status: statusByCode[error.code] }
    );
  }
  throw error;
}

export type PublicLiteRequestInput = z.input<typeof publicRequestSchema>;

const publicRequestSchema = z.object({
  businessSlug: z.string().trim().min(1).max(120),
  serviceId: z.string().trim().min(1),
  resourceId: z.string().trim().min(1).nullable().optional(),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(6).max(40),
  customerEmail: z.string().trim().email().nullable().optional(),
  partySize: z.coerce.number().int().min(1).max(10000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  customerNote: z.string().trim().max(1200).nullable().optional(),
  website: z.string().optional(),
  now: z.date().optional(),
});

function event(input: {
  request: LiteBookingRequest;
  eventType: string;
  actorType: LiteBookingRequestEvent["actorType"];
  actorId?: string | null;
  metadataRedacted?: Record<string, unknown> | null;
  now: Date;
}): LiteBookingRequestEvent {
  return {
    id: newId("liteBookingRequestEvent"),
    organizationId: input.request.organizationId,
    requestId: input.request.id,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    metadataRedacted: input.metadataRedacted ?? null,
    createdAt: input.now,
  };
}

function rowToLiteRequest(
  row: typeof schema.liteBookingRequest.$inferSelect
): LiteBookingRequest {
  return {
    ...row,
    status: liteBookingRequestStatusSchema.parse(row.status),
    paymentStatus: litePaymentStatusSchema.parse(row.paymentStatus),
  };
}

function liteErrorMessage(code: LiteBookingRequestError["code"]): string {
  const messages: Record<LiteBookingRequestError["code"], string> = {
    business_not_found: "Negocio no encontrado",
    resource_not_found: "Recurso no encontrado",
    service_not_found: "Servicio no encontrado",
    request_not_found: "Solicitud no encontrada",
    invalid_request: "Solicitud inválida",
    invalid_status: "Estado inválido para esta acción",
    payment_required: "La seña debe aprobarse antes de confirmar",
    conflict: "Ya existe una reserva confirmada para ese recurso y horario",
    spam_rejected: "Solicitud rechazada",
  };
  return messages[code];
}
