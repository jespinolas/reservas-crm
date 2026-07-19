import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const whatsappProvisioningVersion = "2026-07-18";

const signaturePrefix = "sha256=";

export type ProvisioningHeaderBag = {
  get(name: string): string | null;
};

export type ProvisioningErrorCode =
  | "missing_signature"
  | "invalid_signature"
  | "stale_request"
  | "invalid_body"
  | "unsupported_version"
  | "customer_mismatch"
  | "token_unavailable";

export type WhatsappProvisioningPayload = {
  version: typeof whatsappProvisioningVersion;
  installationId: string;
  customerSlug: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  tokenSecretRef: string;
  token: string;
  callbackUrl: string;
  issuedAt: string;
};

export type WhatsappProvisioningResponse = {
  ok: true;
  installationId: string;
  customerSlug: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected";
  tokenLast4: string;
  provisionedAt: string;
};

export type VerifyWhatsappProvisioningResult =
  | {
      ok: true;
      payload: WhatsappProvisioningPayload;
      idempotencyKey: string;
    }
  | {
      ok: false;
      status: number;
      code: ProvisioningErrorCode;
      message: string;
    };

const payloadSchema = z.object({
  version: z.string(),
  installationId: z.string().min(1),
  customerSlug: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  displayPhoneNumber: z.string().min(1).nullable().optional(),
  verifiedName: z.string().min(1).nullable().optional(),
  tokenSecretRef: z.string().min(1),
  token: z.string().min(1).optional(),
  callbackUrl: z.string().url(),
  issuedAt: z.string().datetime(),
});

export function verifyWhatsappProvisioningRequest(input: {
  method: string;
  path: string;
  rawBody: string;
  headers: ProvisioningHeaderBag;
  secret: string;
  now?: Date;
  maxSkewSeconds?: number;
  allowRawTokenForSmoke?: boolean;
  resolveTokenSecretRef?: (tokenSecretRef: string) => string | null;
}): VerifyWhatsappProvisioningResult {
  const signature = input.headers.get("x-reservas-signature");
  const timestamp = input.headers.get("x-reservas-timestamp");
  const nonce = input.headers.get("x-reservas-nonce");
  const installationId = input.headers.get("x-reservas-installation-id");

  if (!signature || !timestamp || !nonce || !installationId) {
    return failure(401, "missing_signature", "Provisioning signature headers are required");
  }
  if (!isFreshTimestamp(timestamp, input.now ?? new Date(), input.maxSkewSeconds ?? 300)) {
    return failure(401, "stale_request", "Provisioning request timestamp is stale");
  }
  if (
    !isValidSignature({
      method: input.method,
      path: input.path,
      timestamp,
      nonce,
      installationId,
      rawBody: input.rawBody,
      secret: input.secret,
      signature,
    })
  ) {
    return failure(401, "invalid_signature", "Provisioning request was not authenticated");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody);
  } catch {
    return failure(422, "invalid_body", "Provisioning body must be valid JSON");
  }

  const parsed = payloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return failure(422, "invalid_body", "Provisioning body did not match the expected shape");
  }
  if (parsed.data.version !== whatsappProvisioningVersion) {
    return failure(422, "unsupported_version", "Provisioning payload version is not supported");
  }
  if (parsed.data.installationId !== installationId) {
    return failure(422, "customer_mismatch", "Installation header does not match body");
  }
  let token = parsed.data.token ?? null;
  if (token && !input.allowRawTokenForSmoke) {
    return failure(422, "token_unavailable", "Provisioning token material is unavailable");
  }
  if (!token && input.resolveTokenSecretRef) {
    token = input.resolveTokenSecretRef(parsed.data.tokenSecretRef);
  }
  if (!token) {
    return failure(422, "token_unavailable", "Provisioning token material is unavailable");
  }

  return {
    ok: true,
    idempotencyKey: `${parsed.data.installationId}:${parsed.data.phoneNumberId}`,
    payload: {
      ...parsed.data,
      version: whatsappProvisioningVersion,
      displayPhoneNumber: parsed.data.displayPhoneNumber ?? null,
      verifiedName: parsed.data.verifiedName ?? null,
      token,
    },
  };
}

export function buildWhatsappProvisioningResponse(input: {
  payload: WhatsappProvisioningPayload;
  provisionedAt?: Date;
}): WhatsappProvisioningResponse {
  return {
    ok: true,
    installationId: input.payload.installationId,
    customerSlug: input.payload.customerSlug,
    phoneNumberId: input.payload.phoneNumberId,
    wabaId: input.payload.wabaId,
    displayPhoneNumber: input.payload.displayPhoneNumber,
    verifiedName: input.payload.verifiedName,
    status: "connected",
    tokenLast4: input.payload.token.slice(-4),
    provisionedAt: (input.provisionedAt ?? new Date()).toISOString(),
  };
}

export function signWhatsappProvisioningRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  installationId: string;
  rawBody: string;
  secret: string;
}): string {
  const digest = createHmac("sha256", input.secret)
    .update(canonicalProvisioningString(input))
    .digest("hex");
  return `${signaturePrefix}${digest}`;
}

function canonicalProvisioningString(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  installationId: string;
  rawBody: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    input.installationId,
    input.rawBody,
  ].join("\n");
}

function isValidSignature(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  installationId: string;
  rawBody: string;
  secret: string;
  signature: string;
}): boolean {
  if (!input.signature.startsWith(signaturePrefix)) return false;
  const expected = signWhatsappProvisioningRequest(input);
  return timingSafeStringEqual(input.signature, expected);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function isFreshTimestamp(timestamp: string, now: Date, maxSkewSeconds: number): boolean {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return false;
  const skewMs = Math.abs(now.getTime() - parsed.getTime());
  return skewMs <= maxSkewSeconds * 1000;
}

function failure(
  status: number,
  code: ProvisioningErrorCode,
  message: string
): Extract<VerifyWhatsappProvisioningResult, { ok: false }> {
  return { ok: false, status, code, message };
}
