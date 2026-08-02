import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const instagramProvisioningVersion = "2026-08-02";
export type InstagramProvisioningPayload = {
  version: typeof instagramProvisioningVersion;
  installationId: string;
  customerSlug: string;
  accountId: string;
  username: string | null;
  displayName: string | null;
  tokenSecretRef: string;
  token: string;
  callbackUrl: string;
  issuedAt: string;
};

const schema = z.object({
  version: z.string(),
  installationId: z.string().min(1),
  customerSlug: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  accountId: z.string().min(1),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  tokenSecretRef: z.string().min(1),
  token: z.string().min(1).optional(),
  callbackUrl: z.string().url(),
  issuedAt: z.string().datetime(),
});

export function signInstagramProvisioningRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  installationId: string;
  rawBody: string;
  secret: string;
}): string {
  return `sha256=${createHmac("sha256", input.secret)
    .update([
      input.method.toUpperCase(),
      input.path,
      input.timestamp,
      input.nonce,
      input.installationId,
      input.rawBody,
    ].join("\n"))
    .digest("hex")}`;
}

export function verifyInstagramProvisioningRequest(input: {
  method: string;
  path: string;
  rawBody: string;
  headers: Headers;
  secret: string;
  allowRawToken: boolean;
  resolveTokenSecretRef?: (ref: string) => string | null;
}) {
  const signature = input.headers.get("x-reservas-signature");
  const timestamp = input.headers.get("x-reservas-timestamp");
  const nonce = input.headers.get("x-reservas-nonce");
  const installationId = input.headers.get("x-reservas-installation-id");
  if (!signature || !timestamp || !nonce || !installationId) {
    return { ok: false as const, status: 401, code: "missing_signature", message: "Provisioning signature headers are required" };
  }
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 300_000) {
    return { ok: false as const, status: 401, code: "stale_request", message: "Provisioning request timestamp is stale" };
  }
  const expected = signInstagramProvisioningRequest({
    method: input.method,
    path: input.path,
    timestamp,
    nonce,
    installationId,
    rawBody: input.rawBody,
    secret: input.secret,
  });
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return { ok: false as const, status: 401, code: "invalid_signature", message: "Provisioning request was not authenticated" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(input.rawBody);
  } catch {
    return { ok: false as const, status: 422, code: "invalid_body", message: "Provisioning body must be valid JSON" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, status: 422, code: "invalid_body", message: "Provisioning body did not match the expected shape" };
  }
  if (parsed.data.version !== instagramProvisioningVersion) {
    return { ok: false as const, status: 422, code: "unsupported_version", message: "Provisioning payload version is not supported" };
  }
  if (parsed.data.installationId !== installationId) {
    return { ok: false as const, status: 422, code: "customer_mismatch", message: "Installation header does not match body" };
  }

  const token = parsed.data.token ?? input.resolveTokenSecretRef?.(parsed.data.tokenSecretRef) ?? null;
  if (!token || (!input.allowRawToken && parsed.data.token)) {
    return { ok: false as const, status: 422, code: "token_unavailable", message: "Provisioning token material is unavailable" };
  }

  return {
    ok: true as const,
    payload: {
      ...parsed.data,
      version: instagramProvisioningVersion,
      username: parsed.data.username ?? null,
      displayName: parsed.data.displayName ?? null,
      token,
    },
  };
}
