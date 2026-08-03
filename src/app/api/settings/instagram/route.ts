import { withAuth } from "@/lib/api";
import {
  buildInstagramChecklist,
  buildInstagramReadiness,
} from "@/lib/instagram-readiness";
import { getEnv } from "@/lib/env";
import { getInstagramCredentialsByOrg } from "@/server/instagram/credentials";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const env = getEnv();
  const credentials = await getInstagramCredentialsByOrg(session.organizationId);
  const serverFacts = {
    webhookConfigured: Boolean(env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN),
    signatureConfigured: Boolean(env.INSTAGRAM_APP_SECRET ?? env.META_APP_SECRET),
  };
  if (!credentials || credentials.status === "disconnected") {
    return Response.json({
      connected: false,
      channel: "instagram",
      account: null,
      readiness: buildInstagramReadiness(null),
      checklist: buildInstagramChecklist({ account: null, ...serverFacts }),
    });
  }
  const account = {
    id: credentials.providerAccountId,
    username: credentials.username,
    displayName: credentials.displayName,
    status: credentials.status,
    webhookStatus: credentials.webhookStatus,
  };
  return Response.json({
    connected: credentials.status === "connected",
    channel: "instagram",
    account,
    readiness: buildInstagramReadiness(account),
    checklist: buildInstagramChecklist({ account, ...serverFacts }),
  });
});
