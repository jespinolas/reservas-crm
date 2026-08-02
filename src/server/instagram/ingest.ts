import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { getInstagramCredentialsByAccountId } from "@/server/instagram/credentials";
import { maybeRunAgentTurn } from "@/server/ai/trigger";

export type InstagramWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: unknown }>;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        attachments?: Array<{ type?: string; payload?: { url?: string } }>;
      };
    }>;
  }>;
};

type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
};

type CommentValue = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string; name?: string };
  media?: { id?: string; permalink?: string };
  timestamp?: string | number;
  permalink?: string;
};

export async function processInstagramWebhook(
  payload: InstagramWebhookPayload
): Promise<void> {
  for (const entry of payload.entry ?? []) {
    const accountId = entry.id;
    if (!accountId) continue;
    const credentials = await getInstagramCredentialsByAccountId(accountId);
    if (!credentials) {
      console.warn("[instagram] event for unknown account ignored");
      continue;
    }

    for (const change of entry.changes ?? []) {
      if (change.field === "comments") {
        await ingestComment(credentials.organizationId, credentials.id, change.value);
      }
    }

    for (const event of entry.messaging ?? []) {
      await ingestDirectMessage(credentials, event);
    }
  }
}

async function ingestComment(
  organizationId: string,
  channelConnectionId: string,
  raw: unknown
): Promise<void> {
  const value = (raw ?? {}) as CommentValue;
  const providerCommentId = value.id?.trim();
  if (!providerCommentId) return;

  const db = getDb();
  const existing = await db
    .select({ id: schema.instagramComment.id })
    .from(schema.instagramComment)
    .where(eq(schema.instagramComment.providerCommentId, providerCommentId))
    .limit(1);
  if (existing[0]) return;

  const contactId = value.from?.id
    ? await getOrCreateInstagramContact({
        organizationId,
        providerUserId: value.from.id,
        username: value.from.username ?? null,
        displayName: value.from.name ?? value.from.username ?? null,
      })
    : null;

  const inserted = await db
    .insert(schema.instagramComment)
    .values({
      id: newId("instagramComment"),
      organizationId,
      channelConnectionId,
      contactId: contactId?.id ?? null,
      providerCommentId,
      providerMediaId: value.media?.id ?? null,
      providerUserId: value.from?.id ?? null,
      providerUsername: value.from?.username ?? null,
      text: value.text ?? null,
      permalink: value.permalink ?? value.media?.permalink ?? null,
      status: "new",
    })
    .onConflictDoNothing({ target: [schema.instagramComment.providerCommentId] })
    .returning();

  if (inserted[0]) {
    publish(organizationId, {
      type: "conversation.updated",
      data: { instagramCommentId: inserted[0].id },
    });
  }
}

async function ingestDirectMessage(
  credentials: {
    id: string;
    organizationId: string;
    providerAccountId: string;
  },
  event: InstagramMessagingEvent
): Promise<void> {
  const senderId = event.sender?.id;
  const providerMessageId = event.message?.mid;
  if (!senderId || !providerMessageId) return;

  const db = getDb();
  const contact = await getOrCreateInstagramContact({
    organizationId: credentials.organizationId,
    providerUserId: senderId,
    username: null,
    displayName: senderId,
  });

  const conversationRows = await db
    .insert(schema.conversation)
    .values({
      id: newId("conversation"),
      organizationId: credentials.organizationId,
      contactId: contact.id,
      channel: "instagram",
      channelConnectionId: credentials.id,
      providerConversationId: senderId,
    })
    .onConflictDoNothing()
    .returning();
  const conversation =
    conversationRows[0] ??
    (
      await db
        .select()
        .from(schema.conversation)
        .where(
          and(
            eq(schema.conversation.organizationId, credentials.organizationId),
            eq(schema.conversation.contactId, contact.id),
            eq(schema.conversation.channel, "instagram")
          )
        )
        .limit(1)
    )[0];
  if (!conversation) return;

  const providerTimestamp = event.timestamp ? new Date(event.timestamp) : new Date();
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: credentials.organizationId,
      conversationId: conversation.id,
      providerMessageId,
      channel: "instagram",
      direction: "in",
      type: event.message?.attachments?.[0]?.type ?? "text",
      text: event.message?.text ?? null,
      status: "delivered",
      providerTimestamp,
      waTimestamp: providerTimestamp,
    })
    .onConflictDoNothing()
    .returning();
  const message = inserted[0];
  if (!message) return;

  await db
    .update(schema.conversation)
    .set({
      lastInboundAt: providerTimestamp,
      serviceWindowExpiresAt: new Date(providerTimestamp.getTime() + 24 * 60 * 60 * 1000),
      lastMessageAt: providerTimestamp,
      unreadCount: sql`${schema.conversation.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.conversation.id, conversation.id));

  publish(credentials.organizationId, {
    type: "message.new",
    data: {
      conversationId: conversation.id,
      message: {
        id: message.id,
        conversationId: conversation.id,
        direction: message.direction,
        type: message.type,
        text: message.text,
        status: message.status,
        channel: "instagram",
        aiGenerated: false,
        createdAt: providerTimestamp.toISOString(),
      },
    },
  });
  publish(credentials.organizationId, {
    type: "conversation.updated",
      data: { conversation: { id: conversation.id, channel: "instagram" } },
  });

  await maybeRunAgentTurn(conversation.id);
}

async function getOrCreateInstagramContact(input: {
  organizationId: string;
  providerUserId: string;
  username: string | null;
  displayName: string | null;
}) {
  const db = getDb();
  const placeholderPhone = `instagram:${input.providerUserId}`;
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: input.organizationId,
      phone: placeholderPhone,
      name: input.displayName?.trim() || input.username?.trim() || "Instagram user",
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.phone],
    })
    .returning();
  const contact =
    inserted[0] ??
    (
      await db
        .select()
        .from(schema.contact)
        .where(
          and(
            eq(schema.contact.organizationId, input.organizationId),
            eq(schema.contact.phone, placeholderPhone)
          )
        )
        .limit(1)
    )[0];
  if (!contact) throw new Error("Instagram contact could not be resolved");

  await db
    .insert(schema.contactIdentity)
    .values({
      id: newId("contactIdentity"),
      organizationId: input.organizationId,
      contactId: contact.id,
      channel: "instagram",
      providerUserId: input.providerUserId,
      providerUsername: input.username,
      displayName: input.displayName,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.contactIdentity.organizationId,
        schema.contactIdentity.channel,
        schema.contactIdentity.providerUserId,
      ],
      set: {
        contactId: contact.id,
        providerUsername: input.username,
        displayName: input.displayName,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    });
  return contact;
}
