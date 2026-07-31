import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import type { ReservationListItem } from "@/server/reservations/list";

export function buildReservationIcs(input: {
  businessName: string;
  reservation: Pick<
    ReservationListItem,
    "id" | "startsAt" | "endsAt" | "resource" | "service" | "contact"
  >;
  generatedAt?: Date;
}): string {
  const generatedAt = input.generatedAt ?? new Date();
  const summary = escapeIcsText(
    `${input.reservation.service.name} - ${input.reservation.resource.name}`
  );
  const description = escapeIcsText(
    [
      `Reserva confirmada en ${input.businessName}`,
      input.reservation.contact
        ? `Cliente: ${input.reservation.contact.name} (${input.reservation.contact.phone})`
        : "Cliente: sin contacto asignado",
      "Exportado manualmente desde Reservas CRM Lite.",
    ].join("\\n")
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Reservas CRM//Lite Calendar Export//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.reservation.id)}@reservas-crm`,
    `DTSTAMP:${formatIcsDate(generatedAt)}`,
    `DTSTART:${formatIcsDate(input.reservation.startsAt)}`,
    `DTEND:${formatIcsDate(input.reservation.endsAt)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function buildDailyReservationSummary(input: {
  now: Date;
  reservations: ReservationListItem[];
}) {
  const upcoming = input.reservations.filter(
    (item) => item.type === "reservation" && item.status === "confirmed" && item.endsAt >= input.now
  );
  return {
    count: upcoming.length,
    next: upcoming.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, 10),
  };
}

export const liteCalendarEventKindSchema = z.enum([
  "confirmed_reservation",
  "booking_request",
  "payment_pending",
  "manual_availability",
]);

export type LiteCalendarEventKind = z.infer<typeof liteCalendarEventKindSchema>;

export type LiteCalendarEvent = {
  id: string;
  sourceId: string;
  kind: LiteCalendarEventKind;
  title: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  calendarId: string;
  resourceId: string | null;
  resourceName: string | null;
  serviceName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  paymentExpectedDisplay: string | null;
  description: string;
  actionHref: string | null;
};

export type LiteCalendarSummary = {
  confirmedReservations: number;
  pendingRequests: number;
  paymentPending: number;
  manualBlocks: number;
};

export type LiteCalendarFeed = {
  events: LiteCalendarEvent[];
  summary: LiteCalendarSummary;
  range: { from: Date; to: Date };
};

type Db = ReturnType<typeof getDb>;

type ReservationCalendarRow = {
  id: string;
  resourceId: string;
  resourceName: string;
  serviceName: string;
  customerName: string | null;
  customerPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

type RequestCalendarRow = {
  id: string;
  resourceId: string | null;
  resourceName: string | null;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  customerNote: string | null;
  operatorNote: string | null;
  paymentExpectedAmountMinor: number | null;
  paymentCurrency: string;
  paymentStatus: string;
};

type AvailabilityBlockCalendarRow = {
  id: string;
  resourceId: string;
  resourceName: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  label: string | null;
  operatorNote: string | null;
};

export class LiteCalendarService {
  constructor(private readonly db: Db = getDb()) {}

  async buildCalendar(input: {
    organizationId: string;
    from: Date;
    to: Date;
  }): Promise<LiteCalendarFeed> {
    const parsed = calendarInputSchema.parse(input);
    if (parsed.to <= parsed.from) throw new LiteCalendarError("invalid_range");

    const [reservations, requests, blocks] = await Promise.all([
      this.listReservations(parsed.organizationId, parsed.from, parsed.to),
      this.listRequests(parsed.organizationId, parsed.from, parsed.to),
      this.listAvailabilityBlocks(parsed.organizationId, parsed.from, parsed.to),
    ]);

    return buildLiteCalendarFeed({
      from: parsed.from,
      to: parsed.to,
      reservations,
      requests,
      blocks,
    });
  }

  private async listReservations(
    organizationId: string,
    from: Date,
    to: Date
  ): Promise<ReservationCalendarRow[]> {
    return this.db
      .select({
        id: schema.reservation.id,
        resourceId: schema.resource.id,
        resourceName: schema.resource.name,
        serviceName: schema.reservationService.name,
        customerName: schema.contact.name,
        customerPhone: schema.contact.phone,
        startsAt: schema.reservation.startsAt,
        endsAt: schema.reservation.endsAt,
        status: schema.reservation.status,
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
          lte(schema.reservation.startsAt, to),
          gte(schema.reservation.endsAt, from)
        )
      )
      .orderBy(asc(schema.reservation.startsAt));
  }

  private async listRequests(
    organizationId: string,
    from: Date,
    to: Date
  ): Promise<RequestCalendarRow[]> {
    const rows = await this.db
      .select({
        id: schema.liteBookingRequest.id,
        resourceId: schema.liteBookingRequest.resourceId,
        resourceName: schema.resource.name,
        serviceName: schema.reservationService.name,
        customerName: schema.liteBookingRequest.customerName,
        customerPhone: schema.liteBookingRequest.customerPhone,
        startsAt: schema.liteBookingRequest.startsAt,
        endsAt: schema.liteBookingRequest.endsAt,
        status: schema.liteBookingRequest.status,
        customerNote: schema.liteBookingRequest.customerNote,
        operatorNote: schema.liteBookingRequest.operatorNote,
        paymentExpectedAmountMinor: schema.liteBookingRequest.paymentExpectedAmountMinor,
        paymentCurrency: schema.liteBookingRequest.paymentCurrency,
        paymentStatus: schema.liteBookingRequest.paymentStatus,
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
            "declined",
            "expired",
          ]),
          lte(schema.liteBookingRequest.startsAt, to),
          gte(schema.liteBookingRequest.endsAt, from)
        )
      )
      .orderBy(asc(schema.liteBookingRequest.startsAt));
    return rows;
  }

  private async listAvailabilityBlocks(
    organizationId: string,
    from: Date,
    to: Date
  ): Promise<AvailabilityBlockCalendarRow[]> {
    return this.db
      .select({
        id: schema.liteAvailabilityBlock.id,
        resourceId: schema.liteAvailabilityBlock.resourceId,
        resourceName: schema.resource.name,
        startsAt: schema.liteAvailabilityBlock.startsAt,
        endsAt: schema.liteAvailabilityBlock.endsAt,
        status: schema.liteAvailabilityBlock.status,
        label: schema.liteAvailabilityBlock.label,
        operatorNote: schema.liteAvailabilityBlock.operatorNote,
      })
      .from(schema.liteAvailabilityBlock)
      .innerJoin(schema.resource, eq(schema.liteAvailabilityBlock.resourceId, schema.resource.id))
      .where(
        and(
          eq(schema.liteAvailabilityBlock.organizationId, organizationId),
          lte(schema.liteAvailabilityBlock.startsAt, to),
          gte(schema.liteAvailabilityBlock.endsAt, from)
        )
      )
      .orderBy(asc(schema.liteAvailabilityBlock.startsAt));
  }
}

export class LiteCalendarError extends Error {
  constructor(readonly code: "invalid_range") {
    super(code);
    this.name = "LiteCalendarError";
  }
}

export function buildLiteCalendarFeed(input: {
  from: Date;
  to: Date;
  reservations: ReservationCalendarRow[];
  requests: RequestCalendarRow[];
  blocks: AvailabilityBlockCalendarRow[];
}): LiteCalendarFeed {
  const reservationEvents = input.reservations.map(mapReservationEvent);
  const requestEvents = input.requests.map(mapRequestEvent);
  const blockEvents = input.blocks.map(mapBlockEvent);
  const events = [...reservationEvents, ...requestEvents, ...blockEvents].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  );
  return {
    events,
    summary: {
      confirmedReservations: reservationEvents.length,
      pendingRequests: requestEvents.filter((event) => event.kind === "booking_request").length,
      paymentPending: requestEvents.filter((event) => event.kind === "payment_pending").length,
      manualBlocks: blockEvents.length,
    },
    range: { from: input.from, to: input.to },
  };
}

export function serializeLiteCalendarFeed(feed: LiteCalendarFeed) {
  return {
    events: feed.events.map((event) => ({
      ...event,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
    })),
    summary: feed.summary,
    range: {
      from: feed.range.from.toISOString(),
      to: feed.range.to.toISOString(),
    },
  };
}

function mapReservationEvent(row: ReservationCalendarRow): LiteCalendarEvent {
  return {
    id: `reservation:${row.id}`,
    sourceId: row.id,
    kind: "confirmed_reservation",
    title: `Confirmada · ${row.serviceName}`,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    calendarId: "confirmed",
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    serviceName: row.serviceName,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    paymentExpectedDisplay: null,
    description: compactDetails([
      row.customerName ? `Cliente: ${row.customerName}` : null,
      row.customerPhone ? `WhatsApp: ${row.customerPhone}` : null,
      `Recurso: ${row.resourceName}`,
    ]),
    actionHref: `/reservations`,
  };
}

function mapRequestEvent(row: RequestCalendarRow): LiteCalendarEvent {
  const paymentPending = row.status === "waiting_for_payment";
  const paymentExpectedDisplay =
    row.paymentExpectedAmountMinor == null
      ? null
      : formatMoney(row.paymentExpectedAmountMinor, row.paymentCurrency);
  return {
    id: `lite-request:${row.id}`,
    sourceId: row.id,
    kind: paymentPending ? "payment_pending" : "booking_request",
    title: `${paymentPending ? "Seña pendiente" : "Solicitud"} · ${row.serviceName}`,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    calendarId: paymentPending ? "payment" : requestCalendarId(row.status),
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    serviceName: row.serviceName,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    paymentExpectedDisplay,
    description: compactDetails([
      `Cliente: ${row.customerName}`,
      `WhatsApp: ${row.customerPhone}`,
      row.resourceName ? `Recurso: ${row.resourceName}` : "Recurso: a sugerir",
      `Estado: ${row.status}`,
      paymentExpectedDisplay ? `Seña: ${paymentExpectedDisplay}` : null,
      row.customerNote ? `Nota cliente: ${redactForCalendar(row.customerNote)}` : null,
    ]),
    actionHref: `/lite`,
  };
}

function mapBlockEvent(row: AvailabilityBlockCalendarRow): LiteCalendarEvent {
  const label = row.label ?? blockStatusLabel(row.status);
  return {
    id: `manual-block:${row.id}`,
    sourceId: row.id,
    kind: "manual_availability",
    title: `${blockStatusLabel(row.status)} · ${label}`,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    calendarId: blockCalendarId(row.status),
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    serviceName: null,
    customerName: null,
    customerPhone: null,
    paymentExpectedDisplay: null,
    description: compactDetails([
      `Recurso: ${row.resourceName}`,
      `Estado: ${blockStatusLabel(row.status)}`,
      row.operatorNote ? `Nota: ${redactForCalendar(row.operatorNote)}` : null,
    ]),
    actionHref: `/lite/operator`,
  };
}

function requestCalendarId(status: string): string {
  if (status === "declined" || status === "expired") return "muted";
  if (status === "waiting_for_customer") return "customer";
  return "request";
}

function blockCalendarId(status: string): string {
  if (status === "available") return "available";
  if (status === "tentative") return "tentative";
  return "blocked";
}

function blockStatusLabel(status: string): string {
  if (status === "available") return "Disponible";
  if (status === "busy") return "Ocupado";
  if (status === "tentative") return "Tentativo";
  if (status === "blocked") return "Bloqueado";
  return status;
}

function compactDetails(parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join("\n");
}

function redactForCalendar(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amountMinor);
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

const calendarInputSchema = z.object({
  organizationId: z.string().min(1),
  from: z.date(),
  to: z.date(),
});
