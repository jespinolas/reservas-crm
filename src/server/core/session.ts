import { eq } from "drizzle-orm";
import type { SessionContext } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCoreApiUrl } from "./config";
import { CoreApiClient, CoreApiError } from "./client";
import { createCoreBridgeAssertion, exchangeCoreBridgeSession } from "./bridge";

function coreRole(role: string): "OWNER" | "ADMIN" | "MEMBER" {
  const normalized = role.trim().toUpperCase();
  if (normalized === "OWNER" || normalized === "ADMIN") return normalized;
  return "MEMBER";
}

export async function coreClientForSession(session: SessionContext): Promise<CoreApiClient> {
  const organization = await getDb()
    .select({ slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.organizationId))
    .limit(1);
  const organizationSlug = organization[0]?.slug?.trim();
  if (!organizationSlug) throw new CoreApiError(500, "CRM organization has no Core slug");
  const secret = process.env.CRM_CORE_BRIDGE_SECRET ?? "";
  const assertion = createCoreBridgeAssertion(session.email, organizationSlug, coreRole(session.role));
  const coreSession = await exchangeCoreBridgeSession(assertion, secret, { baseUrl: getCoreApiUrl() });
  return new CoreApiClient(coreSession.accessToken, getCoreApiUrl());
}
