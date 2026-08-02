import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { getEnv, isMockEnabled } from "@/lib/env";
import { saveInstagramCredentials } from "@/server/instagram/credentials";
import { verifyInstagramProvisioningRequest } from "@/server/provisioning/instagram";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const env = getEnv();
  if (!env.CRM_PROVISIONING_SECRET) {
    return apiError(503, "provisioning_not_configured", "CRM provisioning is not configured");
  }

  const rawBody = await req.text();
  const result = verifyInstagramProvisioningRequest({
    method: "POST",
    path: new URL(req.url).pathname,
    rawBody,
    headers: req.headers,
    secret: env.CRM_PROVISIONING_SECRET,
    allowRawToken: isMockEnabled() || env.CRM_PROVISIONING_ACCEPT_RAW_TOKEN_SMOKE_ONLY === "true",
    resolveTokenSecretRef: (ref) => resolveSecret(ref, env.CRM_PROVISIONING_TOKEN_SECRET_DIR),
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);

  const organization = await resolveSingleOrganization(result.payload.customerSlug);
  if (!organization.ok) return apiError(organization.status, organization.code, organization.message);

  const existing = await getDb()
    .select({ id: schema.channelConnection.id, accountId: schema.channelConnection.providerAccountId })
    .from(schema.channelConnection)
    .where(eq(schema.channelConnection.organizationId, organization.organizationId))
    .limit(1);
  if (existing[0] && existing[0].accountId !== result.payload.accountId) {
    return apiError(409, "already_provisioned_different_account", "CRM is already provisioned for a different Instagram account");
  }

  await saveInstagramCredentials({
    organizationId: organization.organizationId,
    providerAccountId: result.payload.accountId,
    token: result.payload.token,
    username: result.payload.username,
    displayName: result.payload.displayName,
    webhookStatus: "pending",
  });

  return Response.json({
    ok: true,
    installationId: result.payload.installationId,
    customerSlug: result.payload.customerSlug,
    accountId: result.payload.accountId,
    username: result.payload.username,
    displayName: result.payload.displayName,
    status: "connected",
    tokenLast4: result.payload.token.slice(-4),
  });
}

function resolveSecret(ref: string, dir?: string): string | null {
  const prefix = "runtime-secret://";
  if (!dir || !ref.startsWith(prefix)) return null;
  const name = ref.slice(prefix.length);
  if (!/^[A-Za-z0-9._-]+$/.test(name) || basename(name) !== name) return null;
  try {
    const value = readFileSync(join(dir, name), "utf8").trim();
    return value || null;
  } catch {
    return null;
  }
}

async function resolveSingleOrganization(customerSlug: string) {
  const rows = await getDb()
    .select({ id: schema.organization.id, slug: schema.organization.slug })
    .from(schema.organization)
    .limit(2);
  if (rows.length === 0) return { ok: false as const, status: 409, code: "organization_missing", message: "CRM organization has not been initialized" };
  if (rows.length > 1) return { ok: false as const, status: 409, code: "organization_ambiguous", message: "CRM has more than one organization" };
  const organization = rows[0]!;
  if (organization.slug && organization.slug !== "principal" && organization.slug !== customerSlug) {
    return { ok: false as const, status: 422, code: "customer_mismatch", message: "CRM organization does not match provisioning customer" };
  }
  await getDb().update(schema.organization).set({ slug: customerSlug }).where(eq(schema.organization.id, organization.id));
  return { ok: true as const, organizationId: organization.id };
}
