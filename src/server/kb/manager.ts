import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { newId } from "@/lib/db/ids";

export const kbCategorySchema = z.enum([
  "business_profile",
  "services",
  "hours",
  "location",
  "policies",
  "pricing_notes",
  "faq",
  "escalation",
  "payment_instructions",
  "other",
]);

export const kbReviewStatusSchema = z.enum([
  "draft",
  "reviewed",
  "needs_update",
  "archived",
]);

export const kbKindSchema = z.enum(["qa", "block"]);

export type KbCategory = z.infer<typeof kbCategorySchema>;
export type KbReviewStatus = z.infer<typeof kbReviewStatusSchema>;
export type KbEntry = typeof schema.kbEntry.$inferSelect;

export const kbEntryInputSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("qa"),
      question: z.string().trim().min(1).max(500),
      answer: z.string().trim().min(1).max(4000),
    }),
    z.object({
      kind: z.literal("block"),
      content: z.string().trim().min(1).max(8000),
    }),
  ])
  .and(
    z.object({
      category: kbCategorySchema.default("other"),
      reviewStatus: kbReviewStatusSchema.default("draft"),
      sourceLabel: z.string().trim().max(120).nullable().optional(),
      priority: z.coerce.number().int().min(0).max(1000).default(100),
      active: z.boolean().default(true),
    })
  );

export type KbEntryInput = z.input<typeof kbEntryInputSchema>;
type NormalizedKbEntryInput = z.output<typeof kbEntryInputSchema>;

