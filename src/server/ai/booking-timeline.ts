import type { AiBookingActorType, AiBookingSessionEvent } from "@/server/ai/booking-sessions";

export type AiBookingTimelineItem = {
  id: string;
  eventType: string;
  label: string;
  actorLabel: string;
  metadataSummary: string | null;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  "ai_booking.session_started": "Reserva iniciada",
  "ai_booking.option_presented": "Opción presentada",
  "ai_booking.awaiting_customer_confirmation": "Esperando confirmación del cliente",
  "ai_booking.hold_created": "Hold creado",
  "ai_booking.payment_evidence_requested": "Comprobante solicitado",
  "ai_booking.payment_review_requested": "Pago enviado a revisión",
  "ai_booking.reservation_confirmed": "Reserva confirmada",
  "ai_booking.confirmed": "Reserva confirmada",
  "ai_booking.rejected": "Reserva rechazada",
  "ai_booking.expired": "Reserva expirada",
  "ai_booking.escalated": "Pasó a humano",
};

const ACTOR_LABELS: Record<AiBookingActorType, string> = {
  system: "CRM",
  operator: "Operador",
  ai: "IA",
  customer: "Cliente",
};

export function serializeAiBookingTimeline(
  events: AiBookingSessionEvent[]
): AiBookingTimelineItem[] {
  return [...events]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((event) => ({
      id: event.id,
      eventType: event.eventType,
      label: EVENT_LABELS[event.eventType] ?? humanizeEventType(event.eventType),
      actorLabel: ACTOR_LABELS[event.actorType],
      metadataSummary: summarizeMetadata(event.metadataRedacted),
      createdAt: event.createdAt.toISOString(),
    }));
}

function humanizeEventType(eventType: string): string {
  return eventType
    .replace(/^ai_booking\./, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function summarizeMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const parts: string[] = [];
  if (typeof metadata.fromStatus === "string" && typeof metadata.toStatus === "string") {
    parts.push(`${statusLabel(metadata.fromStatus)} → ${statusLabel(metadata.toStatus)}`);
  }
  if (typeof metadata.optionsShown === "number") {
    parts.push(`${metadata.optionsShown} ${metadata.optionsShown === 1 ? "opción" : "opciones"}`);
  }
  if (typeof metadata.reason === "string") {
    parts.push(`Motivo: ${metadata.reason.slice(0, 80)}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function statusLabel(status: string): string {
  return status.replace(/[_-]+/g, " ");
}
