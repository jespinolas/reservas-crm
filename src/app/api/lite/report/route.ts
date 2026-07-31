import { withAuth } from "@/lib/api";
import { LiteOperatorService } from "@/server/lite/operator";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const report = await new LiteOperatorService().buildLostMoneyReport({
    organizationId: session.organizationId,
  });
  return Response.json({ report });
});
