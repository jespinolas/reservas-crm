import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { mockGuard } from "@/lib/dev-guard";
import { getEnv, isAiConfigured } from "@/lib/env";
import { newId } from "@/lib/db/ids";
import {
  buildInboundPayload,
  deliverToWebhook,
} from "@/server/dev/wa-mock-inbound";
import { getWaMockState, resetWaMockState } from "@/server/dev/wa-mock-state";
import { saveCredentials } from "@/server/whatsapp/credentials";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  from: z.string().trim().min(5).max(32).optional(),
  timeoutMs: z.number().int().min(500).max(15000).optional(),
});

const fixture = {
  organizationId: "org_ai_reply_smoke",
  wabaId: "waba_ai_reply_smoke",
  phoneNumberId: "phone_ai_reply_smoke",
  customerPhone: "595981000001",
};

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const env = getEnv();
  if (!isAiConfigured() || !env.OPENROUTER_MODEL) {
    return apiError(409, "ai_not_configured", "AI mock/provider is not configured");
  }
  if (!env.OPENROUTER_BASE_URL.includes("/api/dev/ai-mock")) {
    return apiError(409, "ai_mock_required", "OPENROUTER_BASE_URL must point to the dev AI mock");
  }
  if (!env.META_GRAPH_BASE_URL.includes("/api/dev/wa-mock/graph")) {
    return apiError(409, "wa_mock_required", "META_GRAPH_BASE_URL must point to the dev WA mock");
  }

  resetWaMockState();
  await seedFixture();

  const inboundText = body.data.text ?? "Hola, quiero saber sus horarios";
  const from = body.data.from ?? fixture.customerPhone;
  const payload = buildInboundPayload({
    wabaId: fixture.wabaId,
    phoneNumberId: fixture.phoneNumberId,
    from,
    name: "Cliente AI Smoke",
    text: inboundText,
  });

  const webhookResponse = await deliverToWebhook(payload);
  if (!webhookResponse.ok) {
    return apiError(
      502,
      "webhook_error",
      `Webhook returned ${webhookResponse.status}`
    );
  }

  const outbox = await waitForOutbox(body.data.timeoutMs ?? 9000);
  const reply = outbox.find(
    (entry) =>
      entry.phoneNumberId === fixture.phoneNumberId &&
      entry.to === from &&
      entry.type === "text"
  );
  if (!reply) {
    return apiError(504, "ai_reply_not_sent", "AI reply did not reach WA mock outbox");
  }

  const counts = await countMessages();
  return Response.json({
    status: "passed",
    ok: true,
    fixture: {
      organizationId: fixture.organizationId,
      wabaId: fixture.wabaId,
      phoneNumberId: fixture.phoneNumberId,
    },
    inbound: {
      from,
      text: inboundText,
    },
    outbound: {
      to: reply.to,
      type: reply.type,
      body: reply.body,
    },
    counts,
  });
}

async function seedFixture() {
  const db = getDb();
  await db
    .delete(schema.organization)
    .where(eq(schema.organization.id, fixture.organizationId));

  await db.insert(schema.organization).values({
    id: fixture.organizationId,
    name: "AI Reply Smoke",
    slug: "ai-reply-smoke",
  });

  await db.insert(schema.pipelineStage).values([
    {
      id: "stage_ai_reply_smoke_new",
      organizationId: fixture.organizationId,
      name: "Nuevo",
      position: 0,
      kind: "open",
    },
    {
      id: "stage_ai_reply_smoke_interested",
      organizationId: fixture.organizationId,
      name: "Interesado",
      position: 1,
      kind: "open",
    },
  ]);

  await db.insert(schema.agentProfile).values({
    id: newId("agentProfile"),
    organizationId: fixture.organizationId,
    enabled: true,
    name: "Reservas AI Smoke",
    tone: "Breve y claro.",
    instructions:
      "Responde preguntas simples del negocio. No inventes reservas ni precios.",
    escalationRules: "Escala si el cliente pide hablar con una persona.",
    greeting: "Hola, soy Reservas AI Smoke.",
  });

  await db.insert(schema.kbEntry).values({
    id: newId("kbEntry"),
    organizationId: fixture.organizationId,
    kind: "qa",
    question: "¿Cuál es el horario?",
    answer: "Atendemos de lunes a sábado de 8:00 a 19:00.",
  });

  await saveCredentials({
    organizationId: fixture.organizationId,
    wabaId: fixture.wabaId,
    phoneNumberId: fixture.phoneNumberId,
    token: "EAAG-ai-reply-smoke-token",
    displayPhoneNumber: "+595 981 000001",
    verifiedName: "AI Reply Smoke",
  });
}

async function waitForOutbox(timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const outbox = getWaMockState().outbox;
    if (outbox.length > 0) return outbox;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return getWaMockState().outbox;
}

async function countMessages() {
  const db = getDb();
  const conversations = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.organizationId, fixture.organizationId));
  const messages = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.organizationId, fixture.organizationId));
  return {
    conversations: conversations.length,
    messages: messages.length,
    outboundMessages: messages.filter((m) => m.direction === "out").length,
  };
}
