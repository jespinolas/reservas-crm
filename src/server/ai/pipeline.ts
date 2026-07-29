import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getAiProviderReadiness, getEnv } from "@/lib/env";
import { chatJson, type ChatMessage } from "@/lib/ai";
import { publish } from "@/server/events/bus";
import { isWindowOpen } from "@/server/inbox/window";
import { SendError, sendText } from "@/server/inbox/send";
import { AgentAction, degradeAction, resolveStage, type AgentActionType } from "@/server/ai/actions";
import { matchesHandoffIntent } from "@/server/ai/handoff";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";
import {
  beginAiReplyAttempt,
  markAiReplyAttempt,
  type AiReplyAttempt,
} from "@/server/ai/reply-attempts";
import { listLiveKbEntries } from "@/server/kb/manager";

/**
 * Turno del agente (FR-021..FR-025).
 *
 * Coalesce + lock in-process por conversación: ráfagas de mensajes → UNA
 * respuesta; nunca dos turnos simultáneos; lo que llega durante un turno
 * re-encola exactamente un turno más. Suficiente para el monolito de una
 * instancia (sin colas externas — Constitución II).
 */

type CoalesceEntry = {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: boolean;
};

const globalForAgent = globalThis as unknown as {
  __agentCoalesce?: Map<string, CoalesceEntry>;
};

function coalesceMap(): Map<string, CoalesceEntry> {
  if (!globalForAgent.__agentCoalesce) {
    globalForAgent.__agentCoalesce = new Map();
  }
  return globalForAgent.__agentCoalesce;
}

/** Punto de entrada con debounce (mensajes entrantes reales). */
export function scheduleAgentTurn(conversationId: string): void {
  const map = coalesceMap();
  const entry = map.get(conversationId) ?? {
    timer: null,
    running: false,
    pending: false,
  };
  map.set(conversationId, entry);

  if (entry.running) {
    entry.pending = true; // se re-encola al terminar el turno actual
    return;
  }
  if (entry.timer) clearTimeout(entry.timer);
  const delay = getEnv().AGENT_COALESCE_MS;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void executeTurn(conversationId);
  }, delay);
}

async function executeTurn(conversationId: string): Promise<void> {
  const map = coalesceMap();
  const entry = map.get(conversationId);
  if (!entry || entry.running) return;
  entry.running = true;
  try {
    await runAgentTurn(conversationId);
  } catch (err) {
    console.error("[agente] turno falló:", err);
  } finally {
    entry.running = false;
    if (entry.pending) {
      entry.pending = false;
      void executeTurn(conversationId);
    } else {
      map.delete(conversationId);
    }
  }
}

/**
 * Ejecuta UN turno del agente ahora (el Laboratorio lo llama directo, con
 * debounce 0 y sin pasar por el coalesce).
 */
