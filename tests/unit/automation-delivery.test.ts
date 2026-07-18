import { describe, expect, it } from "vitest";
import {
  AutomationDeliveryRunner,
  buildAutomationEnvelope,
  signAutomationEnvelope,
  verifyAutomationEnvelopeSignature,
  type AutomationTransport,
} from "@/server/automation/delivery";
import {
  AutomationOutboxService,
  InMemoryAutomationOutboxRepository,
} from "@/server/automation/outbox";

const now = new Date("2026-07-18T12:00:00.000Z");
const secret = "automation-signing-secret-for-tests";

function fixture(transport: AutomationTransport) {
  const repository = new InMemoryAutomationOutboxRepository();
  const service = new AutomationOutboxService(repository);
  const runner = new AutomationDeliveryRunner(service, transport, {
    signingSecret: secret,
    maxAttempts: 2,
    retryDelayMs: 5 * 60_000,
  });
  return { repository, service, runner };
}

async function enqueue(service: AutomationOutboxService) {
  return service.enqueue({
    organizationId: "org_1",
    eventType: "reservation.confirmed",
    eventVersion: "2026-07-18",
    idempotencyKey: "rsv_1:confirmed",
    payload: { reservationId: "rsv_1" },
    now,
  });
}

describe("automation delivery envelopes", () => {
  it("builds signed envelopes and rejects tampering", async () => {
    const { service } = fixture(okTransport());
    const event = await enqueue(service);
    const envelope = buildAutomationEnvelope({ event, issuedAt: now });
    const signature = signAutomationEnvelope({ envelope, secret });

    expect(signature).toMatch(/^sha256=/);
    expect(
      verifyAutomationEnvelopeSignature({ envelope, signature, secret })
    ).toBe(true);
    expect(
      verifyAutomationEnvelopeSignature({
        envelope: { ...envelope, eventType: "tampered" },
        signature,
        secret,
      })
    ).toBe(false);
  });

  it("marks delivered events after successful transport", async () => {
    const transport = recordingTransport({ ok: true });
    const { repository, service, runner } = fixture(transport);
    const event = await enqueue(service);

    const summary = await runner.deliverDue({ organizationId: "org_1", now });

    expect(summary).toEqual({ delivered: 1, failed: 0, deadLettered: 0 });
    expect(repository.events.get(event.id)).toMatchObject({
      status: "delivered",
      deliveredAt: now,
    });
    expect(transport.deliveries[0]?.signature).toMatch(/^sha256=/);
  });

  it("schedules retry on retryable delivery failure", async () => {
    const { repository, service, runner } = fixture(
      recordingTransport({ ok: false, error: "n8n unavailable", retryable: true })
    );
    const event = await enqueue(service);

    const summary = await runner.deliverDue({ organizationId: "org_1", now });

    expect(summary).toEqual({ delivered: 0, failed: 1, deadLettered: 0 });
    expect(repository.events.get(event.id)).toMatchObject({
      status: "failed",
      attempts: 1,
      nextAttemptAt: new Date("2026-07-18T12:05:00.000Z"),
      lastError: "n8n unavailable",
    });
  });

  it("dead-letters non-retryable failures", async () => {
    const { repository, service, runner } = fixture(
      recordingTransport({ ok: false, error: "bad request", retryable: false })
    );
    const event = await enqueue(service);

    const summary = await runner.deliverDue({ organizationId: "org_1", now });

    expect(summary).toEqual({ delivered: 0, failed: 0, deadLettered: 1 });
    expect(repository.events.get(event.id)).toMatchObject({
      status: "dead_letter",
      lastError: "bad request",
    });
  });

  it("dead-letters retryable failures after max attempts", async () => {
    const { repository, service, runner } = fixture(
      recordingTransport({ ok: false, error: "still down", retryable: true })
    );
    const event = await enqueue(service);
    await service.markFailed({
      organizationId: "org_1",
      eventId: event.id,
      error: "first failure",
      nextAttemptAt: now,
      now,
    });

    const summary = await runner.deliverDue({ organizationId: "org_1", now });

    expect(summary).toEqual({ delivered: 0, failed: 0, deadLettered: 1 });
    expect(repository.events.get(event.id)).toMatchObject({
      status: "dead_letter",
      attempts: 1,
      lastError: "still down",
    });
  });
});

function okTransport(): AutomationTransport {
  return {
    deliver: async () => ({ ok: true }),
  };
}

function recordingTransport(result: Awaited<ReturnType<AutomationTransport["deliver"]>>) {
  const deliveries: { envelope: unknown; signature: string }[] = [];
  return {
    deliveries,
    deliver: async (input: { envelope: unknown; signature: string }) => {
      deliveries.push(input);
      return result;
    },
  };
}
