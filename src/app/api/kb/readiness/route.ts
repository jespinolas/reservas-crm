import { withAuth } from "@/lib/api";
import { getKbReadiness } from "@/server/kb/manager";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const readiness = await getKbReadiness(session.organizationId);
  return Response.json({ readiness });
});
