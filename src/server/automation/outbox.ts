import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export type AutomationOutboxStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed"
  | "dead_letter";

export type AutomationOutboxEvent = {
  id: string;
  organizationId: string;
  eventType: string;
  eventVersion: string;
  idempotencyKey: string;
  payload: unknown;
  status: AutomationOutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedAt: Date | null;
  deliveredAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface AutomationOutboxRepository {
  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<AutomationOutboxEvent | null>;
  save(event: AutomationOutboxEvent): Promise<AutomationOutboxEvent>;
  claimDue(input: {
    organizationId: string;
    limit: number;
    now: Date;
  }): Promise<AutomationOutboxEvent[]>;
  markDelivered(input: {
    organizationId: string;
    eventId: string;
    now: Date;
  }): Promise<AutomationOutboxEvent | null>;
  markFailed(input: {
    organizationId: string;
    eventId: string;
    error: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<AutomationOutboxEvent | null>;
  markDeadLetter(input: {
    organizationId: string;
    eventId: string;
    error: string;
    now: Date;
  }): Promise<AutomationOutboxEvent | null>;
}

export class AutomationOutboxService {
  constructor(private readonly repository: AutomationOutboxRepository) {}

  async enqueue(input: {
    organizationId: string;
    eventType: string;
    eventVersion: string;
    idempotencyKey: string;
    payload: unknown;
    now?: Date;
  }): Promise<AutomationOutboxEvent> {
    const existing = await this.repository.findByIdempotencyKey(
      input.organizationId,
      input.idempotencyKey
    );
    if (existing) return existing;
    const now = input.now ?? new Date();
    return this.repository.save({
      id: newId("automationOutbox"),
      organizationId: input.organizationId,
      eventType: input.eventType,
      eventVersion: input.eventVersion,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lockedAt: null,
      deliveredAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async claimDue(input: {
    organizationId: string;
    limit?: number;
    now?: Date;
  }): Promise<AutomationOutboxEvent[]> {
    return this.repository.claimDue({
      organizationId: input.organizationId,
      limit: input.limit ?? 25,
      now: input.now ?? new Date(),
    });
  }

  async markDelivered(input: {
    organizationId: string;
    eventId: string;
    now?: Date;
  }): Promise<AutomationOutboxEvent | null> {
    const now = input.now ?? new Date();
    return this.repository.markDelivered({ ...input, now });
  }

  async markFailed(input: {
    organizationId: string;
    eventId: string;
    error: string;
    nextAttemptAt: Date;
    now?: Date;
  }): Promise<AutomationOutboxEvent | null> {
    const now = input.now ?? new Date();
    return this.repository.markFailed({ ...input, now });
  }

  async markDeadLetter(input: {
    organizationId: string;
    eventId: string;
    error: string;
    now?: Date;
  }): Promise<AutomationOutboxEvent | null> {
    const now = input.now ?? new Date();
    return this.repository.markDeadLetter({ ...input, now });
  }
}

export class InMemoryAutomationOutboxRepository implements AutomationOutboxRepository {
  readonly events = new Map<string, AutomationOutboxEvent>();

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<AutomationOutboxEvent | null> {
    const event = [...this.events.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.idempotencyKey === idempotencyKey
    );
    return event ? cloneEvent(event) : null;
  }

  async save(event: AutomationOutboxEvent): Promise<AutomationOutboxEvent> {
    this.events.set(event.id, cloneEvent(event));
    return cloneEvent(event);
  }

  async claimDue(input: {
    organizationId: string;
    limit: number;
    now: Date;
  }): Promise<AutomationOutboxEvent[]> {
    const due = [...this.events.values()]
      .filter(
        (event) =>
          event.organizationId === input.organizationId &&
          (event.status === "pending" || event.status === "failed") &&
          event.nextAttemptAt <= input.now
      )
      .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
      .slice(0, input.limit);
    return due.map((event) => {
      const processing = {
        ...event,
        status: "processing" as const,
        lockedAt: input.now,
        updatedAt: input.now,
      };
      this.events.set(event.id, cloneEvent(processing));
      return cloneEvent(processing);
    });
  }

  async markDelivered(input: {
    organizationId: string;
    eventId: string;
    now: Date;
  }): Promise<AutomationOutboxEvent | null> {
    return this.update(input.organizationId, input.eventId, {
      status: "delivered",
      deliveredAt: input.now,
      lockedAt: null,
      lastError: null,
      updatedAt: input.now,
    });
  }

  async markFailed(input: {
    organizationId: string;
    eventId: string;
    error: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<AutomationOutboxEvent | null> {
    const current = this.events.get(input.eventId);
    return this.update(input.organizationId, input.eventId, {
      status: "failed",
      attempts: (current?.attempts ?? 0) + 1,
      nextAttemptAt: input.nextAttemptAt,
      lockedAt: null,
      lastError: input.error,
      updatedAt: input.now,
    });
  }

  async markDeadLetter(input: {
    organizationId: string;
    eventId: string;
    error: string;
    now: Date;
  }): Promise<AutomationOutboxEvent | null> {
    return this.update(input.organizationId, input.eventId, {
      status: "dead_letter",
      lockedAt: null,
      lastError: input.error,
      updatedAt: input.now,
    });
  }

  private update(
    organizationId: string,
    eventId: string,
    patch: Partial<AutomationOutboxEvent>
  ): AutomationOutboxEvent | null {
    const current = this.events.get(eventId);
    if (!current || current.organizationId !== organizationId) return null;
    const updated = { ...current, ...patch };
    this.events.set(eventId, cloneEvent(updated));
    return cloneEvent(updated);
  }
}

type AutomationDb = ReturnType<typeof getDb>;

export class DrizzleAutomationOutboxRepository implements AutomationOutboxRepository {
  constructor(private readonly db: AutomationDb = getDb()) {}

  async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<AutomationOutboxEvent | null> {
    const rows = await this.db
      .select()
      .from(schema.automationOutbox)
      .where(
        and(
          eq(schema.automationOutbox.organizationId, organizationId),
          eq(schema.automationOutbox.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return rows[0] ? rowToEvent(rows[0]) : null;
  }

  async save(event: AutomationOutboxEvent): Promise<AutomationOutboxEvent> {
    const inserted = await this.db
      .insert(schema.automationOutbox)
      .values(eventToRow(event))
      .onConflictDoNothing({
        target: [schema.automationOutbox.organizationId, schema.automationOutbox.idempotencyKey],
      })
      .returning();
    if (inserted[0]) return rowToEvent(inserted[0]);
    const existing = await this.findByIdempotencyKey(event.organizationId, event.idempotencyKey);
    if (!existing) throw new Error("automation outbox idempotency conflict without existing row");
    return existing;
  }

  async claimDue(input: {
    organizationId: string;
    limit: number;
    now: Date;
  }): Promise<AutomationOutboxEvent[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: schema.automationOutbox.id })
        .from(schema.automationOutbox)
        .where(
          and(
            eq(schema.automationOutbox.organizationId, input.organizationId),
            or(
              eq(schema.automationOutbox.status, "pending"),
              eq(schema.automationOutbox.status, "failed")
            ),
            lte(schema.automationOutbox.nextAttemptAt, input.now)
          )
        )
        .orderBy(asc(schema.automationOutbox.nextAttemptAt))
        .limit(input.limit);
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return [];
      const claimed = await tx
        .update(schema.automationOutbox)
        .set({ status: "processing", lockedAt: input.now, updatedAt: input.now })
        .where(inArray(schema.automationOutbox.id, ids))
        .returning();
      return claimed.map(rowToEvent);
    });
  }

  async markDelivered(input: {
    organizationId: string;
    eventId: string;
    now: Date;
  }): Promise<AutomationOutboxEvent | null> {
    const rows = await this.db
      .update(schema.automationOutbox)
      .set({
        status: "delivered",
        deliveredAt: input.now,
        lockedAt: null,
        lastError: null,
        updatedAt: input.now,
      })
      .where(scopedEvent(input.organizationId, input.eventId))
      .returning();
    return rows[0] ? rowToEvent(rows[0]) : null;
  }

  async markFailed(input: {
    organizationId: string;
    eventId: string;
    error: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<AutomationOutboxEvent | null> {
    const current = await this.findById(input.organizationId, input.eventId);
    if (!current) return null;
    const rows = await this.db
      .update(schema.automationOutbox)
      .set({
        status: "failed",
        attempts: current.attempts + 1,
        nextAttemptAt: input.nextAttemptAt,
        lockedAt: null,
        lastError: input.error,
        updatedAt: input.now,
      })
      .where(scopedEvent(input.organizationId, input.eventId))
      .returning();
    return rows[0] ? rowToEvent(rows[0]) : null;
  }

  async markDeadLetter(input: {
    organizationId: string;
    eventId: string;
    error: string;
    now: Date;
  }): Promise<AutomationOutboxEvent | null> {
    const rows = await this.db
      .update(schema.automationOutbox)
      .set({
        status: "dead_letter",
        lockedAt: null,
        lastError: input.error,
        updatedAt: input.now,
      })
      .where(scopedEvent(input.organizationId, input.eventId))
      .returning();
    return rows[0] ? rowToEvent(rows[0]) : null;
  }

  private async findById(
    organizationId: string,
    eventId: string
  ): Promise<AutomationOutboxEvent | null> {
    const rows = await this.db
      .select()
      .from(schema.automationOutbox)
      .where(scopedEvent(organizationId, eventId))
      .limit(1);
    return rows[0] ? rowToEvent(rows[0]) : null;
  }
}

function scopedEvent(organizationId: string, eventId: string) {
  return and(
    eq(schema.automationOutbox.organizationId, organizationId),
    eq(schema.automationOutbox.id, eventId)
  );
}

function eventToRow(event: AutomationOutboxEvent): typeof schema.automationOutbox.$inferInsert {
  return { ...event };
}

function rowToEvent(row: typeof schema.automationOutbox.$inferSelect): AutomationOutboxEvent {
  return cloneEvent(row);
}

function cloneEvent(event: AutomationOutboxEvent): AutomationOutboxEvent {
  return {
    ...event,
    nextAttemptAt: new Date(event.nextAttemptAt),
    lockedAt: event.lockedAt ? new Date(event.lockedAt) : null,
    deliveredAt: event.deliveredAt ? new Date(event.deliveredAt) : null,
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
  };
}
