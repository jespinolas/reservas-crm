import { createHash } from "node:crypto";
import {
  AiBookingSessionError,
  AiBookingSessionService,
  DrizzleAiBookingSessionRepository,
  type AiBookingSession,
  type SelectedBookingOption,
} from "@/server/ai/booking-sessions";
import {
  AvailabilityOptionsError,
  createAvailabilityOptionsService,
  serializeAvailabilityOption,
  type AvailabilityOption,
  type AvailabilityOptionsResult,
} from "@/server/reservations/availability-options";

export type AiBookingOrchestratorContext = {
  organizationId: string;
  conversationId: string;
  contactId: string | null;
  now?: Date;
};

export type PresentBookingOptionsResult =
  | {
      ok: true;
      reply: string;
      session: AiBookingSession;
      options: ReturnType<typeof serializeAvailabilityOption>[];
      selectedOption: SelectedBookingOption | null;
    }
  | {
      ok: false;
      code: "booking_disabled" | "booking_not_ready" | "service_not_found" | "invalid_range";
      reply: string;
    };

export interface BookingAvailabilityFinder {
  findAvailableOptions(input: {
    organizationId: string;
    serviceId: string;
    rangeStart: Date;
    rangeEnd: Date;
    partySize?: number | null;
    maxOptions?: number;
    now?: Date;
  }): Promise<AvailabilityOptionsResult>;
}

export class AiBookingOrchestrator {
  constructor(
    private readonly sessions: Pick<
      AiBookingSessionService,
      "getSettings" | "getSessionByConversation" | "startSession" | "transition"
    >,
    private readonly availability: BookingAvailabilityFinder
  ) {}

  async presentOptions(input: {
    context: AiBookingOrchestratorContext;
    serviceId: string;
    rangeStart: Date;
    rangeEnd: Date;
    partySize?: number | null;
    maxOptions?: number;
  }): Promise<PresentBookingOptionsResult> {
    const settings = await this.sessions.getSettings(input.context.organizationId);
    if (settings.mode === "disabled") {
      return {
        ok: false,
        code: "booking_disabled",
        reply: "Todavía no tengo habilitada la toma automática de reservas. Te deriva una persona del equipo.",
      };
    }
    if (settings.mode !== "suggest_only" && settings.readinessStatus !== "ready") {
      return {
        ok: false,
        code: "booking_not_ready",
        reply: "Todavía falta completar la configuración de reservas. Te deriva una persona del equipo.",
      };
    }

    const session = await this.getOrStartSession(input);
    if (isTerminal(session)) {
      return {
        ok: false,
        code: "booking_not_ready",
        reply: "Esta conversación ya tiene una reserva cerrada o escalada. Te deriva una persona del equipo.",
      };
    }

    try {
      const result = await this.availability.findAvailableOptions({
        organizationId: input.context.organizationId,
        serviceId: input.serviceId,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        partySize: input.partySize ?? null,
        maxOptions: input.maxOptions ?? 3,
        now: input.context.now,
      });
      if (result.options.length === 0) {
        const updated = await this.transitionTowardOptions(session, {
          serviceId: input.serviceId,
          requestedStartsAt: input.rangeStart,
          requestedEndsAt: input.rangeEnd,
          partySize: input.partySize ?? null,
          selectedOptionJsonRedacted: null,
          metadataRedacted: { optionCount: 0 },
          now: input.context.now,
        });
        return {
          ok: true,
          reply: "No encontré disponibilidad para ese rango. Puedo revisar otra fecha u horario.",
          session: updated,
          options: [],
          selectedOption: null,
        };
      }

      const selectedOption = toSelectedOption(result.options[0]!, input.context.organizationId);
      const updated = await this.transitionTowardCustomerConfirmation(session, {
        option: selectedOption,
        partySize: input.partySize ?? null,
        now: input.context.now,
      });
      return {
        ok: true,
        reply: formatOptionReply(selectedOption),
        session: updated,
        options: result.options.map(serializeAvailabilityOption),
        selectedOption,
      };
    } catch (error) {
      if (error instanceof AvailabilityOptionsError) {
        return {
          ok: false,
          code: error.code,
          reply:
            error.code === "service_not_found"
              ? "No encontré ese servicio configurado para reservas. Te deriva una persona del equipo."
              : "No pude revisar ese rango de fechas. Te deriva una persona del equipo.",
        };
      }
      throw error;
    }
  }

  private async getOrStartSession(input: {
    context: AiBookingOrchestratorContext;
    serviceId: string;
    rangeStart: Date;
    rangeEnd: Date;
    partySize?: number | null;
  }): Promise<AiBookingSession> {
    const existing = await this.sessions.getSessionByConversation({
      organizationId: input.context.organizationId,
      conversationId: input.context.conversationId,
    });
    if (existing) return existing;
    return this.sessions.startSession({
      organizationId: input.context.organizationId,
      conversationId: input.context.conversationId,
      contactId: input.context.contactId,
      serviceId: input.serviceId,
      requestedStartsAt: input.rangeStart,
      requestedEndsAt: input.rangeEnd,
      partySize: input.partySize ?? null,
      actorType: "ai",
      now: input.context.now,
    });
  }

