import { withAuth } from "@/lib/api";
import { getInstagramCredentialsByOrg } from "@/server/instagram/credentials";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const credentials = await getInstagramCredentialsByOrg(session.organizationId);
  if (!credentials) {
    return Response.json({
      connected: false,
      channel: "instagram",
      account: null,
    });
  }
  return Response.json({
    connected: credentials.status === "connected",
    channel: "instagram",
    account: {
      id: credentials.providerAccountId,
      username: credentials.username,
      displayName: credentials.displayName,
      status: credentials.status,
      webhookStatus: credentials.webhookStatus,
    },
  });
});
