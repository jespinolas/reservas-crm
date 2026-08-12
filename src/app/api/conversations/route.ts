import { withAuth } from "@/lib/api";
import { listConversations } from "@/server/inbox/queries";
import { getCoreApiMode } from "@/server/core/config";
import { coreClientForSession } from "@/server/core/session";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  if (getCoreApiMode() === "core") {
    const conversations = await (await coreClientForSession(session)).listConversations(since && !Number.isNaN(since.getTime()) ? since : undefined);
    return Response.json({ conversations });
  }
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  return Response.json({ conversations });
});
