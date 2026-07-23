import type { ReservationServiceDto } from "@/lib/types";

export type ReservationHoldFormValues = {
  conversationId: string;
  contactId: string;
  resourceId: string;
  serviceId: string;
  localDate: string;
  localTime: string;
};

export type ReservationHoldPayload = {
  resourceId: string;
  serviceId: string;
  contactId: string;
  startsAt: string;
  endsAt: string;
  idempotencyKey: string;
};

export function buildReservationHoldPayload(
  values: ReservationHoldFormValues,
  services: ReservationServiceDto[]
): ReservationHoldPayload {
  const service = services.find((item) => item.id === values.serviceId);
  if (!service) throw new Error("service_not_found");
  if (!values.contactId) throw new Error("contact_required");
  if (!values.resourceId) throw new Error("resource_required");
  if (!values.localDate || !values.localTime) throw new Error("time_required");

  const startsAt = new Date(`${values.localDate}T${values.localTime}:00`);
  if (Number.isNaN(startsAt.getTime())) throw new Error("invalid_time");
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  const rawKey = [
    "inbox_hold",
    values.conversationId,
    values.contactId,
    values.resourceId,
    values.serviceId,
    startsAt.toISOString(),
    endsAt.toISOString(),
  ].join(":");

  return {
    resourceId: values.resourceId,
    serviceId: values.serviceId,
    contactId: values.contactId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    idempotencyKey: `inbox_hold_${stableHash(rawKey)}`,
  };
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
