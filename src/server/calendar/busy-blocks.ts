import { createHash } from "node:crypto";
import { and, eq, gt, inArray, lt, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { AvailabilityBlockingRange } from "@/server/reservations/availability-options";

export type ResourceCalendarProvider = "google";
export type ResourceCalendarMappingStatus = "connected" | "sync_failed" | "disabled";
export type ResourceBusyBlockStatus = "active" | "cancelled";

export type ResourceCalendarMapping = {
  id: string;
  organizationId: string;
  resourceId: string;
  provider: ResourceCalendarProvider;
  calendarIdRedacted: string;
  status: ResourceCalendarMappingStatus;
  lastSyncedAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResourceBusyBlock = {
  id: string;
  organizationId: string;
  resourceId: string;
  source: "google_calendar";
  providerEventIdHash: string;
  startsAt: Date;
  endsAt: Date;
  status: ResourceBusyBlockStatus;
  summaryRedacted: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProviderBusyWindow = {
  providerEventId: string;
  startsAt: Date;
  endsAt: Date;
  status?: "confirmed" | "cancelled";
  summary?: string | null;
};

export interface CalendarBusyWindowProvider {
  listBusyWindows(input: {
    organizationId: string;
    resourceId: string;
    calendarId: string;
    rangeStart: Date;
    rangeEnd: Date;
  }): Promise<ProviderBusyWindow[]>;
}

export interface ResourceCalendarBusyBlockRepository {
  saveMapping(mapping: ResourceCalendarMapping): Promise<ResourceCalendarMapping>;
  findMapping(input: {
    organizationId: string;
    resourceId: string;
    provider: ResourceCalendarProvider;
  }): Promise<ResourceCalendarMapping | null>;
  upsertBusyBlock(block: ResourceBusyBlock): Promise<ResourceBusyBlock>;
  deactivateMissingBusyBlocks(input: {
    organizationId: string;
    resourceId: string;
    providerEventIdHashes: string[];
    now: Date;
  }): Promise<number>;
  listBusyBlocks(input: {
    organizationId: string;
    resourceId?: string;
    rangeStart: Date;
    rangeEnd: Date;
    statuses?: ResourceBusyBlockStatus[];
  }): Promise<ResourceBusyBlock[]>;
}

export class ResourceCalendarMappingService {
  constructor(private readonly repository: ResourceCalendarBusyBlockRepository) {}

  async configureGoogleMapping(input: {
    organizationId: string;
    resourceId: string;
    calendarId: string;
    status?: Extract<ResourceCalendarMappingStatus, "connected" | "disabled">;
    now?: Date;
  }): Promise<ResourceCalendarMapping> {
    const now = input.now ?? new Date();
    const existing = await this.repository.findMapping({
      organizationId: input.organizationId,
      resourceId: input.resourceId,
      provider: "google",
    });
    const mapping =
      existing ??
      createMapping({
        organizationId: input.organizationId,
        resourceId: input.resourceId,
        provider: "google",
        calendarId: input.calendarId,
        now,
      });
    return this.repository.saveMapping({
      ...mapping,
      calendarIdRedacted: redactCalendarId(input.calendarId),
      status: input.status ?? "connected",
      lastErrorCode: input.status === "disabled" ? null : mapping.lastErrorCode,
      updatedAt: now,
    });
  }

  async getGoogleMapping(input: {
    organizationId: string;
    resourceId: string;
  }): Promise<ResourceCalendarMapping | null> {
    return this.repository.findMapping({
      organizationId: input.organizationId,
      resourceId: input.resourceId,
      provider: "google",
    });
  }

  async disableGoogleMapping(input: {
    organizationId: string;
    resourceId: string;
    now?: Date;
  }): Promise<ResourceCalendarMapping | null> {
    const existing = await this.getGoogleMapping(input);
    if (!existing) return null;
    return this.repository.saveMapping({
      ...existing,
      status: "disabled",
      lastErrorCode: null,
      updatedAt: input.now ?? new Date(),
    });
  }

  async listBusyBlocks(input: {
    organizationId: string;
    resourceId: string;
    rangeStart: Date;
    rangeEnd: Date;
    statuses?: ResourceBusyBlockStatus[];
  }): Promise<ResourceBusyBlock[]> {
    return this.repository.listBusyBlocks(input);
  }
}

export type ResourceCalendarSyncResult =
  | {
      ok: true;
      mapping: ResourceCalendarMapping;
      importedCount: number;
      deactivatedCount: number;
      busyBlocks: ResourceBusyBlock[];
    }
  | {
      ok: false;
      mapping: ResourceCalendarMapping;
      errorCode: string;
    };

export class ResourceCalendarBusyBlockSyncService {
  constructor(
    private readonly repository: ResourceCalendarBusyBlockRepository,
    private readonly provider: CalendarBusyWindowProvider
  ) {}

  async syncGoogleBusyBlocks(input: {
    organizationId: string;
    resourceId: string;
    calendarId: string;
    rangeStart: Date;
    rangeEnd: Date;
    now?: Date;
  }): Promise<ResourceCalendarSyncResult> {
    const now = input.now ?? new Date();
    const existingMapping = await this.repository.findMapping({
      organizationId: input.organizationId,
      resourceId: input.resourceId,
      provider: "google",
    });
    const baseMapping: ResourceCalendarMapping =
      existingMapping ??
      createMapping({
        organizationId: input.organizationId,
        resourceId: input.resourceId,
        provider: "google",
        calendarId: input.calendarId,
        now,
      });

    try {
      const windows = await this.provider.listBusyWindows({
        organizationId: input.organizationId,
        resourceId: input.resourceId,
        calendarId: input.calendarId,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
      });
      const activeHashes: string[] = [];
      const busyBlocks: ResourceBusyBlock[] = [];
      for (const window of windows) {
        if (window.status === "cancelled") continue;
        const providerEventIdHash = hashProviderEventId({
          provider: "google",
          calendarId: input.calendarId,
          providerEventId: window.providerEventId,
        });
        activeHashes.push(providerEventIdHash);
        const block = await this.repository.upsertBusyBlock({
          id: `rbb_${providerEventIdHash.slice(0, 20)}`,
          organizationId: input.organizationId,
          resourceId: input.resourceId,
          source: "google_calendar",
          providerEventIdHash,
          startsAt: new Date(window.startsAt),
          endsAt: new Date(window.endsAt),
          status: "active",
          summaryRedacted: redactCalendarSummary(window.summary ?? null),
          createdAt: now,
          updatedAt: now,
        });
        busyBlocks.push(block);
      }
      const deactivatedCount = await this.repository.deactivateMissingBusyBlocks({
        organizationId: input.organizationId,
        resourceId: input.resourceId,
        providerEventIdHashes: activeHashes,
        now,
      });
      const mapping = await this.repository.saveMapping({
        ...baseMapping,
        calendarIdRedacted: redactCalendarId(input.calendarId),
        status: "connected",
        lastSyncedAt: now,
        lastErrorCode: null,
        updatedAt: now,
      });
      return {
        ok: true,
        mapping,
        importedCount: busyBlocks.length,
        deactivatedCount,
        busyBlocks,
      };
    } catch (error) {
      const errorCode = normalizeCalendarSyncError(error);
      const mapping = await this.repository.saveMapping({
        ...baseMapping,
        calendarIdRedacted: redactCalendarId(input.calendarId),
        status: "sync_failed",
        lastErrorCode: errorCode,
        updatedAt: now,
      });
      return { ok: false, mapping, errorCode };
    }
  }
}

export class InMemoryResourceCalendarBusyBlockRepository
  implements ResourceCalendarBusyBlockRepository
{
  readonly mappings = new Map<string, ResourceCalendarMapping>();
  readonly busyBlocks = new Map<string, ResourceBusyBlock>();

  async saveMapping(mapping: ResourceCalendarMapping): Promise<ResourceCalendarMapping> {
    this.mappings.set(mappingKey(mapping), cloneMapping(mapping));
    return cloneMapping(mapping);
  }

  async findMapping(input: {
    organizationId: string;
    resourceId: string;
    provider: ResourceCalendarProvider;
  }): Promise<ResourceCalendarMapping | null> {
    const mapping = this.mappings.get(
      `${input.organizationId}:${input.resourceId}:${input.provider}`
    );
    return mapping ? cloneMapping(mapping) : null;
  }

  async upsertBusyBlock(block: ResourceBusyBlock): Promise<ResourceBusyBlock> {
    const key = busyBlockKey(block);
    const existing = this.busyBlocks.get(key);
    const next = existing
      ? { ...block, id: existing.id, createdAt: existing.createdAt }
      : block;
    this.busyBlocks.set(key, cloneBusyBlock(next));
    return cloneBusyBlock(next);
  }

  async deactivateMissingBusyBlocks(input: {
    organizationId: string;
    resourceId: string;
    providerEventIdHashes: string[];
    now: Date;
  }): Promise<number> {
    const activeHashes = new Set(input.providerEventIdHashes);
    let deactivated = 0;
    for (const [key, block] of this.busyBlocks.entries()) {
      if (
        block.organizationId !== input.organizationId ||
        block.resourceId !== input.resourceId ||
        block.status !== "active" ||
        activeHashes.has(block.providerEventIdHash)
      ) {
        continue;
      }
      this.busyBlocks.set(
        key,
        cloneBusyBlock({ ...block, status: "cancelled", updatedAt: input.now })
      );
      deactivated += 1;
    }
    return deactivated;
  }

  async listBusyBlocks(input: {
    organizationId: string;
    resourceId?: string;
    rangeStart: Date;
    rangeEnd: Date;
    statuses?: ResourceBusyBlockStatus[];
  }): Promise<ResourceBusyBlock[]> {
    return [...this.busyBlocks.values()]
      .filter(
        (block) =>
          block.organizationId === input.organizationId &&
          (!input.resourceId || block.resourceId === input.resourceId) &&
          (!input.statuses?.length || input.statuses.includes(block.status)) &&
          block.startsAt < input.rangeEnd &&
          block.endsAt > input.rangeStart
      )
      .map(cloneBusyBlock);
  }
}

export class DrizzleResourceCalendarBusyBlockRepository
  implements ResourceCalendarBusyBlockRepository
{
  constructor(private readonly db = getDb()) {}

  async saveMapping(mapping: ResourceCalendarMapping): Promise<ResourceCalendarMapping> {
    const rows = await this.db
      .insert(schema.resourceCalendarMapping)
      .values(mapping)
      .onConflictDoUpdate({
        target: [
          schema.resourceCalendarMapping.organizationId,
          schema.resourceCalendarMapping.resourceId,
          schema.resourceCalendarMapping.provider,
        ],
        set: {
          calendarIdRedacted: mapping.calendarIdRedacted,
          status: mapping.status,
          lastSyncedAt: mapping.lastSyncedAt,
          lastErrorCode: mapping.lastErrorCode,
          updatedAt: mapping.updatedAt,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("resource_calendar_mapping_save_failed");
    return rowToMapping(row);
  }

  async findMapping(input: {
    organizationId: string;
    resourceId: string;
    provider: ResourceCalendarProvider;
  }): Promise<ResourceCalendarMapping | null> {
    const rows = await this.db
      .select()
      .from(schema.resourceCalendarMapping)
      .where(
        and(
          eq(schema.resourceCalendarMapping.organizationId, input.organizationId),
          eq(schema.resourceCalendarMapping.resourceId, input.resourceId),
          eq(schema.resourceCalendarMapping.provider, input.provider)
        )
      )
      .limit(1);
    return rows[0] ? rowToMapping(rows[0]) : null;
  }

  async upsertBusyBlock(block: ResourceBusyBlock): Promise<ResourceBusyBlock> {
    const rows = await this.db
      .insert(schema.resourceBusyBlock)
      .values(block)
      .onConflictDoUpdate({
        target: [
          schema.resourceBusyBlock.organizationId,
          schema.resourceBusyBlock.resourceId,
          schema.resourceBusyBlock.source,
          schema.resourceBusyBlock.providerEventIdHash,
        ],
        set: {
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          status: block.status,
          summaryRedacted: block.summaryRedacted,
          updatedAt: block.updatedAt,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("resource_busy_block_upsert_failed");
    return rowToBusyBlock(row);
  }

  async deactivateMissingBusyBlocks(input: {
    organizationId: string;
    resourceId: string;
    providerEventIdHashes: string[];
    now: Date;
  }): Promise<number> {
    const conditions = [
      eq(schema.resourceBusyBlock.organizationId, input.organizationId),
      eq(schema.resourceBusyBlock.resourceId, input.resourceId),
      eq(schema.resourceBusyBlock.source, "google_calendar"),
      eq(schema.resourceBusyBlock.status, "active"),
    ];
    if (input.providerEventIdHashes.length > 0) {
      conditions.push(
        notInArray(schema.resourceBusyBlock.providerEventIdHash, input.providerEventIdHashes)
      );
    }
    const rows = await this.db
      .update(schema.resourceBusyBlock)
      .set({ status: "cancelled", updatedAt: input.now })
      .where(and(...conditions))
      .returning({ id: schema.resourceBusyBlock.id });
    return rows.length;
  }

  async listBusyBlocks(input: {
    organizationId: string;
    resourceId?: string;
    rangeStart: Date;
    rangeEnd: Date;
    statuses?: ResourceBusyBlockStatus[];
  }): Promise<ResourceBusyBlock[]> {
    const conditions = [
      eq(schema.resourceBusyBlock.organizationId, input.organizationId),
      lt(schema.resourceBusyBlock.startsAt, input.rangeEnd),
      gt(schema.resourceBusyBlock.endsAt, input.rangeStart),
    ];
    if (input.resourceId) {
      conditions.push(eq(schema.resourceBusyBlock.resourceId, input.resourceId));
    }
    if (input.statuses?.length) {
      conditions.push(inArray(schema.resourceBusyBlock.status, input.statuses));
    }
    const rows = await this.db
      .select()
      .from(schema.resourceBusyBlock)
      .where(and(...conditions));
    return rows.map(rowToBusyBlock);
  }
}

export class MockCalendarBusyWindowProvider implements CalendarBusyWindowProvider {
  windows: ProviderBusyWindow[] = [];
  error: unknown = null;

  async listBusyWindows(): Promise<ProviderBusyWindow[]> {
    if (this.error) throw this.error;
    return this.windows.map((window) => ({
      ...window,
      startsAt: new Date(window.startsAt),
      endsAt: new Date(window.endsAt),
    }));
  }
}

export function busyBlocksToAvailabilityBlockingRanges(
  busyBlocks: ResourceBusyBlock[]
): AvailabilityBlockingRange[] {
  return busyBlocks
    .filter((block) => block.status === "active")
    .map((block) => ({
      resourceId: block.resourceId,
      startsAt: new Date(block.startsAt),
      endsAt: new Date(block.endsAt),
      source: "calendar_busy_block" as const,
    }));
}

export function createResourceCalendarMappingService(): ResourceCalendarMappingService {
  return new ResourceCalendarMappingService(new DrizzleResourceCalendarBusyBlockRepository());
}

export function serializeResourceCalendarMapping(mapping: ResourceCalendarMapping) {
  return {
    id: mapping.id,
    resourceId: mapping.resourceId,
    provider: mapping.provider,
    calendarIdRedacted: mapping.calendarIdRedacted,
    status: mapping.status,
    lastSyncedAt: mapping.lastSyncedAt?.toISOString() ?? null,
    lastErrorCode: mapping.lastErrorCode,
    createdAt: mapping.createdAt.toISOString(),
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

export function serializeResourceBusyBlock(block: ResourceBusyBlock) {
  return {
    id: block.id,
    resourceId: block.resourceId,
    source: block.source,
    startsAt: block.startsAt.toISOString(),
    endsAt: block.endsAt.toISOString(),
    status: block.status,
    summaryRedacted: block.summaryRedacted,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

export function redactCalendarId(calendarId: string): string {
  if (calendarId === "primary") return "primary";
  const [local, domain] = calendarId.split("@");
  if (!domain) return "[redacted-calendar]";
  return `${local?.slice(0, 2) || "**"}***@${domain}`;
}

export function hashProviderEventId(input: {
  provider: ResourceCalendarProvider;
  calendarId: string;
  providerEventId: string;
}): string {
  return createHash("sha256")
    .update(`${input.provider}:${input.calendarId}:${input.providerEventId}`)
    .digest("hex");
}

function createMapping(input: {
  organizationId: string;
  resourceId: string;
  provider: ResourceCalendarProvider;
  calendarId: string;
  now: Date;
}): ResourceCalendarMapping {
  return {
    id: `rcm_${hashProviderEventId({
      provider: input.provider,
      calendarId: input.calendarId,
      providerEventId: `${input.organizationId}:${input.resourceId}`,
    }).slice(0, 20)}`,
    organizationId: input.organizationId,
    resourceId: input.resourceId,
    provider: input.provider,
    calendarIdRedacted: redactCalendarId(input.calendarId),
    status: "connected",
    lastSyncedAt: null,
    lastErrorCode: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function redactCalendarSummary(summary: string | null): string | null {
  if (!summary) return null;
  return summary.replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "[redacted-email]").slice(0, 160);
}

function normalizeCalendarSyncError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "[redacted-email]").slice(0, 80);
  }
  return "provider_error";
}

function mappingKey(mapping: ResourceCalendarMapping): string {
  return `${mapping.organizationId}:${mapping.resourceId}:${mapping.provider}`;
}

function busyBlockKey(block: ResourceBusyBlock): string {
  return `${block.organizationId}:${block.resourceId}:${block.providerEventIdHash}`;
}

function cloneMapping(mapping: ResourceCalendarMapping): ResourceCalendarMapping {
  return {
    ...mapping,
    lastSyncedAt: mapping.lastSyncedAt ? new Date(mapping.lastSyncedAt) : null,
    createdAt: new Date(mapping.createdAt),
    updatedAt: new Date(mapping.updatedAt),
  };
}

function cloneBusyBlock(block: ResourceBusyBlock): ResourceBusyBlock {
  return {
    ...block,
    startsAt: new Date(block.startsAt),
    endsAt: new Date(block.endsAt),
    createdAt: new Date(block.createdAt),
    updatedAt: new Date(block.updatedAt),
  };
}

function rowToMapping(
  row: typeof schema.resourceCalendarMapping.$inferSelect
): ResourceCalendarMapping {
  return {
    ...row,
    provider: row.provider as ResourceCalendarProvider,
    status: row.status as ResourceCalendarMappingStatus,
    lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function rowToBusyBlock(row: typeof schema.resourceBusyBlock.$inferSelect): ResourceBusyBlock {
  return {
    ...row,
    source: row.source as ResourceBusyBlock["source"],
    status: row.status as ResourceBusyBlockStatus,
    startsAt: new Date(row.startsAt),
    endsAt: new Date(row.endsAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
