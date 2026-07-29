import { withAuth } from "@/lib/api";
import { createSetupStatusService } from "@/server/setup/status";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const status = await createSetupStatusService().getStatus(session.organizationId);
  return Response.json(status);
});
