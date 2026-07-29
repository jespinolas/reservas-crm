import { apiError, withAuth } from "@/lib/api";
import { getAiReplyTrace } from "@/server/ai/trace";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const since = parseDateParam(url.searchParams.get("since"));
  const until = parseDateParam(url.searchParams.get("until"));
  const trace = await getAiReplyTrace({
    organizationId: session.organizationId,
    conversationId: id,
    since,
    until,
  });
  if (!trace) return apiError(404, "not_found", "Conversación no encontrada");
  return Response.json({ trace });
});

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