  private async transitionTowardOptions(
    session: AiBookingSession,
    input: {
      serviceId: string;
      requestedStartsAt: Date;
      requestedEndsAt: Date;
      partySize: number | null;
      selectedOptionJsonRedacted: SelectedBookingOption | null;
      metadataRedacted: Record<string, unknown>;
      now?: Date;
    }
  ): Promise<AiBookingSession> {
    if (session.status === "collecting_intent") {
      return this.sessions.transition({
        session,
        toStatus: "showing_options",
        actorType: "ai",
        eventType: "ai_booking.option_presented",
        serviceId: input.serviceId,
        requestedStartsAt: input.requestedStartsAt,
        requestedEndsAt: input.requestedEndsAt,
        partySize: input.partySize,
        selectedOptionJsonRedacted: input.selectedOptionJsonRedacted,
        metadataRedacted: input.metadataRedacted,
        now: input.now,
      });
    }
    if (session.status === "showing_options" || session.status === "awaiting_customer_confirmation") {
      return this.sessions.transition({
        session,
        toStatus: "showing_options",
        actorType: "ai",
        eventType: "ai_booking.option_presented",
        serviceId: input.serviceId,
        requestedStartsAt: input.requestedStartsAt,
        requestedEndsAt: input.requestedEndsAt,
        partySize: input.partySize,
        selectedOptionJsonRedacted: input.selectedOptionJsonRedacted,
        metadataRedacted: input.metadataRedacted,
        now: input.now,
      });
    }
    throw new AiBookingSessionError("invalid_transition");
  }

  private async transitionTowardCustomerConfirmation(
    session: AiBookingSession,
    input: {
      option: SelectedBookingOption;
      partySize: number | null;
      now?: Date;
    }
  ): Promise<AiBookingSession> {
    const showing = await this.transitionTowardOptions(session, {
      serviceId: input.option.serviceId,
      requestedStartsAt: new Date(input.option.startsAt),
      requestedEndsAt: new Date(input.option.endsAt),
      partySize: input.partySize,
      selectedOptionJsonRedacted: input.option,
      metadataRedacted: { optionCount: 1, selectedOptionId: input.option.optionId },
      now: input.now,
    });
    return this.sessions.transition({
      session: showing,
      toStatus: "awaiting_customer_confirmation",
      actorType: "ai",
      eventType: "ai_booking.awaiting_customer_confirmation",
      selectedOptionJsonRedacted: input.option,
      metadataRedacted: { selectedOptionId: input.option.optionId },
      now: input.now,
    });
  }
}

export function createAiBookingOrchestrator(): AiBookingOrchestrator {
  return new AiBookingOrchestrator(
    new AiBookingSessionService(new DrizzleAiBookingSessionRepository()),
    createAvailabilityOptionsService()
  );
}

function toSelectedOption(
  option: AvailabilityOption,
  organizationId: string
): SelectedBookingOption {
  const startsAt = option.startsAt.toISOString();
  const endsAt = option.endsAt.toISOString();
  return {
    optionId: createOptionId({
      organizationId,
      resourceId: option.resource.id,
      serviceId: option.service.id,
      startsAt,
      endsAt,
      partySize: option.partySize,
    }),
    resourceId: option.resource.id,
    resourceName: option.resource.name,
    serviceId: option.service.id,
    serviceName: option.service.name,
    startsAt,
    endsAt,
    partySize: option.partySize ?? undefined,
    capacity: option.resource.capacity,
    currency: option.priceEstimate?.currency ?? option.depositDue?.currency,
    amountMinor: option.priceEstimate?.amountMinor,
    depositRequired: Boolean(option.depositDue),
    depositAmountMinor: option.depositDue?.amountMinor,
  };
}

function createOptionId(input: Record<string, unknown>): string {
  return `opt_${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16)}`;
}

function formatOptionReply(option: SelectedBookingOption): string {
  const parts = [
    `Encontré disponible ${option.resourceName ?? "esta opción"} para ${formatRange(option.startsAt, option.endsAt)}.`,
  ];
  if (option.partySize) parts.push(`Capacidad solicitada: ${option.partySize} persona(s).`);
  if (option.amountMinor != null && option.currency) {
    parts.push(`Precio: ${formatMoney(option.amountMinor, option.currency)}.`);
  }
  if (option.depositRequired && option.depositAmountMinor != null && option.currency) {
    parts.push(`Para guardarla se pide una seña de ${formatMoney(option.depositAmountMinor, option.currency)}.`);
  }
  parts.push("¿Querés que te la guarde temporalmente?");
  return parts.join(" ");
}

function formatRange(startsAt: string, endsAt: string): string {
  const formatter = new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Asuncion",
  });
  return `${formatter.format(new Date(startsAt))} a ${formatter.format(new Date(endsAt))}`;
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amountMinor);
}

function isTerminal(session: AiBookingSession): boolean {
  return ["confirmed", "rejected", "expired", "escalated"].includes(session.status);
}
