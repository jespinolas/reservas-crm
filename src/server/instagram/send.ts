import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { instagramRequest, InstagramApiError } from "@/lib/meta/instagram";
import { getInstagramCredentialsByOrg, markInstagramReconnectRequired } from "@/server/instagram/credentials";
import { isWindowOpen } from "@/server/inbox/window";
import { serializeMessage } from "@/server/inbox/ingest";
import { SendError } from "@/server/inbox/send-error";

export async function sendInstagramText(input: {
  conversationId: string;
  organizationId: string;
  text: string;
  aiGenerated?: boolean;
}): Promise<{ messageId: string }> {
  const db = getDb();
  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .where(
      and(
        eq(schema.conversation.id, input.conversationId),
        eq(schema.conversation.organizationId, input.organizationId),
        eq(schema.conversation.channel, "instagram")
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new SendError("meta_error", "Conversación de Instagram no encontrada");
  if (!isWindowOpen(row.conversation.lastInboundAt)) {
    throw new SendError("window_closed", "La ventana de respuesta de Instagram está cerrada");
  }

  const identity = await db
    .select({ providerUserId: schema.contactIdentity.providerUserId })
    .from(schema.contactIdentity)
    .where(
      and(
        eq(schema.contactIdentity.organizationId, input.organizationId),
        eq(schema.contactIdentity.contactId, row.contact.id),
        eq(schema.contactIdentity.channel, "instagram")
      )
    )
    .limit(1);
  const recipientId = identity[0]?.providerUserId;
  if (!recipientId) throw new SendError("meta_error", "La identidad de Instagram no está vinculada");

  const credentials = await getInstagramCredentialsByOrg(input.organizationId);
  if (!credentials) throw new SendError("not_connected", "No hay cuenta de Instagram conectada");
  if (credentials.status !== "connected") {
    throw new SendError("reconnect_required", "La cuenta de Instagram requiere reconexión");
  }

  let providerMessageId: string;
  try {
    const result = await instagramRequest<{ message_id?: string; messages?: { id?: string }[] }>(
      "me/messages",
      {
        method: "POST",
        token: credentials.token,
        body: { recipient: { id: recipientId }, message: { text: input.text } },
      }
    );
    providerMessageId = result.message_id ?? result.messages?.[0]?.id ?? "";
    if (!providerMessageId) throw new SendError("meta_error", "Instagram no devolvió ID de mensaje");
  } catch (error) {
    if (error instanceof InstagramApiError) {
      if (error.isAuthError) {
        await markInstagramReconnectRequired(credentials.providerAccountId);
        throw new SendError("reconnect_required", "La cuenta de Instagram requiere reconexión");
      }
      if (error.status === 0 || error.status >= 500) {
        throw new SendError("meta_unavailable", "Instagram no está disponible ahora");
      }
      throw new SendError("meta_error", error.message);
    }
    throw error;
  }

  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      providerMessageId,
      channel: "instagram",
      direction: "out",
      type: "text",
      text: input.text,
      status: "pending",
      aiGenerated: input.aiGenerated ?? false,
      providerTimestamp: new Date(),
    })
    .returning();
  const message = inserted[0];
  if (!message) throw new SendError("meta_error", "No se pudo guardar el mensaje de Instagram");

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  publish(input.organizationId, {
    type: "message.new",
    data: { conversationId: input.conversationId, message: serializeMessage(message) },
  });
  return { messageId: message.id };
}
