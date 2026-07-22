import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { getEnv, isMockEnabled } from "@/lib/env";
import {
  buildWhatsappProvisioningResponse,
  verifyWhatsappProvisioningRequest,
} from "@/server/provisioning/whatsapp";
import {
  getCredentialsByOrg,
  saveCredentials,
} from "@/server/whatsapp/credentials";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const env = getEnv();
  if (!env.CRM_PROVISIONING_SECRET) {
    return apiError(503, "provisioning_not_configured", "CRM provisioning is not configured");
  }

  const rawBody = await req.text();
  const result = verifyWhatsappProvisioningRequest({
    method: "POST",
    path: new URL(req.url).pathname,
    rawBody,
    headers: req.headers,
    secret: env.CRM_PROVISIONING_SECRET,
    allowRawTokenForSmoke:
      isMockEnabled() || env.CRM_PROVISIONING_ACCEPT_RAW_TOKEN_SMOKE_ONLY === "true",
    resolveTokenSecretRef: (tokenSecretRef) =>
      resolveRuntimeTokenSecret(tokenSecretRef, env.CRM_PROVISIONING_TOKEN_SECRET_DIR),
  });
  if (!result.ok) {
    return apiError(result.status, result.code, result.message);
  }

  const organization = await resolveSingleOrganization(result.payload.customerSlug);
  if (!organization.ok) {
    return apiError(organization.status, organization.code, organization.message);
  }

  const existing = await getCredentialsByOrg(organization.organizationId);
  if (existing && existing.phoneNumberId !== result.payload.phoneNumberId) {
    return apiError(
      409,
      "already_provisioned_different_phone",
      "CRM is already provisioned for a different Phone Number ID"
    );
  }

  await saveCredentials({
    organizationId: organization.organizationId,
    wabaId: result.payload.wabaId,
    phoneNumberId: result.payload.phoneNumberId,
    token: result.payload.token,
    displayPhoneNumber: result.payload.displayPhoneNumber,
    verifiedName: result.payload.verifiedName,
  });

  return Response.json(
    buildWhatsappProvisioningResponse({
      payload: result.payload,
    })
  );
}

function resolveRuntimeTokenSecret(
  tokenSecretRef: string,
  secretDir: string | undefined
): string | null {
  const prefix = "runtime-secret://";
  if (!secretDir || !tokenSecretRef.startsWith(prefix)) return null;

  const name = tokenSecretRef.slice(prefix.length);
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (basename(name) !== name) return null;

  try {
    const value = readFileSync(join(secretDir, name), "utf8").trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function resolveSingleOrganization(customerSlug: string): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; status: number; code: string; message: string }
> {
  const rows = await getDb()
    .select({
      id: schema.organization.id,
      slug: schema.organization.slug,
    })
    .from(schema.organization)
    .limit(2);

  if (rows.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "organization_missing",
      message: "CRM organization has not been initialized",
    };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      status: 409,
      code: "organization_ambiguous",
      message: "CRM has more than one organization",
    };
  }

  const organization = rows[0]!;
  if (organization.slug && organization.slug !== "principal" && organization.slug !== customerSlug) {
    return {
      ok: false,
      status: 422,
      code: "customer_mismatch",
      message: "CRM organization does not match provisioning customer",
    };
  }

  await getDb()
    .update(schema.organization)
    .set({ slug: customerSlug })
    .where(eq(schema.organization.id, organization.id));

  return { ok: true, organizationId: organization.id };
}
