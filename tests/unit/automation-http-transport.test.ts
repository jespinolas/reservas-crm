import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_ENVELOPE_VERSION,
  type AutomationDeliveryEnvelope,
} from "@/server/automation/delivery";
import { AutomationHttpTransport } from "@/server/automation/http-transport";

const envelope: AutomationDeliveryEnvelope = {
  version: AUTOMATION_ENVELOPE_VERSION,
  eventId: "aout_1",
  organizationId: "org_1",
  eventType: "reservation.confirmed",
  eventVersion: "2026-07-18",
  attempt: 1,
  idempotencyKey: "rsv_1:confirmed",
  issuedAt: "2026-07-18T12:00:00.000Z",
  payload: { reservationId: "rsv_1" },
};

describe("AutomationHttpTransport", () => {
  it("posts signed envelopes to the configured webhook", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("accepted", { status: 202 }));
    const transport = new AutomationHttpTransport({
      webhookUrl: "https://n8n.example.test/webhook/reservas",
      fetchImpl,
    });

    const result = await transport.deliver({
      envelope,
      signature: "sha256=test-signature",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://n8n.example.test/webhook/reservas",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-reservas-signature": "sha256=test-signature",
          "x-reservas-event-id": "aout_1",
          "x-reservas-idempotency-key": "rsv_1:confirmed",
          "x-reservas-envelope-version": AUTOMATION_ENVELOPE_VERSION,
        }),
        body: JSON.stringify(envelope),
      })
    );
  });

  it("maps 5xx and rate limits to retryable failures", async () => {
    const serverError = new AutomationHttpTransport({
      webhookUrl: "https://n8n.example.test/webhook/reservas",
      fetchImpl: vi.fn().mockResolvedValue(new Response("down", { status: 503 })),
    });
    const rateLimit = new AutomationHttpTransport({
      webhookUrl: "https://n8n.example.test/webhook/reservas",
      fetchImpl: vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    });

    await expect(
      serverError.deliver({ envelope, signature: "sha256=test-signature" })
    ).resolves.toEqual({
      ok: false,
      error: "n8n webhook returned 503",
      retryable: true,
    });
    await expect(
      rateLimit.deliver({ envelope, signature: "sha256=test-signature" })
    ).resolves.toEqual({
      ok: false,
      error: "n8n webhook returned 429",
      retryable: true,
    });
  });

  it("maps validation failures to non-retryable failures", async () => {
    const transport = new AutomationHttpTransport({
      webhookUrl: "https://n8n.example.test/webhook/reservas",
      fetchImpl: vi.fn().mockResolvedValue(new Response("bad signature", { status: 401 })),
    });

    await expect(
      transport.deliver({ envelope, signature: "sha256=bad-signature" })
    ).resolves.toEqual({
      ok: false,
      error: "n8n webhook returned 401",
      retryable: false,
    });
  });

  it("maps network errors to retryable failures", async () => {
    const transport = new AutomationHttpTransport({
      webhookUrl: "https://n8n.example.test/webhook/reservas",
      fetchImpl: vi.fn().mockRejectedValue(new Error("connection refused")),
    });

    await expect(
      transport.deliver({ envelope, signature: "sha256=test-signature" })
    ).resolves.toEqual({
      ok: false,
      error: "connection refused",
      retryable: true,
    });
  });
});
