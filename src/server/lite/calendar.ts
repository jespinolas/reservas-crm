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
