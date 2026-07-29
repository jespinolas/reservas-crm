import { withAuth } from "@/lib/api";
import { exportKbEntries, listKbEntries } from "@/server/kb/manager";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const entries = await listKbEntries({ organizationId: session.organizationId });
  return Response.json({ export: exportKbEntries(entries) });
});
