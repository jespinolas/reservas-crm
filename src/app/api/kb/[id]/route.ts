import { eq } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { archiveKbEntry, kbPatchSchema } from "@/server/kb/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, kbPatchSchema);
  if (!body.ok) return body.response;

  const reviewed = body.data.reviewStatus === "reviewed";
  const db = getDb();
  const updated = await db
    .update(schema.kbEntry)
    .set({
      ...body.data,
      lastReviewedAt: reviewed ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.kbEntry.organizationId,
        session.organizationId,
        eq(schema.kbEntry.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Entrada no encontrada");
  return Response.json({ entry: updated[0] });
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const entry = await archiveKbEntry({ organizationId: session.organizationId, id });
  if (!entry) return apiError(404, "not_found", "Entrada no encontrada");
  return Response.json({ archived: true, entry });
});
