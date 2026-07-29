import { desc, eq } from "drizzle-orm";
import { getAiProviderReadiness } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export type AiReplyAttemptState =
  | "disabled"
  | "not_ready"
  | "eligible"
  | "generating"
  | "sent"
  | "blocked"
  | "failed"
  | "handoff";

export type AiReplyBlockedReason =
  | "crm_unhealthy"
  | "db_unavailable"
  | "provider_not_configured"
  | "provider_failed"
  | "conversation_ai_disabled"
  | "business_ai_disabled"
  | "human_handoff"
  | "outside_window"
  | "duplicate_inbound"
  | "send_failed"
  | "invalid_model_output";

export type AiReplyAttempt = typeof schema.aiReplyAttempt.$inferSelect;

export async function beginAiReplyAttempt(input: {
  organizationId: string;
  conversationId: string;
  inboundMessageId: string;
}): Promise<{ attempt: AiReplyAttempt; duplicate: boolean }> {
  const db = getDb();
  const readiness = getAiProviderReadiness();
  const inserted = await db
    .insert(schema.aiReplyAttempt)
    .values({
      id: newId("aiReplyAttempt"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      inboundMessageId: input.inboundMessageId,
      state: "eligible",
      provider: readiness.provider,
      model: readiness.model,
    })
    .onConflictDoNothing({
      target: [schema.aiReplyAttempt.inboundMessageId],
    })
    .returning();

  if (inserted[0]) return { attempt: inserted[0], duplicate: false };

  const rows = await db
    .select()
    .from(schema.aiReplyAttempt)
    .where(eq(schema.aiReplyAttempt.inboundMessageId, input.inboundMessageId))
    .limit(1);
  const existing = rows[0];
  if (!existing) {
    throw new Error("ai_reply_attempt no encontrado tras conflicto");
  }
  return { attempt: existing, duplicate: true };
}

export async function markAiReplyAttempt(
  attemptId: string,
  patch: {
    state: AiReplyAttemptState;
    blockedReason?: AiReplyBlockedReason | null;
    providerMessageId?: string | null;
    latencyMs?: number | null;
    redactedError?: string | null;
  }
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.aiReplyAttempt)
    .set({
      state: patch.state,
      blockedReason: patch.blockedReason,
      providerMessageId: patch.providerMessageId,
      latencyMs: patch.latencyMs,
      redactedError: patch.redactedError
        ? redactAttemptError(patch.redactedError)
        : patch.redactedError,
      updatedAt: new Date(),
    })
    .where(eq(schema.aiReplyAttempt.id, attemptId));
}

export async function getLatestAiReplyAttempt(
  conversationId: string
): Promise<AiReplyAttempt | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiReplyAttempt)
    .where(eq(schema.aiReplyAttempt.conversationId, conversationId))
    .orderBy(desc(schema.aiReplyAttempt.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export function toAgentState(
  conversation: Pick<
    typeof schema.conversation.$inferSelect,
    "aiEnabled" | "handoffAt"
  >,
  attempt: AiReplyAttempt | null
) {
  return {
    enabled: conversation.aiEnabled && !conversation.handoffAt,
    attemptId: attempt?.id ?? null,
    state: attempt?.state ?? (conversation.aiEnabled ? "eligible" : "disabled"),
    blockedReason: attempt?.blockedReason ?? null,
    provider: attempt?.provider ?? null,
    model: attempt?.model ?? null,
    latencyMs: attempt?.latencyMs ?? null,
    redactedError: attempt?.redactedError ?? null,
    lastAttemptAt: attempt?.updatedAt?.toISOString() ?? null,
  };
}

function redactAttemptError(error: string): string {
  return error
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "[redacted]")
    .slice(0, 500);
}
