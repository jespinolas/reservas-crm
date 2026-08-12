import { describe, expect, it, vi } from "vitest";
import { CoreApiClient, CoreApiError } from "@/server/core/client";
import { getCoreApiMode, getCoreApiUrl } from "@/server/core/config";

describe("Core API client boundary", () => {
  it("normalizes the configured URL and mode", () => {
    expect(getCoreApiUrl({ CORE_API_URL: "https://core.example/" })).toBe("https://core.example");
    expect(getCoreApiMode({ CORE_API_MODE: "shadow" })).toBe("shadow");
    expect(getCoreApiMode({})).toBe("legacy");
  });

  it("rejects invalid configuration", () => {
    expect(() => getCoreApiUrl({})).toThrow("CORE_API_URL");
    expect(() => getCoreApiMode({ CORE_API_MODE: "bad" })).toThrow("CORE_API_MODE");
  });

  it("sends bearer auth and idempotency headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "m1" }), { status: 202 }));
    const client = new CoreApiClient("token", "https://core.example", fetcher);
    await client.sendManualReply("c1", "hello", "key-1");
    expect(fetcher).toHaveBeenCalledWith(
      "https://core.example/api/v1/conversations/c1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token", "Idempotency-Key": "key-1" }),
      }),
    );
  });

  it("surfaces unsuccessful responses without response-body leakage", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("secret provider body", { status: 403 }));
    await expect(new CoreApiClient("token", "https://core.example", fetcher).listMessages("c1"))
      .rejects.toEqual(new CoreApiError(403, "Core API request failed: 403"));
  });

  it("uses typed reservation reads through the same bearer boundary", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    const client = new CoreApiClient("token", "https://core.example", fetcher);
    await client.listAvailability("r1", "s1", new Date("2026-08-17T08:00:00Z"), new Date("2026-08-17T09:00:00Z"));
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/api/v1/availability?"), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token" }) }));
  });

  it("sends idempotent reservation commands through Core", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 200 })));
    const client = new CoreApiClient("token", "https://core.example", fetcher);
    await client.confirmHold("h1", "confirm-1");
    await client.cancelHold("h1", "cancel-hold-1");
    await client.cancelReservation("r1", "cancel-reservation-1");
    expect(fetcher).toHaveBeenNthCalledWith(1, "https://core.example/api/v1/holds/h1/confirm", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "confirm-1" }) }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "https://core.example/api/v1/reservations/r1/cancel", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "cancel-reservation-1" }) }));
  });
});
