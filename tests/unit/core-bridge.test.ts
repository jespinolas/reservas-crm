import { describe, expect, it, vi } from "vitest";
import { CoreApiError } from "@/server/core/client";
import { createCoreBridgeAssertion, exchangeCoreBridgeSession, signCoreBridgeAssertion } from "@/server/core/bridge";

describe("Core bridge", () => {
  const assertion = createCoreBridgeAssertion(" Owner@Example.com ", " Hotel ", "OWNER", new Date("2026-08-12T12:00:00Z"), "12345678-1234-1234-1234-123456789012");

  it("normalizes the signed assertion and sends it server-to-server", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: "token", expiresAt: "2026-08-13T12:00:00Z", userId: "u", organizationId: "o" }), { status: 200 }));
    const response = await exchangeCoreBridgeSession(assertion, "secret", { baseUrl: "http://core", fetcher });
    expect(response.accessToken).toBe("token");
    expect(fetcher).toHaveBeenCalledWith("http://core/api/v1/auth/bridge", expect.objectContaining({ method: "POST" }));
    const call = fetcher.mock.calls[0];
    expect(call).toBeDefined();
    expect((call![1]!.headers as Record<string, string>)["X-Core-Bridge-Signature"]).toBe(signCoreBridgeAssertion(assertion, "secret"));
  });

  it("rejects missing secrets and preserves structured Core failures", async () => {
    expect(() => signCoreBridgeAssertion(assertion, " ")).toThrow("CRM_CORE_BRIDGE_SECRET");
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 409 }));
    await expect(exchangeCoreBridgeSession(assertion, "secret", { baseUrl: "http://core", fetcher })).rejects.toEqual(expect.any(CoreApiError));
  });
});
