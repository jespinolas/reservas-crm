import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export type ReservationReminderKind = "pre_arrival" | "follow_up";

export type ReservationReminderStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "skipped"
  | "cancelled";

export type ReservationReminder = {
  id: string;
  organizationId: string;
  reservationId: string;
  kind: ReservationReminderKind;
  dueAt: Date;
  status: ReservationReminderStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  sentAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface ReservationReminderRepository {
  findByReservationKind(input: {
    organizationId: string;
    reservationId: string;
    kind: ReservationReminderKind;
  }): Promise<ReservationReminder | null>;
  save(reminder: ReservationReminder): Promise<ReservationReminder>;
  claimDue(input: {
    organizationId: string;
    limit: number;
    now: Date;
  }): Promise<ReservationReminder[]>;
  markSent(input: {
    organizationId: string;
    reminderId: string;
    now: Date;
  }): Promise<ReservationReminder | null>;
  markFailed(input: {
    organizationId: string;
    reminderId: string;
    error: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<ReservationReminder | null>;
  markSkipped(input: {
    organizationId: string;
    reminderId: string;
    reason: string;
    now: Date;
  }): Promise<ReservationReminder | null>;
  markCancelled(input: {
    organizationId: string;
    reminderId: string;
    now: Date;
  }): Promise<ReservationReminder | null>;
}

export class ReservationReminderService {
  constructor(private readonly repository: ReservationReminderRepository) {}

  async scheduleReminder(input: {
    organizationId: string;
    reservationId: string;
    kind: ReservationReminderKind;
    reservationStartsAt: Date;
    leadMinutes: number;
    now?: Date;
  }): Promise<ReservationReminder> {
    const existing = await this.repository.findByReservationKind({
      organizationId: input.organizationId,
      reservationId: input.reservationId,
      kind: input.kind,
    });
    if (existing) return existing;
    const now = input.now ?? new Date();
    const dueAt = new Date(input.reservationStartsAt.getTime() - input.leadMinutes * 60_000);
    return this.repository.save({
      id: newId("reservationReminder"),
      organizationId: input.organizationId,
      reservationId: input.reservationId,
      kind: input.kind,
      dueAt,
      status: "pending",
      attempts: 0,
      nextAttemptAt: dueAt,
      lockedAt: null,
      sentAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async claimDue(input: {
    organizationId: string;
    limit?: number;
    now?: Date;
  }): Promise<ReservationReminder[]> {
    return this.repository.claimDue({
      organizationId: input.organizationId,
      limit: input.limit ?? 25,
      now: input.now ?? new Date(),
    });
  }

  async markSent(input: {
    organizationId: string;
    reminderId: string;
    now?: Date;
  }): Promise<ReservationReminder | null> {
    const now = input.now ?? new Date();
    return this.repository.markSent({ ...input, now });
  }

  async markFailed(input: {
    organizationId: string;
    reminderId: string;
    error: string;
    nextAttemptAt: Date;
    now?: Date;
  }): Promise<ReservationReminder | null> {
    const now = input.now ?? new Date();
    return this.repository.markFailed({ ...input, now });
  }

  async markSkipped(input: {
    organizationId: string;
    reminderId: string;
    reason: string;
    now?: Date;
  }): Promise<ReservationReminder | null> {
    const now = input.now ?? new Date();
    return this.repository.markSkipped({ ...input, now });
  }

  async markCancelled(input: {
    organizationId: string;
    reminderId: string;
    now?: Date;
  }): Promise<ReservationReminder | null> {
    const now = input.now ?? new Date();
    return this.repository.markCancelled({ ...input, now });
  }
}

export class InMemoryReservationReminderRepository implements ReservationReminderRepository {
  readonly reminders = new Map<string, ReservationReminder>();

  async findByReservationKind(input: {
    organizationId: string;
    reservationId: string;
    kind: ReservationReminderKind;
  }): Promise<ReservationReminder | null> {
    const reminder = [...this.reminders.values()].find(
      (candidate) =>
        candidate.organizationId === input.organizationId &&
        candidate.reservationId === input.reservationId &&
        candidate.kind === input.kind
    );
    return reminder ? cloneReminder(reminder) : null;
  }

  async save(reminder: ReservationReminder): Promise<ReservationReminder> {
    this.reminders.set(reminder.id, cloneReminder(reminder));
    return cloneReminder(reminder);
  }

  async claimDue(input: {
    organizationId: string;
    limit: number;
    now: Date;
  }): Promise<ReservationReminder[]> {
    const due = [...this.reminders.values()]
      .filter(
        (reminder) =>
          reminder.organizationId === input.organizationId &&
          (reminder.status === "pending" || reminder.status === "failed") &&
          reminder.nextAttemptAt <= input.now
      )
      .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
      .slice(0, input.limit);
    return due.map((reminder) => {
      const processing = {
        ...reminder,
        status: "processing" as const,
        lockedAt: input.now,
        updatedAt: input.now,
      };
      this.reminders.set(reminder.id, cloneReminder(processing));
      return cloneReminder(processing);
    });
  }

  async markSent(input: {
    organizationId: string;
    reminderId: string;
    now: Date;
  }): Promise<ReservationReminder | null> {
    return this.update(input.organizationId, input.reminderId, {
      status: "sent",
      sentAt: input.now,
      lockedAt: null,
      lastError: null,
      updatedAt: input.now,
    });
  }

  async markFailed(input: {
    organizationId: string;
    reminderId: string;
    error: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<ReservationReminder | null> {
    const current = this.reminders.get(input.reminderId);
    return this.update(input.organizationId, input.reminderId, {
      status: "failed",
      attempts: (current?.attempts ?? 0) + 1,
      nextAttemptAt: input.nextAttemptAt,
      lockedAt: null,
      lastError: input.error,
      updatedAt: input.now,
    });
  }

  async markSkipped(input: {
    organizationId: string;
    reminderId: string;
    reason: string;
    now: Date;
  }): Promise<ReservationReminder | null> {
    return this.update(input.organizationId, input.reminderId, {
      status: "skipped",
      lockedAt: null,
      lastError: input.reason,
      updatedAt: input.now,
    });
  }

  async markCancelled(input: {
    organizationId: string;
    reminderId: string;
    now: Date;
  }): Promise<ReservationReminder | null> {
    return this.update(input.organizationId, input.reminderId, {
      status: "cancelled",
      lockedAt: null,
      updatedAt: input.now,
    });
  }

  private update(
    organizationId: string,
    reminderId: string,
    patch: Partial<ReservationReminder>
  ): ReservationReminder | null {
    const current = this.reminders.get(reminderId);
    if (!current || current.organizationId !== organizationId) return null;
    const updated = { ...current, ...patch };
    this.reminders.set(reminderId, cloneReminder(updated));
    return cloneReminder(updated);
  }
}

type ReminderDb = ReturnType<typeof getDb>;

export class DrizzleReservationReminderRepository implements ReservationReminderRepository {
  constructor(private readonly db: ReminderDb = getDb()) {}

  async findByReservationKind(input: {
    organizationId: string;
    reservationId: string;
    kind: ReservationReminderKind;
  }): Promise<ReservationReminder | null> {
    const rows = await this.db
      .select()
      .from(schema.reservationReminder)
      .where(
        and(
          eq(schema.reservationReminder.organizationId, input.organizationId),
          eq(schema.reservationReminder.reservationId, input.reservationId),
          eq(schema.reservationReminder.kind, input.kind)
        )
      )
      .limit(1);
    return rows[0] ? rowToReminder(rows[0]) : null;
  }

  async save(reminder: ReservationReminder): Promise<ReservationReminder> {
    const inserted = await this.db
      .insert(schema.reservationReminder)
      .values(reminderToRow(reminder))
      .onConflictDoNothing({
        target: [
          schema.reservationReminder.organizationId,
          schema.reservationReminder.reservationId,
          schema.reservationReminder.kind,
        ],
      })
      .returning();
    if (inserted[0]) return rowToReminder(inserted[0]);
    const existing = await this.findByReservationKind(reminder);
    if (!existing) throw new Error("reservation reminder idempotency conflict without row");
    return existing;
  }

  async claimDue(input: {
    organizationId: string;
    limit: number;
    now: Date;
  }): Promise<ReservationReminder[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: schema.reservationReminder.id })
        .from(schema.reservationReminder)
        .where(
          and(
            eq(schema.reservationReminder.organizationId, input.organizationId),
            or(
              eq(schema.reservationReminder.status, "pending"),
              eq(schema.reservationReminder.status, "failed")
            ),
            lte(schema.reservationReminder.nextAttemptAt, input.now)
          )
        )
        .orderBy(asc(schema.reservationReminder.nextAttemptAt))
        .limit(input.limit);
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return [];
      const claimed = await tx
        .update(schema.reservationReminder)
        .set({ status: "processing", lockedAt: input.now, updatedAt: input.now })
        .where(inArray(schema.reservationReminder.id, ids))
        .returning();
      return claimed.map(rowToReminder);
    });
  }

  async markSent(input: {
    organizationId: string;
    reminderId: string;
    now: Date;
  }): Promise<ReservationReminder | null> {
    const rows = await this.db
      .update(schema.reservationReminder)
      .set({
        status: "sent",
        sentAt: input.now,
        lockedAt: null,
        lastError: null,
        updatedAt: input.now,
      })
      .where(scopedReminder(input.organizationId, input.reminderId))
      .returning();
    return rows[0] ? rowToReminder(rows[0]) : null;
  }

  async markFailed(input: {
    organizationId: string;
    reminderId: string;
    error: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<ReservationReminder | null> {
    const current = await this.findById(input.organizationId, input.reminderId);
    if (!current) return null;
    const rows = await this.db
      .update(schema.reservationReminder)
      .set({
        status: "failed",
        attempts: current.attempts + 1,
        nextAttemptAt: input.nextAttemptAt,
        lockedAt: null,
        lastError: input.error,
        updatedAt: input.now,
      })
      .where(scopedReminder(input.organizationId, input.reminderId))
      .returning();
    return rows[0] ? rowToReminder(rows[0]) : null;
  }

  async markSkipped(input: {
    organizationId: string;
    reminderId: string;
    reason: string;
    now: Date;
  }): Promise<ReservationReminder | null> {
    const rows = await this.db
      .update(schema.reservationReminder)
      .set({
        status: "skipped",
        lockedAt: null,
        lastError: input.reason,
        updatedAt: input.now,
      })
      .where(scopedReminder(input.organizationId, input.reminderId))
      .returning();
    return rows[0] ? rowToReminder(rows[0]) : null;
  }

  async markCancelled(input: {
    organizationId: string;
    reminderId: string;
    now: Date;
  }): Promise<ReservationReminder | null> {
    const rows = await this.db
      .update(schema.reservationReminder)
      .set({
        status: "cancelled",
        lockedAt: null,
        updatedAt: input.now,
      })
      .where(scopedReminder(input.organizationId, input.reminderId))
      .returning();
    return rows[0] ? rowToReminder(rows[0]) : null;
  }

  private async findById(
    organizationId: string,
    reminderId: string
  ): Promise<ReservationReminder | null> {
    const rows = await this.db
      .select()
      .from(schema.reservationReminder)
      .where(scopedReminder(organizationId, reminderId))
      .limit(1);
    return rows[0] ? rowToReminder(rows[0]) : null;
  }
}

function scopedReminder(organizationId: string, reminderId: string) {
  return and(
    eq(schema.reservationReminder.organizationId, organizationId),
    eq(schema.reservationReminder.id, reminderId)
  );
}

function reminderToRow(
  reminder: ReservationReminder
): typeof schema.reservationReminder.$inferInsert {
  return { ...reminder };
}

function rowToReminder(
  row: typeof schema.reservationReminder.$inferSelect
): ReservationReminder {
  return cloneReminder(row);
}

function cloneReminder(reminder: ReservationReminder): ReservationReminder {
  return {
    ...reminder,
    dueAt: new Date(reminder.dueAt),
    nextAttemptAt: new Date(reminder.nextAttemptAt),
    lockedAt: reminder.lockedAt ? new Date(reminder.lockedAt) : null,
    sentAt: reminder.sentAt ? new Date(reminder.sentAt) : null,
    createdAt: new Date(reminder.createdAt),
    updatedAt: new Date(reminder.updatedAt),
  };
}
