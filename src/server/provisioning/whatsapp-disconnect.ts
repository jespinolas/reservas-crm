import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const whatsappDisconnectVersion = "2026-07-29";

const signaturePrefix = "sha256=";

export type DisconnectHeaderBag = {
  get(name: string): string | null;
};

export type WhatsappDisconnectPayload = {
  version: typeof whatsappDisconnectVersion;
  installationId: string;
  customerSlug: string;
  wabaId: string;
  phoneNumberId: string;
  issuedAt: string;
};

export type VerifyWhatsappDisconnectResult =
  | {
      ok: true;
      payload: WhatsappDisconnectPayload;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

const payloadSchema = z.object({
  version: z.string(),
  installationId: z.string().min(1),
  customerSlug: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  issuedAt: z.string().datetime(),
});

export function verifyWhatsappDisconnectRequest(input: {
  method: string;
  path: string;
  rawBody: string;
  headers: DisconnectHeaderBag;
  secret: string;
  now?: Date;
  maxSkewSeconds?: number;
}): VerifyWhatsappDisconnectResult {
  const signature = input.headers.get("x-reservas-signature");
  const timestamp = input.headers.get("x-reservas-timestamp");
  const nonce = input.headers.get("x-reservas-nonce");
  const installationId = input.headers.get("x-reservas-installation-id");

  if (!signature || !timestamp || !nonce || !installationId) {
    return failure(401, "missing_signature", "Disconnect signature headers are required");
  }
  if (!isFreshTimestamp(timestamp, input.now ?? new Date(), input.maxSkewSeconds ?? 300)) {
    return failure(401, "stale_request", "Disconnect request timestamp is stale");
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
    return failure(401, "invalid_signature", "Disconnect request was not authenticated");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody);
  } catch {
    return failure(422, "invalid_body", "Disconnect body must be valid JSON");
  }

  const parsed = payloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return failure(422, "invalid_body", "Disconnect body did not match the expected shape");
  }
  if (parsed.data.version !== whatsappDisconnectVersion) {
    return failure(422, "unsupported_version", "Disconnect payload version is not supported");
  }
  if (parsed.data.installationId !== installationId) {
    return failure(422, "installation_mismatch", "Installation header does not match body");
  }

  return {
    ok: true,
    payload: {
      ...parsed.data,
      version: whatsappDisconnectVersion,
    },
  };
}

function isFreshTimestamp(timestamp: string, now: Date, maxSkewSeconds: number): boolean {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return false;
  return Math.abs(now.getTime() - parsed.getTime()) <= maxSkewSeconds * 1000;
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
  const expected = signWhatsappDisconnectRequest(input);
  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function signWhatsappDisconnectRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  installationId: string;
  rawBody: string;
  secret: string;
}): string {
  const digest = createHmac("sha256", input.secret)
    .update(
      [
        input.method.toUpperCase(),
        input.path,
        input.timestamp,
        input.nonce,
        input.installationId,
        input.rawBody,
      ].join("\n")
    )
    .digest("hex");
  return `${signaturePrefix}${digest}`;
}

function failure(
  status: number,
  code: string,
  message: string
): Extract<VerifyWhatsappDisconnectResult, { ok: false }> {
  return { ok: false, status, code, message };
}
