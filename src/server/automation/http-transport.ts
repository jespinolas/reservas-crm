import type {
  AutomationDeliveryEnvelope,
  AutomationTransport,
} from "@/server/automation/delivery";

type FetchLike = typeof fetch;

export class AutomationHttpTransport implements AutomationTransport {
  constructor(
    private readonly config: {
      webhookUrl: string;
      fetchImpl?: FetchLike;
      timeoutMs?: number;
    }
  ) {}

  async deliver(input: {
    envelope: AutomationDeliveryEnvelope;
    signature: string;
  }): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 10_000
    );

    try {
      const response = await fetchImpl(this.config.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-reservas-signature": input.signature,
          "x-reservas-event-id": input.envelope.eventId,
          "x-reservas-idempotency-key": input.envelope.idempotencyKey,
          "x-reservas-envelope-version": input.envelope.version,
        },
        body: JSON.stringify(input.envelope),
        signal: controller.signal,
      });

      if (response.ok) return { ok: true };
      return {
        ok: false,
        error: `n8n webhook returned ${response.status}`,
        retryable: isRetryableStatus(response.status),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "n8n webhook request failed",
        retryable: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}
