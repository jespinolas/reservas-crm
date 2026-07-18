import {
  RESERVATION_TOOL_VERSION,
  type ReservationToolContext,
  type ReservationToolInput,
  type ReservationToolResult,
} from "@/server/ai/reservation-tools";

export type FootballReservationFlowInput = {
  resourceId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  idempotencyKey: string;
  confirm: boolean;
};

export type FootballReservationFlowOutput = {
  ok: boolean;
  stage: "unavailable" | "held" | "confirmed" | "error";
  messages: string[];
  hold?: Extract<ReservationToolResult, { ok: true; tool: "reservation.create_hold" }>["hold"];
  reservation?: Extract<
    ReservationToolResult,
    { ok: true; tool: "reservation.confirm_hold" }
  >["reservation"];
  alternatives?: Extract<
    ReservationToolResult,
    { ok: true; tool: "reservation.list_availability" }
  >["slots"];
  error?: Extract<ReservationToolResult, { ok: false }>;
};

export interface FootballReservationToolExecutor {
  execute(input: ReservationToolInput, context: ReservationToolContext): Promise<ReservationToolResult>;
}

export class FootballReservationFlow {
  constructor(private readonly tools: FootballReservationToolExecutor) {}

  async run(
    input: FootballReservationFlowInput,
    context: ReservationToolContext
  ): Promise<FootballReservationFlowOutput> {
    const availability = await this.tools.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.list_availability",
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        rangeStart: input.startsAt,
        rangeEnd: input.endsAt,
        maxSlots: 5,
      },
      context
    );
    if (!availability.ok) return errorOutput(availability);
    if (availability.tool !== "reservation.list_availability") {
      return unexpectedToolOutput();
    }

    const matchingSlot = availability.slots.find(
      (slot) =>
        slot.startsAt === input.startsAt.toISOString() &&
        slot.endsAt === input.endsAt.toISOString()
    );
    if (!matchingSlot) {
      return {
        ok: false,
        stage: "unavailable",
        alternatives: availability.slots,
        messages: [
          "Ese horario ya no aparece disponible.",
          availability.slots.length > 0
            ? `Puedo ofrecerte ${formatSlot(availability.slots[0]!)}.`
            : "No encontré horarios disponibles para ese rango.",
        ],
      };
    }

    const holdResult = await this.tools.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.create_hold",
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        idempotencyKey: input.idempotencyKey,
      },
      context
    );
    if (!holdResult.ok) return errorOutput(holdResult);
    if (holdResult.tool !== "reservation.create_hold") {
      return unexpectedToolOutput();
    }

    if (!input.confirm) {
      return {
        ok: true,
        stage: "held",
        hold: holdResult.hold,
        messages: [
          `Te guardé temporalmente la cancha para ${formatSlot(holdResult.hold)}.`,
          "Confirmame si querés reservar ese horario.",
        ],
      };
    }

    const reservationResult = await this.tools.execute(
      {
        version: RESERVATION_TOOL_VERSION,
        tool: "reservation.confirm_hold",
        holdId: holdResult.hold.id,
      },
      context
    );
    if (!reservationResult.ok) return errorOutput(reservationResult);
    if (reservationResult.tool !== "reservation.confirm_hold") {
      return unexpectedToolOutput();
    }

    return {
      ok: true,
      stage: "confirmed",
      hold: holdResult.hold,
      reservation: reservationResult.reservation,
      messages: [
        `Listo, tu reserva quedó confirmada para ${formatSlot(reservationResult.reservation)}.`,
      ],
    };
  }
}

function unexpectedToolOutput(): FootballReservationFlowOutput {
  return {
    ok: false,
    stage: "error",
    error: {
      ok: false,
      code: "internal",
      message: "Reservation tool returned an unexpected result",
    },
    messages: ["No pude completar la reserva en este momento. Lo revisa una persona del equipo."],
  };
}

function errorOutput(error: Extract<ReservationToolResult, { ok: false }>): FootballReservationFlowOutput {
  return {
    ok: false,
    stage: "error",
    error,
    messages: ["No pude completar la reserva en este momento. Lo revisa una persona del equipo."],
  };
}

function formatSlot(slot: { startsAt: string; endsAt: string }): string {
  return `${slot.startsAt} a ${slot.endsAt}`;
}