export async function runAgentTurn(conversationId: string): Promise<void> {
  const db = getDb();
  const convRows = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  const conversation = convRows[0];
  if (!conversation) return;
  const organizationId = conversation.organizationId;

  const history = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(desc(schema.message.createdAt))
    .limit(20);
  history.reverse();
  const lastInbound = [...history].reverse().find((m) => m.direction === "in");
  if (!lastInbound) return;

  const { attempt, duplicate } = await beginAiReplyAttempt({
    organizationId,
    conversationId,
    inboundMessageId: lastInbound.id,
  });
  if (duplicate) return;

  // Condiciones de silencio: handoff activo o IA apagada en la conversación.
  if (conversation.handoffAt) {
    await markAiReplyAttempt(attempt.id, {
      state: "handoff",
      blockedReason: "human_handoff",
    });
    publishAgentState(organizationId, conversationId);
    return;
  }
  if (!conversation.aiEnabled) {
    await markAiReplyAttempt(attempt.id, {
      state: "disabled",
      blockedReason: "conversation_ai_disabled",
    });
    publishAgentState(organizationId, conversationId);
    return;
  }

  const profileRows = await db
    .select()
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) {
    await markAiReplyAttempt(attempt.id, {
      state: "disabled",
      blockedReason: "business_ai_disabled",
    });
    publishAgentState(organizationId, conversationId);
    return;
  }
  // El toggle global aplica a conversaciones reales; el Laboratorio evalúa el
  // comportamiento configurado aunque el agente aún no esté encendido.
  if (!conversation.isTest && !profile.enabled) {
    await markAiReplyAttempt(attempt.id, {
      state: "disabled",
      blockedReason: "business_ai_disabled",
    });
    publishAgentState(organizationId, conversationId);
    return;
  }

  const readiness = getAiProviderReadiness();
  if (!readiness.configured) {
    await markAiReplyAttempt(attempt.id, {
      state: "blocked",
      blockedReason: "provider_not_configured",
      redactedError: readiness.lastErrorCode,
    });
    publishAgentState(organizationId, conversationId);
    return;
  }

  // Ventana cerrada: el agente JAMÁS envía texto libre → handoff 'ventana'.
  if (!conversation.isTest && !isWindowOpen(conversation.lastInboundAt)) {
    await applyHandoff(conversationId, organizationId, "ventana");
    await markAiReplyAttempt(attempt.id, {
      state: "handoff",
      blockedReason: "outside_window",
    });
    publishAgentState(organizationId, conversationId);
    return;
  }

  // Patrón de respaldo ANTES del LLM (FR-022).
  if (lastInbound.text && matchesHandoffIntent(lastInbound.text)) {
    await applyHandoff(conversationId, organizationId, "cliente");
    await markAiReplyAttempt(attempt.id, {
      state: "handoff",
      blockedReason: "human_handoff",
    });
    publishAgentState(organizationId, conversationId);
    return;
  }

  const kb = await listLiveKbEntries(organizationId);
  const stages = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name })
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildAgentSystemPrompt({ profile, kb, stages }),
    },
    ...history
      .filter((m) => m.text)
      .map((m) => ({
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        content: m.text!,
      })),
  ];

  await markAiReplyAttempt(attempt.id, { state: "generating" });
  const startedAt = Date.now();
  const result = await chatJson(AgentAction, messages);
  if (!result.ok) {
    if (result.error === "not_configured") {
      await markAiReplyAttempt(attempt.id, {
        state: "blocked",
        blockedReason: "provider_not_configured",
        redactedError: result.detail,
      });
      publishAgentState(organizationId, conversationId);
      return;
    }
    // Fallo persistente del proveedor o salida imposible → escalar (FR-022).
    console.error(`[agente] fallo del proveedor (raw): ${result.detail}`);
    await markAiReplyAttempt(attempt.id, {
      state: "failed",
      blockedReason:
        result.error === "invalid_output"
          ? "invalid_model_output"
          : "provider_failed",
      latencyMs: Date.now() - startedAt,
      redactedError: result.detail,
    });
    await applyHandoff(conversationId, organizationId, "error");
    return;
  }

  let action: AgentActionType = result.data;

  if (action.action === "move_stage") {
    const stage = resolveStage(action.stage, stages);
    if (!stage) {
      action = degradeAction(action);
    } else {
      await moveLeadToStage(organizationId, conversation.contactId, stage.id);
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conversationId } },
      });
      if (action.reply) {
        await deliverReplyAndMark(conversation, action.reply, attempt, startedAt);
      }
      return;
    }
  }

  switch (action.action) {
    case "none":
      await markAiReplyAttempt(attempt.id, { state: "blocked" });
      publishAgentState(organizationId, conversationId);
      return;
    case "reply":
      await deliverReplyAndMark(conversation, action.text, attempt, startedAt);
      return;
    case "update_lead": {
      await appendLeadNote(organizationId, conversation.contactId, action.note);
      if (action.reply) {
        await deliverReplyAndMark(conversation, action.reply, attempt, startedAt);
      } else {
        await markAiReplyAttempt(attempt.id, { state: "blocked" });
        publishAgentState(organizationId, conversationId);
      }
      return;
    }
    case "handoff": {
      if (action.farewell) {
        await deliverReplyAndMark(conversation, action.farewell, attempt, startedAt);
      } else {
        await markAiReplyAttempt(attempt.id, {
          state: "handoff",
          blockedReason: "human_handoff",
        });
      }
      await applyHandoff(conversationId, organizationId, "modelo");
      publishAgentState(organizationId, conversationId);
      return;
    }
  }
}

