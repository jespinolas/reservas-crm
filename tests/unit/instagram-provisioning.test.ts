import { describe, expect, it } from "vitest";
import {
  instagramProvisioningVersion,
  signInstagramProvisioningRequest,
  verifyInstagramProvisioningRequest,
} from "@/server/provisioning/instagram";

describe("Instagram provisioning contract", () => {
  const requestTimestamp = new Date().toISOString();
  const body = JSON.stringify({
    version: instagramProvisioningVersion,
    installationId: "inst_test",
    customerSlug: "test-business",
    accountId: "ig_test",
    username: "test_business",
    displayName: "Test Business",
    tokenSecretRef: "runtime-secret://instagram-test.token",
    token: "synthetic-token",
    callbackUrl: "https://test.example/api/webhooks/instagram",
    issuedAt: "2026-08-02T12:00:00.000Z",
  });
  const headers = {
    "x-reservas-timestamp": requestTimestamp,
    "x-reservas-nonce": "nonce_test",
    "x-reservas-installation-id": "inst_test",
  };

  it("accepts a correctly signed smoke payload", () => {
    const signature = signInstagramProvisioningRequest({
      method: "POST",
      path: "/api/internal/provisioning/instagram",
      timestamp: headers["x-reservas-timestamp"],
      nonce: headers["x-reservas-nonce"],
      installationId: headers["x-reservas-installation-id"],
      rawBody: body,
      secret: "test-provisioning-secret",
    });
    const result = verifyInstagramProvisioningRequest({
      method: "POST",
      path: "/api/internal/provisioning/instagram",
      rawBody: body,
      headers: new Headers({ ...headers, "x-reservas-signature": signature }),
      secret: "test-provisioning-secret",
      allowRawToken: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing signature", () => {
    const result = verifyInstagramProvisioningRequest({
      method: "POST",
      path: "/api/internal/provisioning/instagram",
      rawBody: body,
      headers: new Headers(headers),
      secret: "test-provisioning-secret",
      allowRawToken: true,
    });
    expect(result).toMatchObject({ ok: false, code: "missing_signature" });
  });
});
