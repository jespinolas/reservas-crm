import { z } from "zod";
import { newId } from "@/lib/db/ids";
import type {
  BusinessConfiguration,
  ReservableResource,
  ReservationServiceDefinition,
} from "@/server/reservations/catalog";

export type ResourceSchedule = {
  id: string;
  organizationId: string;
  resourceId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduleException = {
  id: string;
  organizationId: string;
  resourceId: string;
  localDate: string;
  startMinute: number;
  endMinute: number;
  kind: "available" | "unavailable";
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BlackoutPeriod = {
  id: string;
  organizationId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilitySlot = {
  resourceId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
};

export interface AvailabilityRepository {
  saveResourceSchedule(schedule: ResourceSchedule): Promise<void>;
  listResourceSchedules(organizationId: string, resourceId: string): Promise<ResourceSchedule[]>;
  saveScheduleException(exception: ScheduleException): Promise<void>;
  listScheduleExceptions(input: {
    organizationId: string;
    resourceId: string;
    localDateFrom: string;
    localDateTo: string;
  }): Promise<ScheduleException[]>;
  saveBlackoutPeriod(period: BlackoutPeriod): Promise<void>;
  listBlackoutPeriods(input: {
    organizationId: string;
    resourceId: string;
    startsBefore: Date;
    endsAfter: Date;
  }): Promise<BlackoutPeriod[]>;
}

const minuteSchema = z.number().int().min(0).max(1440);
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export class AvailabilityService {
  constructor(private readonly repository: AvailabilityRepository) {}

  async createResourceSchedule(input: {
    organizationId: string;
    resourceId: string;
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    now?: Date;
  }): Promise<ResourceSchedule> {
    const parsed = scheduleInputSchema.parse(input);
    const now = input.now ?? new Date();
    const schedule: ResourceSchedule = {
      id: newId("resourceSchedule"),
      organizationId: parsed.organizationId,
      resourceId: parsed.resourceId,
      dayOfWeek: parsed.dayOfWeek,
      startMinute: parsed.startMinute,
      endMinute: parsed.endMinute,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveResourceSchedule(schedule);
    return cloneSchedule(schedule);
  }

  async createScheduleException(input: {
    organizationId: string;
    resourceId: string;
    localDate: string;
    startMinute: number;
    endMinute: number;
    kind: "available" | "unavailable";
    reason?: string | null;
    now?: Date;
  }): Promise<ScheduleException> {
    const parsed = exceptionInputSchema.parse(input);
    const now = input.now ?? new Date();
    const exception: ScheduleException = {
      id: newId("scheduleException"),
      organizationId: parsed.organizationId,
      resourceId: parsed.resourceId,
      localDate: parsed.localDate,
      startMinute: parsed.startMinute,
      endMinute: parsed.endMinute,
      kind: parsed.kind,
      reason: parsed.reason ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveScheduleException(exception);
    return cloneException(exception);
  }

  async createBlackoutPeriod(input: {
    organizationId: string;
    resourceId: string;
    startsAt: Date;
    endsAt: Date;
    reason?: string | null;
    now?: Date;
  }): Promise<BlackoutPeriod> {
    const parsed = blackoutInputSchema.parse(input);
    const now = input.now ?? new Date();
    const period: BlackoutPeriod = {
      id: newId("blackoutPeriod"),
      organizationId: parsed.organizationId,
      resourceId: parsed.resourceId,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      reason: parsed.reason ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveBlackoutPeriod(period);
    return cloneBlackout(period);
  }

  async listAvailableSlots(input: {
    configuration: BusinessConfiguration;
    resource: ReservableResource;
    service: ReservationServiceDefinition;
    rangeStart: Date;
    rangeEnd: Date;
  }): Promise<AvailabilitySlot[]> {
    if (!input.resource.active || !input.service.active) return [];
    if (input.rangeEnd <= input.rangeStart) return [];

    const localDates = enumerateLocalDates({
      timezone: input.configuration.timezone,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
    });
    if (localDates.length === 0) return [];

    const schedules = await this.repository.listResourceSchedules(
      input.resource.organizationId,
      input.resource.id
    );
    const exceptions = await this.repository.listScheduleExceptions({
      organizationId: input.resource.organizationId,
      resourceId: input.resource.id,
      localDateFrom: localDates[0]!,
      localDateTo: localDates.at(-1)!,
    });
    const blackouts = await this.repository.listBlackoutPeriods({
      organizationId: input.resource.organizationId,
      resourceId: input.resource.id,
      startsBefore: input.rangeEnd,
      endsAfter: input.rangeStart,
    });

    const durationMinutes = input.service.durationMinutes;
    const slotMinutes = input.configuration.defaultSlotMinutes;
    const slots: AvailabilitySlot[] = [];
    for (const localDate of localDates) {
      const dayOfWeek = localDayOfWeek(localDate, input.configuration.timezone);
      const windows = schedules
        .filter((schedule) => schedule.active && schedule.dayOfWeek === dayOfWeek)
        .map((schedule) => ({
          startMinute: schedule.startMinute,
          endMinute: schedule.endMinute,
        }));
      for (const exception of exceptions.filter((candidate) => candidate.localDate === localDate)) {
        if (exception.kind === "available") {
          windows.push({
            startMinute: exception.startMinute,
            endMinute: exception.endMinute,
          });
        }
      }
      const unavailableWindows = exceptions
        .filter((candidate) => candidate.localDate === localDate && candidate.kind === "unavailable")
        .map((exception) => ({
          startMinute: exception.startMinute,
          endMinute: exception.endMinute,
        }));

      for (const window of windows) {
        for (
          let minute = window.startMinute;
          minute + durationMinutes <= window.endMinute;
          minute += slotMinutes
        ) {
          const startsAt = localMinuteToUtc(localDate, minute, input.configuration.timezone);
          const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
          if (startsAt < input.rangeStart || endsAt > input.rangeEnd) continue;
          if (unavailableWindows.some((blocked) => overlapsMinutes(minute, minute + durationMinutes, blocked))) {
            continue;
          }
          if (blackouts.some((blackout) => overlapsDates(startsAt, endsAt, blackout))) continue;
          slots.push({
            resourceId: input.resource.id,
            serviceId: input.service.id,
            startsAt,
            endsAt,
          });
        }
      }
    }

    return dedupeSlots(slots).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
}

export class InMemoryAvailabilityRepository implements AvailabilityRepository {
  private readonly schedules = new Map<string, ResourceSchedule>();
  private readonly exceptions = new Map<string, ScheduleException>();
  private readonly blackouts = new Map<string, BlackoutPeriod>();

  async saveResourceSchedule(schedule: ResourceSchedule): Promise<void> {
    this.schedules.set(schedule.id, cloneSchedule(schedule));
  }

  async listResourceSchedules(
    organizationId: string,
    resourceId: string
  ): Promise<ResourceSchedule[]> {
    return [...this.schedules.values()]
      .filter((schedule) => schedule.organizationId === organizationId && schedule.resourceId === resourceId)
      .map(cloneSchedule);
  }

  async saveScheduleException(exception: ScheduleException): Promise<void> {
    this.exceptions.set(exception.id, cloneException(exception));
  }

  async listScheduleExceptions(input: {
    organizationId: string;
    resourceId: string;
    localDateFrom: string;
    localDateTo: string;
  }): Promise<ScheduleException[]> {
    return [...this.exceptions.values()]
      .filter(
        (exception) =>
          exception.organizationId === input.organizationId &&
          exception.resourceId === input.resourceId &&
          exception.localDate >= input.localDateFrom &&
          exception.localDate <= input.localDateTo
      )
      .map(cloneException);
  }

  async saveBlackoutPeriod(period: BlackoutPeriod): Promise<void> {
    this.blackouts.set(period.id, cloneBlackout(period));
  }

  async listBlackoutPeriods(input: {
    organizationId: string;
    resourceId: string;
    startsBefore: Date;
    endsAfter: Date;
  }): Promise<BlackoutPeriod[]> {
    return [...this.blackouts.values()]
      .filter(
        (period) =>
          period.organizationId === input.organizationId &&
          period.resourceId === input.resourceId &&
          period.startsAt < input.startsBefore &&
          period.endsAt > input.endsAfter
      )
      .map(cloneBlackout);
  }
}

const scheduleBaseInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: minuteSchema,
  endMinute: minuteSchema,
});

const scheduleInputSchema = scheduleBaseInputSchema.refine((input) => input.endMinute > input.startMinute, {
    message: "endMinute must be greater than startMinute",
  });

const exceptionInputSchema = scheduleBaseInputSchema
  .omit({ dayOfWeek: true })
  .extend({
    localDate: localDateSchema,
    kind: z.enum(["available", "unavailable"]),
    reason: z.string().max(500).nullable().optional(),
  })
  .refine((input) => input.endMinute > input.startMinute, {
    message: "endMinute must be greater than startMinute",
  });

const blackoutInputSchema = z
  .object({
    organizationId: z.string().min(1),
    resourceId: z.string().min(1),
    startsAt: z.date(),
    endsAt: z.date(),
    reason: z.string().max(500).nullable().optional(),
  })
  .refine((input) => input.endsAt > input.startsAt, {
    message: "endsAt must be greater than startsAt",
  });

function dedupeSlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  return [
    ...new Map(
      slots.map((slot) => [
        `${slot.resourceId}:${slot.serviceId}:${slot.startsAt.toISOString()}`,
        slot,
      ])
    ).values(),
  ];
}

function overlapsMinutes(
  startMinute: number,
  endMinute: number,
  window: { startMinute: number; endMinute: number }
): boolean {
  return startMinute < window.endMinute && endMinute > window.startMinute;
}

function overlapsDates(
  startsAt: Date,
  endsAt: Date,
  blackout: { startsAt: Date; endsAt: Date }
): boolean {
  return startsAt < blackout.endsAt && endsAt > blackout.startsAt;
}

function enumerateLocalDates(input: {
  timezone: string;
  rangeStart: Date;
  rangeEnd: Date;
}): string[] {
  const start = localDateString(input.rangeStart, input.timezone);
  const end = localDateString(new Date(input.rangeEnd.getTime() - 1), input.timezone);
  const dates: string[] = [];
  let cursor = parseLocalDate(start);
  const last = parseLocalDate(end);
  while (cursor <= last) {
    dates.push(formatDate(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function localDayOfWeek(localDate: string, timezone: string): number {
  const noon = localMinuteToUtc(localDate, 12 * 60, timezone);
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    })
      .formatToParts(noon)
      .find((part) => part.type === "weekday")!
      .value.replace("Sun", "0")
      .replace("Mon", "1")
      .replace("Tue", "2")
      .replace("Wed", "3")
      .replace("Thu", "4")
      .replace("Fri", "5")
      .replace("Sat", "6")
  );
}

function localMinuteToUtc(localDate: string, minute: number, timezone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  const localAsUtc = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60);
  let utc = localAsUtc - timezoneOffsetMs(new Date(localAsUtc), timezone);
  utc = localAsUtc - timezoneOffsetMs(new Date(utc), timezone);
  return new Date(utc);
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function localDateString(date: Date, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseLocalDate(localDate: string): Date {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cloneSchedule(schedule: ResourceSchedule): ResourceSchedule {
  return {
    ...schedule,
    createdAt: new Date(schedule.createdAt),
    updatedAt: new Date(schedule.updatedAt),
  };
}

function cloneException(exception: ScheduleException): ScheduleException {
  return {
    ...exception,
    createdAt: new Date(exception.createdAt),
    updatedAt: new Date(exception.updatedAt),
  };
}

function cloneBlackout(period: BlackoutPeriod): BlackoutPeriod {
  return {
    ...period,
    startsAt: new Date(period.startsAt),
    endsAt: new Date(period.endsAt),
    createdAt: new Date(period.createdAt),
    updatedAt: new Date(period.updatedAt),
  };
}
