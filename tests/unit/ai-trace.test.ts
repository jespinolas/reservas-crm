import { beforeEach, describe, expect, it, vi } from "vitest";

const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (
    resolve: (v: unknown) => void
  ) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
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

describe("AI reply trace and evidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    selectQueue.length = 0;
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-value");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32).toString("base64"));
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "test-verify-token");
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    vi.stubEnv("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash");
  });

  it("returns masked conversation data and redacted attempts", async () => {
    selectQueue.push(
      [
        {
          conversation: {
            id: "cv_1",
            contactId: "ct_1",
            aiEnabled: true,
            handoffReason: null,
            lastInboundAt: new Date("2026-07-27T01:00:00.000Z"),
          },
          contact: {
            id: "ct_1",
            name: "Cliente Demo",
            phone: "+595983532391",
          },
        },
      ],
      [
        {
          id: "aira_1",
          inboundMessageId: "wamid_secret",
          providerMessageId: "wamid_out",
          state: "failed",
          blockedReason: "provider_failed",
          provider: "openrouter",
          model: "deepseek/deepseek-v4-flash",
          latencyMs: 432,
          redactedError:
            "Bearer abc123 sk-test-secret postgresql://user:pass@db:5432/app",
          createdAt: new Date("2026-07-27T01:00:05.000Z"),
          updatedAt: new Date("2026-07-27T01:00:06.000Z"),
        },
      ]
    );

    const { getAiReplyTrace, exportAiReplyEvidence } = await import(
      "@/server/ai/trace"
    );
    const trace = await getAiReplyTrace({
      organizationId: "org_1",
      conversationId: "cv_1",
    });

    expect(trace).not.toBeNull();
    expect(trace!.conversation.phoneMasked).toBe("********2391");
    expect(trace!.readiness).toMatchObject({
      configured: true,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
    });
    const attempt = trace!.attempts[0];
    expect(attempt).toBeDefined();
    expect(attempt).toMatchObject({
      id: "aira_1",
      state: "failed",
      blockedReason: "provider_failed",
      latencyMs: 432,
    });
    expect(attempt!.redactedError).not.toContain("sk-test-secret");
    expect(attempt!.redactedError).not.toContain("user:pass");

    const evidence = exportAiReplyEvidence({
      trace: trace!,
      generatedAt: new Date("2026-07-27T01:01:00.000Z"),
    });
    const json = JSON.stringify(evidence);
    expect(json).toContain("ai-reply-evidence");
    expect(json).toContain("********2391");
    expect(json).not.toContain("+595983532391");
    expect(json).not.toContain("hola cliente");
    expect(json).not.toMatch(/sk-[A-Za-z0-9_-]+/);
    expect(json).not.toContain("Bearer abc123");
  });

  it("returns null for conversations outside the scoped organization", async () => {
    selectQueue.push([]);

    const { getAiReplyTrace } = await import("@/server/ai/trace");
    await expect(
      getAiReplyTrace({ organizationId: "org_2", conversationId: "cv_1" })
    ).resolves.toBeNull();
  });
});
