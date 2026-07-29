import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KbEntry } from "@/server/kb/manager";

const selectQueue: unknown[][] = [];
const insertedRows: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (
    resolve: (value: unknown) => void
  ) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: unknown) => ({
        returning: () => {
          insertedRows.push(values);
          return Promise.resolve([values]);
        },
      }),
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
        ),
    }
  ),
}));

const now = new Date("2026-07-28T00:00:00.000Z");

function entry(overrides: Partial<KbEntry>): KbEntry {
  return {
    id: "kb_1",
    organizationId: "org_1",
    kind: "qa",
    question: "Pregunta",
    answer: "Respuesta",
    content: null,
    category: "faq",
    reviewStatus: "reviewed",
    sourceLabel: null,
    priority: 100,
    active: true,
    lastReviewedAt: now,
    reviewedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Customer KB manager", () => {
  beforeEach(() => {
    vi.resetModules();
    selectQueue.length = 0;
    insertedRows.length = 0;
  });

  it("reports missing required reviewed categories", async () => {
    selectQueue.push([
      entry({ id: "kb_profile", category: "business_profile" }),
      entry({ id: "kb_services", category: "services" }),
      entry({ id: "kb_draft_hours", category: "hours", reviewStatus: "draft" }),
    ]);

    const { getKbReadiness } = await import("@/server/kb/manager");
    const readiness = await getKbReadiness("org_1");

    expect(readiness.ready).toBe(false);
    expect(readiness.missingCategories).toContain("hours");
    expect(readiness.missingCategories).toContain("policies");
    expect(readiness.draftCount).toBe(1);
  });

  it("deduplicates imports by category and content", async () => {
    selectQueue.push([
      entry({
        id: "kb_existing",
        category: "faq",
        question: "¿Horario?",
        answer: "De 8 a 18.",
      }),
    ]);

    const { importKbEntries } = await import("@/server/kb/manager");
    const result = await importKbEntries("org_1", {
      entries: [
        {
          kind: "qa",
          category: "faq",
          reviewStatus: "draft",
          priority: 100,
          active: true,
          question: "¿Horario?",
          answer: "De 8 a 18.",
        },
        {
          kind: "block",
          category: "policies",
          reviewStatus: "draft",
          priority: 100,
          active: true,
          content: "No se aceptan cancelaciones el mismo día.",
        },
      ],
    });

    expect(result.imported).toBe(1);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      organizationId: "org_1",
      kind: "block",
      category: "policies",
      reviewStatus: "draft",
    });
  });

  it("normalizes entry defaults before inserting", async () => {
    const { createKbEntry } = await import("@/server/kb/manager");

    await createKbEntry("org_1", {
      kind: "qa",
      question: "¿Aceptan reservas?",
      answer: "Sí.",
    });

    expect(insertedRows[0]).toMatchObject({
      organizationId: "org_1",
      kind: "qa",
      category: "other",
      reviewStatus: "draft",
      priority: 100,
      active: true,
      lastReviewedAt: null,
    });
  });

  it("redacts obvious secrets and phone numbers from exports", async () => {
    const { exportKbEntries } = await import("@/server/kb/manager");
    const syntheticOpenRouterToken = `sk-or-v1-${"secret"}`;
    const syntheticMetaToken = `EAAN${"abc123"}`;

    const exported = exportKbEntries([
      entry({
        question: "Token?",
        answer: `Bearer abc.def +595 981 111111 ${syntheticOpenRouterToken} ${syntheticMetaToken} https://user:pass@example.com/path`,
        sourceLabel: "source +1 555-152-3569",
      }),
    ]);
    const serialized = JSON.stringify(exported);

    expect(serialized).toContain("[redacted_openrouter_token]");
    expect(serialized).toContain("[redacted_meta_token]");
    expect(serialized).toContain("Bearer [redacted_token]");
    expect(serialized).toContain("https://[redacted]@example.com/path");
    expect(serialized).not.toContain(syntheticOpenRouterToken);
    expect(serialized).not.toContain(syntheticMetaToken);
    expect(serialized).not.toContain("+595 981 111111");
    expect(serialized).not.toContain("+1 555-152-3569");
  });
});
