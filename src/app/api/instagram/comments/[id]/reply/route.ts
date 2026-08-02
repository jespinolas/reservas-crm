import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { instagramRequest, InstagramApiError } from "@/lib/meta/instagram";
import { getInstagramCredentialsByOrg, markInstagramReconnectRequired } from "@/server/instagram/credentials";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const comment = (
    await getDb()
      .select()
      .from(schema.instagramComment)
      .where(
        and(
          eq(schema.instagramComment.id, id),
          eq(schema.instagramComment.organizationId, session.organizationId)
        )
      )
      .limit(1)
  )[0];
  if (!comment) return apiError(404, "not_found", "Comentario de Instagram no encontrado");

  const credentials = await getInstagramCredentialsByOrg(session.organizationId);
  if (!credentials) return apiError(409, "not_connected", "No hay cuenta de Instagram conectada");
  if (credentials.status !== "connected") {
    return apiError(409, "reconnect_required", "La cuenta de Instagram requiere reconexión");
  }

  try {
    await instagramRequest(`${comment.providerCommentId}/replies`, {
      method: "POST",
      token: credentials.token,
      body: { message: body.data.text },
    });
  } catch (error) {
    if (error instanceof InstagramApiError) {
      if (error.isAuthError) {
        await markInstagramReconnectRequired(credentials.providerAccountId);
        return apiError(409, "reconnect_required", "La cuenta de Instagram requiere reconexión");
      }
      if (error.status === 0 || error.status >= 500) {
        return apiError(503, "instagram_unavailable", "Instagram no está disponible ahora");
      }
      return apiError(422, "instagram_error", "Instagram rechazó la respuesta al comentario");
    }
    throw error;
  }

  await getDb()
    .update(schema.instagramComment)
    .set({ status: "handled", updatedAt: new Date() })
    .where(eq(schema.instagramComment.id, comment.id));

  return Response.json({ ok: true, commentId: comment.id, status: "handled" });
});
