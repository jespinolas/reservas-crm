import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

export type InstagramCredentials = {
  id: string;
  organizationId: string;
  providerAccountId: string;
  displayName: string | null;
  username: string | null;
  status: "connected" | "reconnect_required" | "disconnected" | "error";
  webhookStatus: string;
  token: string;
};

function present(row: typeof schema.channelConnection.$inferSelect): InstagramCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    providerAccountId: row.providerAccountId,
    displayName: row.displayName,
    username: row.username,
    status: row.status,
    webhookStatus: row.webhookStatus,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

export async function getInstagramCredentialsByAccountId(
  providerAccountId: string
): Promise<InstagramCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.channelConnection)
    .where(eq(schema.channelConnection.providerAccountId, providerAccountId))
    .limit(1);
  return rows[0] ? present(rows[0]) : null;
}

export async function getInstagramCredentialsByOrg(
  organizationId: string
): Promise<InstagramCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.channelConnection)
    .where(
      scoped(
        schema.channelConnection.organizationId,
        organizationId,
        eq(schema.channelConnection.channel, "instagram")
      )
    )
    .limit(1);
  return rows[0] ? present(rows[0]) : null;
}

export async function saveInstagramCredentials(input: {
  organizationId: string;
  providerAccountId: string;
  token: string;
  displayName?: string | null;
  username?: string | null;
  webhookStatus?: string;
}): Promise<void> {
  const enc = encryptSecret(input.token);
  await getDb()
    .insert(schema.channelConnection)
    .values({
      id: newId("instagramConnection"),
      organizationId: input.organizationId,
      channel: "instagram",
      providerAccountId: input.providerAccountId,
      displayName: input.displayName ?? null,
      username: input.username ?? null,
      tokenCipher: enc.cipher,
      tokenIv: enc.iv,
      tokenTag: enc.tag,
      status: "connected",
      webhookStatus: input.webhookStatus ?? "pending",
    })
    .onConflictDoUpdate({
      target: [schema.channelConnection.organizationId, schema.channelConnection.channel],
      set: {
        providerAccountId: input.providerAccountId,
        displayName: input.displayName ?? null,
        username: input.username ?? null,
        tokenCipher: enc.cipher,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        status: "connected",
        webhookStatus: input.webhookStatus ?? "pending",
        lastErrorCode: null,
        lastErrorMessageRedacted: null,
        updatedAt: new Date(),
      },
    });
}

export async function markInstagramReconnectRequired(providerAccountId: string) {
  await getDb()
    .update(schema.channelConnection)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.channelConnection.providerAccountId, providerAccountId));
}

export async function markInstagramWebhookActive(providerAccountId: string) {
  await getDb()
    .update(schema.channelConnection)
    .set({ webhookStatus: "active", lastErrorCode: null, updatedAt: new Date() })
    .where(eq(schema.channelConnection.providerAccountId, providerAccountId));
}

export async function disconnectInstagramByOrg(organizationId: string): Promise<number> {
  const result = await getDb()
    .update(schema.channelConnection)
    .set({
      status: "disconnected",
      webhookStatus: "disabled",
      lastErrorCode: null,
      lastErrorMessageRedacted: null,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.channelConnection.organizationId,
        organizationId,
        eq(schema.channelConnection.channel, "instagram")
      )
    )
    .returning({ id: schema.channelConnection.id });
  return result.length;
}
