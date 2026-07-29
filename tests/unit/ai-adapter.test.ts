import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatJson, extractJson } from "@/lib/ai";
import { getAiProviderReadiness } from "@/lib/env";

describe("extractJson (extracción robusta)", () => {
  it("JSON limpio", () => {
    expect(extractJson('{"action":"none"}')).toEqual({ action: "none" });
  });

  it("bloque ```json con texto alrededor", () => {
    const raw = 'Claro, aquí está:\n```json\n{"action":"reply","text":"hola"}\n```\nEspero que sirva.';
    expect(extractJson(raw)).toEqual({ action: "reply", text: "hola" });
  });

  it("JSON incrustado en prosa (primer { al último })", () => {
    const raw = 'La acción que tomaré es {"action":"handoff","reason":"cliente"} por lo dicho.';
    expect(extractJson(raw)).toEqual({ action: "handoff", reason: "cliente" });
  });

  it("sin JSON → null", () => {
    expect(extractJson("no tengo nada que decir")).toBeNull();
  });
});

describe("chatJson (reintentos y errores tipados)", () => {
  const schema = z.object({ action: z.literal("reply"), text: z.string() });

  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost:5432/t");
    vi.stubEnv("BETTER_AUTH_SECRET", "secret-de-test-suficiente");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-test");
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    vi.stubEnv("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash");
    vi.stubEnv("AI_MAX_OUTPUT_TOKENS", "321");
    vi.stubEnv("AI_PROVIDER_KEY_OWNERSHIP", "managed_customer_isolated");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function providerResponse(content: string) {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  it("salida inválida al primer intento → reintenta con STRICT y triunfa", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse("no soy json"))
      .mockResolvedValueOnce(providerResponse('{"action":"reply","text":"ok"}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(firstBody.max_tokens).toBe(321);
    // el reintento agrega la instrucción STRICT
    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(JSON.stringify(secondBody.messages)).toContain("STRICT");
  });

  it("proveedor caído (500 persistente) → error tipado, jamás excepción", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("boom", { status: 500 }))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("provider_error");
    expect(fetchMock).toHaveBeenCalledTimes(3); // agotó los 3 intentos
  });

  it("salida que nunca cumple el esquema → invalid_output", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(providerResponse('{"action":"otra_cosa"}'))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_output");
  });

  it("sin token → not_configured sin tocar la red", async () => {
    vi.stubEnv("OPENROUTER_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("readiness expone política de costo sin secretos", () => {
    const readiness = getAiProviderReadiness();

    expect(readiness).toMatchObject({
      provider: "openrouter",
      configured: true,
      model: "deepseek/deepseek-v4-flash",
      keyOwnership: "managed_customer_isolated",
      lastStatus: "ok",
      costPolicy: {
        approvedLowCostModel: "deepseek/deepseek-v4-flash",
        usesApprovedLowCostModel: true,
        maxOutputTokens: 321,
        billableProbeDisabled: true,
      },
    });
    expect(JSON.stringify(readiness)).not.toContain("token-test");
  });

  it("cap diario en cero bloquea llamadas antes de tocar proveedor", async () => {
    vi.stubEnv("AI_DAILY_REPLY_CAP", "0");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const readiness = getAiProviderReadiness();
    expect(readiness.lastStatus).toBe("spend_cap_reached");

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toBe("spend_cap_reached");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
