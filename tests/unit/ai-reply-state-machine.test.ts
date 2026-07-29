import { beforeEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
const updates: Record<string, unknown>[] = [];
let insertReturningQueue: unknown[][] = [];

vi.mock("@/lib/ai", () => ({
  chatJson,
}));

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
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        const chain = {
          onConflictDoNothing: () => chain,
          returning: () =>
            Promise.resolve(insertReturningQueue.shift() ?? [values]),
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve(insertReturningQueue.shift() ?? [values]).then(resolve),
        };
        return chain;
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return {
          where: () => {
            const chain = {
              returning: () => Promise.resolve([values]),
              then: (resolve: (v: unknown) => void) =>
                Promise.resolve([values]).then(resolve),
            };
            return chain;
          },
        };
      },
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

const baseConversation = {
  id: "cv_1",
  organizationId: "org_1",
  contactId: "ct_1",
  isTest: false,
  aiEnabled: true,
  handoffAt: null,
  handoffReason: null,
  lastInboundAt: new Date(),
};

const inboundMessage = {
  id: "msg_in_1",
  direction: "in",
  text: "hola",
  createdAt: new Date(),
};

const agentProfile = {
  id: "agp_1",
  organizationId: "org_1",
  enabled: true,
  name: "Reservas",
  tone: null,
  instructions: null,
  escalationRules: null,
  greeting: null,
};

describe("estado de auto-respuesta del agente", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    chatJson.mockReset();
    selectQueue.length = 0;
    inserts.length = 0;
    updates.length = 0;
    insertReturningQueue = [];
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-value");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32).toString("base64"));
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "test-verify-token");
  });

  it("bloquea el turno cuando falta el proveedor de IA", async () => {
    selectQueue.push(
      [baseConversation],
      [inboundMessage],
      [agentProfile]
    );

    const { runAgentTurn } = await import("@/server/ai/pipeline");
    await runAgentTurn("cv_1");

    expect(chatJson).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        state: "blocked",
        blockedReason: "provider_not_configured",
      })
    );
  });

  it("ignora un inbound ya procesado", async () => {
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    vi.stubEnv("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash");
    insertReturningQueue = [[]];
    selectQueue.push(
      [baseConversation],
      [inboundMessage],
      [
        {
          id: "aira_existing",
          state: "sent",
          inboundMessageId: inboundMessage.id,
        },
      ]
    );

    const { runAgentTurn } = await import("@/server/ai/pipeline");
    await runAgentTurn("cv_1");

    expect(chatJson).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("registra handoff cuando la conversación ya está escalada", async () => {
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    vi.stubEnv("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash");
    selectQueue.push(
      [{ ...baseConversation, handoffAt: new Date(), handoffReason: "cliente" }],
      [inboundMessage]
    );

    const { runAgentTurn } = await import("@/server/ai/pipeline");
    await runAgentTurn("cv_1");

    expect(chatJson).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        state: "handoff",
        blockedReason: "human_handoff",
      })
    );
  });
});