export const kbPatchSchema = z.object({
  question: z.string().trim().min(1).max(500).optional(),
  answer: z.string().trim().min(1).max(4000).optional(),
  content: z.string().trim().min(1).max(8000).optional(),
  category: kbCategorySchema.optional(),
  reviewStatus: kbReviewStatusSchema.optional(),
  sourceLabel: z.string().trim().max(120).nullable().optional(),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

const REQUIRED_CATEGORIES: KbCategory[] = [
  "business_profile",
  "services",
  "hours",
  "policies",
  "faq",
  "escalation",
];

const PROMPT_WARN_CHARS = 24_000;
const STALE_DAYS = 90;

export async function listKbEntries(input: {
  organizationId: string;
  category?: KbCategory;
  reviewStatus?: KbReviewStatus;
  active?: boolean;
}): Promise<KbEntry[]> {
  const db = getDb();
  const conditions = [
    eq(schema.kbEntry.organizationId, input.organizationId),
    input.category ? eq(schema.kbEntry.category, input.category) : undefined,
    input.reviewStatus
      ? eq(schema.kbEntry.reviewStatus, input.reviewStatus)
      : undefined,
    input.active !== undefined ? eq(schema.kbEntry.active, input.active) : undefined,
  ].filter(Boolean);

  return db
    .select()
    .from(schema.kbEntry)
    .where(and(...conditions))
    .orderBy(asc(schema.kbEntry.priority), asc(schema.kbEntry.createdAt));
}

export async function listLiveKbEntries(organizationId: string): Promise<KbEntry[]> {
  return listKbEntries({
    organizationId,
    reviewStatus: "reviewed",
    active: true,
  });
}

export async function createKbEntry(
  organizationId: string,
  rawInput: KbEntryInput
): Promise<KbEntry> {
  const input = normalizeKbEntryInput(rawInput);
  const db = getDb();
  const reviewed = input.reviewStatus === "reviewed";
  const inserted = await db
    .insert(schema.kbEntry)
    .values({
      id: newId("kbEntry"),
      organizationId,
      kind: input.kind,
      question: input.kind === "qa" ? input.question : null,
      answer: input.kind === "qa" ? input.answer : null,
      content: input.kind === "block" ? input.content : null,
      category: input.category,
      reviewStatus: input.reviewStatus,
      sourceLabel: input.sourceLabel ?? null,
      priority: input.priority,
      active: input.active,
      lastReviewedAt: reviewed ? new Date() : null,
    })
    .returning();
  if (!inserted[0]) throw new Error("kb entry insert failed");
  return inserted[0];
}

export async function reviewKbEntry(input: {
  organizationId: string;
  id: string;
}): Promise<KbEntry | null> {
  const db = getDb();
  const updated = await db
    .update(schema.kbEntry)
    .set({
      reviewStatus: "reviewed",
      active: true,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(scoped(schema.kbEntry.organizationId, input.organizationId, eq(schema.kbEntry.id, input.id)))
    .returning();
  return updated[0] ?? null;
}

export async function archiveKbEntry(input: {
  organizationId: string;
  id: string;
}): Promise<KbEntry | null> {
  const db = getDb();
  const updated = await db
    .update(schema.kbEntry)
    .set({
      reviewStatus: "archived",
      active: false,
      updatedAt: new Date(),
    })
    .where(scoped(schema.kbEntry.organizationId, input.organizationId, eq(schema.kbEntry.id, input.id)))
    .returning();
  return updated[0] ?? null;
}

export async function getKbReadiness(organizationId: string) {
  const entries = await listKbEntries({ organizationId });
  const liveEntries = entries.filter(
    (entry) => entry.active && entry.reviewStatus === "reviewed"
  );
  const liveCategories = new Set(liveEntries.map((entry) => entry.category));
  const missingCategories = REQUIRED_CATEGORIES.filter(
    (category) => !liveCategories.has(category)
  );
  const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const staleEntries = liveEntries.filter(
    (entry) => !entry.lastReviewedAt || entry.lastReviewedAt < staleBefore
  );
  const promptChars = renderKbText(liveEntries).length;

  return {
    ready:
      missingCategories.length === 0 &&
      staleEntries.length === 0 &&
      promptChars < PROMPT_WARN_CHARS,
    missingCategories,
    staleEntryIds: staleEntries.map((entry) => entry.id),
    draftCount: entries.filter((entry) => entry.reviewStatus === "draft").length,
    needsUpdateCount: entries.filter((entry) => entry.reviewStatus === "needs_update")
      .length,
    archivedCount: entries.filter((entry) => entry.reviewStatus === "archived")
      .length,
    liveEntryCount: liveEntries.length,
    promptChars,
    promptWarnAt: PROMPT_WARN_CHARS,
    promptWarning: promptChars >= PROMPT_WARN_CHARS,
  };
}

export function renderKbText(entries: KbEntry[]): string {
  if (entries.length === 0) return "(knowledge base vacío)";
  return entries
    .map((entry) =>
      entry.kind === "qa"
        ? `[${entry.category}] P: ${entry.question}\nR: ${entry.answer}`
        : `[${entry.category}] ${entry.content ?? ""}`
    )
    .filter(Boolean)
    .join("\n\n");
}

export function exportKbEntries(entries: KbEntry[]) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: entries.map((entry) => ({
      kind: entry.kind,
      question: redactKnowledgeExportText(entry.question),
      answer: redactKnowledgeExportText(entry.answer),
      content: redactKnowledgeExportText(entry.content),
      category: entry.category,
      reviewStatus: entry.reviewStatus,
      sourceLabel: redactKnowledgeExportText(entry.sourceLabel),
      priority: entry.priority,
      active: entry.active,
    })),
  };
}

function redactKnowledgeExportText(value: string | null): string | null {
  if (!value) return value;
  return value
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[redacted_openrouter_token]")
    .replace(/EAAN[A-Za-z0-9]+/g, "[redacted_meta_token]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted_token]")
    .replace(/(https?:\/\/)([^:\s/@]+):([^@\s]+)@/gi, "$1[redacted]@")
    .replace(/\+\d[\d\s().-]{7,}\d/g, "[redacted_phone]");
}

export const kbImportSchema = z.object({
  entries: z.array(kbEntryInputSchema).min(1).max(200),
});

export async function importKbEntries(
  organizationId: string,
  input: z.input<typeof kbImportSchema>
): Promise<{ imported: number; entries: KbEntry[] }> {
  const parsed = kbImportSchema.parse(input);
  const existing = await listKbEntries({ organizationId });
  const keys = new Set(existing.map(dedupeKey));
  const imported: KbEntry[] = [];
  for (const entry of parsed.entries) {
    const key = inputKey(entry);
    if (keys.has(key)) continue;
    const created = await createKbEntry(organizationId, entry);
    imported.push(created);
    keys.add(key);
  }
  return { imported: imported.length, entries: imported };
}

function normalizeKbEntryInput(input: KbEntryInput): NormalizedKbEntryInput {
  return kbEntryInputSchema.parse(input);
}

function dedupeKey(entry: KbEntry): string {
  return [
    entry.kind,
    entry.category,
    entry.question ?? "",
    entry.answer ?? "",
    entry.content ?? "",
  ].join("\u001f");
}

function inputKey(entry: NormalizedKbEntryInput): string {
  return [
    entry.kind,
    entry.category,
    entry.kind === "qa" ? entry.question : "",
    entry.kind === "qa" ? entry.answer : "",
    entry.kind === "block" ? entry.content : "",
  ].join("\u001f");
}
