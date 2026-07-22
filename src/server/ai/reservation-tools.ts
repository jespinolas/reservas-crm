import { z } from "zod";
import {
  BookingError,
  type BookingHold,
  type Reservation,
} from "@/server/reservations/booking";
import {
  createReservationApiService,
  reservationApiErrorResponse,
  serializeHold,
  serializeReservation,
  type ReservationApiService,
} from "@/server/reservations/api";
import type { AvailabilitySlot } from "@/server/reservations/availability";

export const RESERVATION_TOOL_VERSION = "2026-07-18";

const baseToolSchema = z
  .object({
    version: z.literal(RESERVATION_TOOL_VERSION),
  })
  .strict();

export const reservationToolInputSchema = z.discriminatedUnion("tool", [
  baseToolSchema
    .extend({
      tool: z.literal("reservation.list_availability"),
      resourceId: z.string().trim().min(1),
      serviceId: z.string().trim().min(1),
      rangeStart: z.coerce.date(),
      rangeEnd: z.coerce.date(),
      maxSlots: z.number().int().min(1).max(50).default(10),
    })
    .strict(),
  baseToolSchema
    .extend({
      tool: z.literal("reservation.create_hold"),
      resourceId: z.string().trim().min(1),
      serviceId: z.string().trim().min(1),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      idempotencyKey: z.string().trim().min(1).max(200),
    })
    .strict(),
  baseToolSchema
    .extend({
      tool: z.literal("reservation.confirm_hold"),
      holdId: z.string().trim().min(1),
    })
    .strict(),
]);

export type ReservationToolInput = z.infer<typeof reservationToolInputSchema>;

export type ReservationToolContext = {
  organizationId: string;
  contactId: string | null;
  now?: Date;
};

export type ReservationToolResult =
  | {
      ok: true;
      tool: "reservation.list_availability";
      slots: ReturnType<typeof serializeSlot>[];
    }
  | {
      ok: true;
      tool: "reservation.create_hold";
      hold: ReturnType<typeof serializeHold>;
    }
  | {
      ok: true;
      tool: "reservation.confirm_hold";
      reservation: ReturnType<typeof serializeReservation>;
    }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "booking_conflict"
        | "booking_not_active"
        | "hold_expired"
        | "hold_not_found"
        | "resource_not_found"
        | "service_not_found"
        | "contact_not_found"
        | "internal";
      message: string;
    };

export interface ReservationToolAvailabilityReader {
  listSlots(input: {
    organizationId: string;
    resourceId: string;
    serviceId: string;
    rangeStart: Date;
    rangeEnd: Date;
  }): Promise<AvailabilitySlot[]>;
}

export class ReservationToolExecutor {
  constructor(
    private readonly apiService: Pick<ReservationApiService, "createHold" | "confirmHold">,
    private readonly availabilityReader: ReservationToolAvailabilityReader
  ) {}

  async execute(
    rawInput: unknown,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const parsed = reservationToolInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        code: "invalid_input",
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
          .join("; "),
      };
    }
    const rangeError = validateRange(parsed.data);
    if (rangeError) return rangeError;

    try {
      switch (parsed.data.tool) {
        case "reservation.list_availability":
          return await this.listAvailability(parsed.data, context);
        case "reservation.create_hold":
          return await this.createHold(parsed.data, context);
        case "reservation.confirm_hold":
          return await this.confirmHold(parsed.data, context);
      }
    } catch (error) {
      return reservationToolError(error);
    }
  }

  private async listAvailability(
    input: Extract<ReservationToolInput, { tool: "reservation.list_availability" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const slots = await this.availabilityReader.listSlots({
      organizationId: context.organizationId,
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
    });
    return {
      ok: true,
      tool: input.tool,
      slots: slots.slice(0, input.maxSlots).map(serializeSlot),
    };
  }

  private async createHold(
    input: Extract<ReservationToolInput, { tool: "reservation.create_hold" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const hold = await this.apiService.createHold({
      organizationId: context.organizationId,
      body: {
        resourceId: input.resourceId,
        serviceId: input.serviceId,
        contactId: context.contactId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        idempotencyKey: input.idempotencyKey,
      },
      now: context.now,
    });
    return { ok: true, tool: input.tool, hold: serializeHold(hold as BookingHold) };
  }

  private async confirmHold(
    input: Extract<ReservationToolInput, { tool: "reservation.confirm_hold" }>,
    context: ReservationToolContext
  ): Promise<ReservationToolResult> {
    const reservation = await this.apiService.confirmHold({
      organizationId: context.organizationId,
      holdId: input.holdId,
      now: context.now,
    });
    return {
      ok: true,
      tool: input.tool,
      reservation: serializeReservation(reservation as Reservation),
    };
  }
}

function validateRange(input: ReservationToolInput): ReservationToolResult | null {
  if (input.tool === "reservation.list_availability" && input.rangeEnd <= input.rangeStart) {
    return {
      ok: false,
      code: "invalid_input",
      message: "rangeEnd must be greater than rangeStart",
    };
  }
  if (input.tool === "reservation.create_hold" && input.endsAt <= input.startsAt) {
    return {
      ok: false,
      code: "invalid_input",
      message: "endsAt must be greater than startsAt",
    };
  }
  return null;
}

export function createReservationToolExecutor(
  availabilityReader: ReservationToolAvailabilityReader
): ReservationToolExecutor {
  return new ReservationToolExecutor(createReservationApiService(), availabilityReader);
}

function serializeSlot(slot: AvailabilitySlot) {
  return {
    resourceId: slot.resourceId,
    serviceId: slot.serviceId,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
  };
}

function reservationToolError(error: unknown): ReservationToolResult {
  if (error instanceof BookingError) {
    if (error.code === "conflict") {
      return {
        ok: false,
        code: "booking_conflict",
        message: "Requested time is no longer available",
      };
    }
    if (error.code === "not_found") {
      return { ok: false, code: "hold_not_found", message: "Booking hold was not found" };
    }
    if (error.code === "expired") {
      return { ok: false, code: "hold_expired", message: "Booking hold has expired" };
    }
    return { ok: false, code: "booking_not_active", message: "Booking hold is not active" };
  }

  const response = reservationApiErrorResponseOrNull(error);
  if (response) return response;
  return { ok: false, code: "internal", message: "Reservation tool failed" };
}

function reservationApiErrorResponseOrNull(error: unknown): ReservationToolResult | null {
  try {
    const response = reservationApiErrorResponse(error);
    return {
      ok: false,
      code: responseStatusToCode(response.status),
      message: responseStatusToMessage(response.status),
    };
  } catch {
    return null;
  }
}

function responseStatusToCode(status: number): Exclude<
  Extract<ReservationToolResult, { ok: false }>["code"],
  "invalid_input" | "internal"
> {
  if (status === 404) return "resource_not_found";
  return "booking_conflict";
}

function responseStatusToMessage(status: number): string {
  return status === 404
    ? "Reservation tool referenced a missing CRM record"
    : "Reservation tool request cannot be completed";
}
