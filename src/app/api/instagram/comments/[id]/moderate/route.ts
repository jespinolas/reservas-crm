import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { instagramRequest, InstagramApiError } from "@/lib/meta/instagram";
import { getInstagramCredentialsByOrg, markInstagramReconnectRequired } from "@/server/instagram/credentials";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const bodySchema = z.object({ action: z.enum(["handled", "delete"]) });

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const comment = (
    await getDb()
      .select()
      .from(schema.instagramComment)
      .where(and(eq(schema.instagramComment.id, id), eq(schema.instagramComment.organizationId, session.organizationId)))
      .limit(1)
  )[0];
  if (!comment) return apiError(404, "not_found", "Comentario de Instagram no encontrado");

  if (body.data.action === "handled") {
    await getDb().update(schema.instagramComment).set({ status: "handled", updatedAt: new Date() }).where(eq(schema.instagramComment.id, id));
    return Response.json({ ok: true, commentId: id, status: "handled" });
  }

  const credentials = await getInstagramCredentialsByOrg(session.organizationId);
  if (!credentials) return apiError(409, "not_connected", "No hay cuenta de Instagram conectada");
  try {
    await instagramRequest(comment.providerCommentId, { method: "DELETE", token: credentials.token });
  } catch (error) {
    if (error instanceof InstagramApiError) {
      if (error.isAuthError) {
        await markInstagramReconnectRequired(credentials.providerAccountId);
        return apiError(409, "reconnect_required", "La cuenta de Instagram requiere reconexión");
      }
      if (error.status === 0 || error.status >= 500) {
        return apiError(503, "instagram_unavailable", "Instagram no está disponible ahora");
      }
      return apiError(422, "instagram_error", "Instagram rechazó la moderación del comentario");
    }
    throw error;
  }

  await getDb().update(schema.instagramComment).set({ status: "deleted", updatedAt: new Date() }).where(eq(schema.instagramComment.id, id));
  return Response.json({ ok: true, commentId: id, status: "deleted" });
});