type Conversation = typeof schema.conversation.$inferSelect;

/** Entrega la respuesta: envío real o persistencia sandbox (is_test). */
async function deliverReply(
  conversation: Conversation,
  text: string
): Promise<string | null> {
  if (conversation.isTest) {
    return persistTestOutbound(conversation, text);
  }
  const result = await sendText({
    conversationId: conversation.id,
    organizationId: conversation.organizationId,
    text,
    aiGenerated: true,
  });
  return result.messageId;
}

async function deliverReplyAndMark(
  conversation: Conversation,
  text: string,
  attempt: AiReplyAttempt,
  startedAt: number
): Promise<void> {
  try {
    const messageId = await deliverReply(conversation, text);
    await markAiReplyAttempt(attempt.id, {
      state: "sent",
      providerMessageId: messageId,
      latencyMs: Date.now() - startedAt,
    });
    publishAgentState(conversation.organizationId, conversation.id);
  } catch (err) {
    if (err instanceof SendError && err.code === "window_closed") {
      await applyHandoff(conversation.id, conversation.organizationId, "ventana");
      await markAiReplyAttempt(attempt.id, {
        state: "handoff",
        blockedReason: "outside_window",
        latencyMs: Date.now() - startedAt,
        redactedError: err.message,
      });
      return;
    }
    await markAiReplyAttempt(attempt.id, {
      state: "failed",
      blockedReason: "send_failed",
      latencyMs: Date.now() - startedAt,
      redactedError: err instanceof Error ? err.message : String(err),
    });
    publishAgentState(conversation.organizationId, conversation.id);
    throw err;
  }
}

/** Mensaje saliente del sandbox: se persiste, JAMÁS toca la API (FR-031). */
async function persistTestOutbound(
  conversation: Conversation,
  text: string
): Promise<string> {
  const db = getDb();
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: conversation.organizationId,
      conversationId: conversation.id,
      direction: "out",
      type: "text",
      text,
      status: "sent",
      aiGenerated: true,
    })
    .returning();
  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversation.id));
  return inserted[0]?.id ?? "";
}

export async function applyHandoff(
  conversationId: string,
  organizationId: string,
  reason: "cliente" | "modelo" | "error" | "ventana"
): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(schema.conversation)
    .set({ handoffAt: new Date(), handoffReason: reason, updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversationId))
    .returning();
  if (!updated[0]) return;
  publish(organizationId, {
    type: "conversation.updated",
    data: {
      conversation: { id: conversationId, handoffReason: reason },
    },
  });
}

function publishAgentState(organizationId: string, conversationId: string) {
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversationId } },
  });
}

async function moveLeadToStage(
  organizationId: string,
  contactId: string,
  stageId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.lead)
    .set({ stageId, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(schema.lead.contactId, contactId));
}

async function appendLeadNote(
  organizationId: string,
  contactId: string,
  note: string
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.contact.id, notes: schema.contact.notes })
    .from(schema.contact)
    .where(eq(schema.contact.id, contactId))
    .limit(1);
  const contact = rows[0];
  if (!contact) return;
  const stamped = `[IA] ${note}`;
  await db
    .update(schema.contact)
    .set({
      notes: contact.notes ? `${contact.notes}\n${stamped}` : stamped,
      updatedAt: new Date(),
    })
    .where(eq(schema.contact.id, contact.id));
}
