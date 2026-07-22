import { describe, expect, it } from "vitest";
import {
  buildWhatsappProvisioningResponse,
  signWhatsappProvisioningRequest,
  verifyWhatsappProvisioningRequest,
} from "@/server/provisioning/whatsapp";

const now = new Date("2026-07-18T12:00:00.000Z");
const secret = "crm-provisioning-secret-for-tests";
const path = "/api/internal/provisioning/whatsapp";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    version: "2026-07-18",
    installationId: "inst_test",
    customerSlug: "sample-customer",
    wabaId: "waba_test",
    phoneNumberId: "phone_test",
    displayPhoneNumber: "+595 981 000000",
    verifiedName: "Sample Business",
    tokenSecretRef: "secret://platform/meta/installations/inst_test",
    token: "EAAG-smoke-token-abcd",
    callbackUrl: "https://sample-customer.reservas.com.py/api/webhooks/wa/verify-token-ref",
    issuedAt: now.toISOString(),
    ...overrides,
  };
}

function headers(input: {
  rawBody: string;
  timestamp?: string;
  nonce?: string;
  installationId?: string;
  signature?: string;
}) {
  const timestamp = input.timestamp ?? now.toISOString();
  const nonce = input.nonce ?? "nonce_test";
  const installationId = input.installationId ?? "inst_test";
  const signature =
    input.signature ??
    signWhatsappProvisioningRequest({
      method: "POST",
      path,
      timestamp,
      nonce,
      installationId,
      rawBody: input.rawBody,
      secret,
    });
  const values = new Map<string, string>([
    ["x-reservas-installation-id", installationId],
    ["x-reservas-timestamp", timestamp],
    ["x-reservas-nonce", nonce],
    ["x-reservas-signature", signature],
  ]);
  return { get: (name: string) => values.get(name) ?? null };
}

function verify(rawBody = JSON.stringify(payload()), headerBag = headers({ rawBody })) {
  return verifyWhatsappProvisioningRequest({
    method: "POST",
    path,
    rawBody,
    headers: headerBag,
    secret,
    now,
    allowRawTokenForSmoke: true,
  });
}

describe("WhatsApp provisioning auth and payload service", () => {
  it("accepts a correctly signed SPEC-0004 payload", () => {
    const rawBody = JSON.stringify(payload());
    const result = verify(rawBody);

    expect(result).toMatchObject({
      ok: true,
      idempotencyKey: "inst_test:phone_test",
      payload: {
        installationId: "inst_test",
        customerSlug: "sample-customer",
        wabaId: "waba_test",
        phoneNumberId: "phone_test",
      },
    });
  });

  it("rejects missing signature headers", () => {
    const rawBody = JSON.stringify(payload());
    const result = verify(rawBody, { get: () => null });

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "missing_signature",
    });
  });

  it("rejects invalid signatures with timing-safe comparison", () => {
    const rawBody = JSON.stringify(payload());
    const result = verify(
      rawBody,
      headers({
        rawBody,
        signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      })
    );

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "invalid_signature",
    });
  });

  it("rejects stale timestamps", () => {
    const rawBody = JSON.stringify(payload());
    const staleTimestamp = "2026-07-18T11:00:00.000Z";
    const result = verify(rawBody, headers({ rawBody, timestamp: staleTimestamp }));

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      code: "stale_request",
    });
  });

  it("rejects unsupported payload versions", () => {
    const rawBody = JSON.stringify(payload({ version: "2026-01-01" }));
    const result = verify(rawBody);

    expect(result).toMatchObject({
      ok: false,
      status: 422,
      code: "unsupported_version",
    });
  });

  it("rejects installation header and body mismatch", () => {
    const rawBody = JSON.stringify(payload());
    const result = verify(rawBody, headers({ rawBody, installationId: "inst_other" }));

    expect(result).toMatchObject({
      ok: false,
      status: 422,
      code: "customer_mismatch",
    });
  });

  it("requires explicit smoke-mode raw token handling", () => {
    const rawBody = JSON.stringify(payload());
    const result = verifyWhatsappProvisioningRequest({
      method: "POST",
      path,
      rawBody,
      headers: headers({ rawBody }),
      secret,
      now,
      allowRawTokenForSmoke: false,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 422,
      code: "token_unavailable",
    });
  });

  it("resolves production token material from a token secret reference", () => {
    const rawBody = JSON.stringify(
      payload({
        token: undefined,
        tokenSecretRef: "runtime-secret://meta-access-token",
      })
    );
    const result = verifyWhatsappProvisioningRequest({
      method: "POST",
      path,
      rawBody,
      headers: headers({ rawBody }),
      secret,
      now,
      allowRawTokenForSmoke: false,
      resolveTokenSecretRef: (ref) =>
        ref === "runtime-secret://meta-access-token" ? "EAAG-real-token-xyz" : null,
    });

    expect(result).toMatchObject({
      ok: true,
      payload: {
        token: "EAAG-real-token-xyz",
        tokenSecretRef: "runtime-secret://meta-access-token",
      },
    });
  });

  it("builds redacted success evidence without raw token material", () => {
    const rawBody = JSON.stringify(payload());
    const result = verify(rawBody);
    if (!result.ok) throw new Error("expected valid provisioning payload");

    const response = buildWhatsappProvisioningResponse({
      payload: result.payload,
      provisionedAt: now,
    });

    expect(response).toEqual({
      ok: true,
      installationId: "inst_test",
      customerSlug: "sample-customer",
      phoneNumberId: "phone_test",
      wabaId: "waba_test",
      displayPhoneNumber: "+595 981 000000",
      verifiedName: "Sample Business",
      status: "connected",
      tokenLast4: "abcd",
      provisionedAt: now.toISOString(),
    });
    expect(JSON.stringify(response)).not.toContain("EAAG-smoke-token");
  });
});
