import { apiError, withAuth } from "@/lib/api";
import { reviewKbEntry } from "@/server/kb/manager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const entry = await reviewKbEntry({ organizationId: session.organizationId, id });
  if (!entry) return apiError(404, "not_found", "Entrada no encontrada");
  return Response.json({ entry });
});
