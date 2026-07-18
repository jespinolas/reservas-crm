import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AutomationOutboxEvent,
  AutomationOutboxService,
} from "@/server/automation/outbox";

export const AUTOMATION_ENVELOPE_VERSION = "2026-07-18";

export type AutomationDeliveryEnvelope = {
  version: typeof AUTOMATION_ENVELOPE_VERSION;
  eventId: string;
  organizationId: string;
  eventType: string;
  eventVersion: string;
  attempt: number;
  idempotencyKey: string;
  issuedAt: string;
  payload: unknown;
};

export interface AutomationTransport {
  deliver(input: {
    envelope: AutomationDeliveryEnvelope;
    signature: string;
  }): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }>;
}

export function buildAutomationEnvelope(input: {
  event: AutomationOutboxEvent;
  issuedAt: Date;
}): AutomationDeliveryEnvelope {
  return {
    version: AUTOMATION_ENVELOPE_VERSION,
    eventId: input.event.id,
    organizationId: input.event.organizationId,
    eventType: input.event.eventType,
    eventVersion: input.event.eventVersion,
    attempt: input.event.attempts + 1,
    idempotencyKey: input.event.idempotencyKey,
    issuedAt: input.issuedAt.toISOString(),
    payload: input.event.payload,
  };
}

export function signAutomationEnvelope(input: {
  envelope: AutomationDeliveryEnvelope;
  secret: string;
}): string {
  return `sha256=${createHmac("sha256", input.secret)
    .update(canonicalJson(input.envelope))
    .digest("hex")}`;
}

export function verifyAutomationEnvelopeSignature(input: {
  envelope: AutomationDeliveryEnvelope;
  signature: string;
  secret: string;
}): boolean {
  const expected = signAutomationEnvelope({
    envelope: input.envelope,
    secret: input.secret,
  });
  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export class AutomationDeliveryRunner {
  constructor(
    private readonly outbox: Pick<
      AutomationOutboxService,
      "claimDue" | "markDelivered" | "markFailed" | "markDeadLetter"
    >,
    private readonly transport: AutomationTransport,
    private readonly config: {
      signingSecret: string;
      maxAttempts?: number;
      retryDelayMs?: number;
    }
  ) {}

  async deliverDue(input: {
    organizationId: string;
    now?: Date;
    limit?: number;
  }): Promise<{ delivered: number; failed: number; deadLettered: number }> {
    const now = input.now ?? new Date();
    const claimed = await this.outbox.claimDue({
      organizationId: input.organizationId,
      now,
      limit: input.limit,
    });
    const summary = { delivered: 0, failed: 0, deadLettered: 0 };

    for (const event of claimed) {
      const envelope = buildAutomationEnvelope({ event, issuedAt: now });
      const signature = signAutomationEnvelope({
        envelope,
        secret: this.config.signingSecret,
      });
      const result = await this.transport.deliver({ envelope, signature });
      if (result.ok) {
        await this.outbox.markDelivered({
          organizationId: event.organizationId,
          eventId: event.id,
          now,
        });
        summary.delivered += 1;
        continue;
      }

      const maxAttempts = this.config.maxAttempts ?? 5;
      if (!result.retryable || envelope.attempt >= maxAttempts) {
        await this.outbox.markDeadLetter({
          organizationId: event.organizationId,
          eventId: event.id,
          error: result.error,
          now,
        });
        summary.deadLettered += 1;
        continue;
      }

      await this.outbox.markFailed({
        organizationId: event.organizationId,
        eventId: event.id,
        error: result.error,
        nextAttemptAt: new Date(now.getTime() + (this.config.retryDelayMs ?? 60_000)),
        now,
      });
      summary.failed += 1;
    }

    return summary;
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortKeys(nested)])
  );
}
