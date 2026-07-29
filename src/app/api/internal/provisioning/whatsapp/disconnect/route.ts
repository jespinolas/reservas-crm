import { and, eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { verifyWhatsappDisconnectRequest } from "@/server/provisioning/whatsapp-disconnect";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const env = getEnv();
  if (!env.CRM_PROVISIONING_SECRET) {
    return apiError(503, "provisioning_not_configured", "CRM provisioning is not configured");
  }

  const rawBody = await req.text();
  const result = verifyWhatsappDisconnectRequest({
    method: "POST",
    path: new URL(req.url).pathname,
    rawBody,
    headers: req.headers,
    secret: env.CRM_PROVISIONING_SECRET,
  });
  if (!result.ok) {
    return apiError(result.status, result.code, result.message);
  }

  const db = getDb();
  const rows = await db
    .delete(schema.metaCredentials)
    .where(
      and(
        eq(schema.metaCredentials.wabaId, result.payload.wabaId),
        eq(schema.metaCredentials.phoneNumberId, result.payload.phoneNumberId)
      )
    )
    .returning({ id: schema.metaCredentials.id });

  return Response.json({
    ok: true,
    installationId: result.payload.installationId,
    customerSlug: result.payload.customerSlug,
    deletedCredentials: rows.length,
  });
}
