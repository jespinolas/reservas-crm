import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getAiProviderReadiness } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isWindowOpen } from "@/server/inbox/window";

type Attempt = typeof schema.aiReplyAttempt.$inferSelect;
type Conversation = typeof schema.conversation.$inferSelect;
type Contact = typeof schema.contact.$inferSelect;

export type AiReplyTrace = {
  conversation: {
    id: string;
    contactId: string;
    contactName: string;
    phoneMasked: string;
    aiEnabled: boolean;
    handoffReason: string | null;
    windowOpen: boolean;
  };
  readiness: {
    configured: boolean;
    provider: string;
    model: string | null;
    status: string;
    errorCode: string | null;
  };
  attempts: AiReplyTraceAttempt[];
};

export type AiReplyTraceAttempt = {
  id: string;
  inboundMessageId: string;
  providerMessageId: string | null;
  state: string;
  blockedReason: string | null;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  redactedError: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getAiReplyTrace(input: {
  organizationId: string;
  conversationId: string;
  since?: Date;
  until?: Date;
  limit?: number;
}): Promise<AiReplyTrace | null> {
  const db = getDb();
  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const attemptWhere = [
    eq(schema.aiReplyAttempt.organizationId, input.organizationId),
    eq(schema.aiReplyAttempt.conversationId, input.conversationId),
    input.since ? gte(schema.aiReplyAttempt.createdAt, input.since) : undefined,
    input.until ? lte(schema.aiReplyAttempt.createdAt, input.until) : undefined,
  ].filter(Boolean);

  const attempts = await db
    .select()
    .from(schema.aiReplyAttempt)
    .where(and(...attemptWhere))
    .orderBy(desc(schema.aiReplyAttempt.createdAt))
    .limit(input.limit ?? 20);

  const readiness = getAiProviderReadiness();
  return {
    conversation: serializeConversation(row.conversation, row.contact),
    readiness: {
      configured: readiness.configured,
      provider: readiness.provider,
      model: readiness.model,
      status: readiness.lastStatus,
      errorCode: readiness.lastErrorCode,
    },
    attempts: attempts.map(serializeAttempt),
  };
}

export function exportAiReplyEvidence(input: {
  trace: AiReplyTrace;
  generatedAt?: Date;
}) {
  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    artifact: "ai-reply-evidence",
    version: 1,
    conversation: input.trace.conversation,
    readiness: input.trace.readiness,
    attempts: input.trace.attempts,
    redaction: {
      phoneNumbers: "masked",
      messageBodies: "omitted",
      secrets: "redacted",
    },
  };
}

export function serializeAttempt(attempt: Attempt): AiReplyTraceAttempt {
  return {
    id: attempt.id,
    inboundMessageId: attempt.inboundMessageId,
    providerMessageId: attempt.providerMessageId,
    state: attempt.state,
    blockedReason: attempt.blockedReason,
    provider: attempt.provider,
    model: attempt.model,
    latencyMs: attempt.latencyMs,
    redactedError: redactEvidenceValue(attempt.redactedError),
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

function serializeConversation(conversation: Conversation, contact: Contact) {
  return {
    id: conversation.id,
    contactId: contact.id,
    contactName: contact.name,
    phoneMasked: maskPhone(contact.phone),
    aiEnabled: conversation.aiEnabled,
    handoffReason: conversation.handoffReason,
    windowOpen: isWindowOpen(conversation.lastInboundAt),
  };
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function redactEvidenceValue(value: string | null): string | null {
  if (!value) return value;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/EAAN[A-Za-z0-9]+/g, "[redacted-meta-token]")
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[redacted]@")
    .replace(/OPENROUTER_[A-Z_]*TOKEN=[^\s]+/g, "OPENROUTER_TOKEN=[redacted]")
    .slice(0, 500);
}
