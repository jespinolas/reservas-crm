import { createHmac, randomUUID } from "node:crypto";
import { getCoreApiUrl } from "./config";
import { CoreApiError, type CoreSessionResponse } from "./client";

export type CoreBridgeRole = "OWNER" | "ADMIN" | "MEMBER";

export type CoreBridgeAssertion = {
  email: string;
  organizationSlug: string;
  role: CoreBridgeRole;
  issuedAt: string;
  nonce: string;
};

export function createCoreBridgeAssertion(
  email: string,
  organizationSlug: string,
  role: CoreBridgeRole,
  now = new Date(),
  nonce = randomUUID(),
): CoreBridgeAssertion {
  return { email: email.trim().toLowerCase(), organizationSlug: organizationSlug.trim().toLowerCase(), role, issuedAt: now.toISOString(), nonce };
}

export function canonicalCoreBridgeAssertion(assertion: CoreBridgeAssertion): string {
  return [assertion.email.trim().toLowerCase(), assertion.organizationSlug.trim().toLowerCase(), assertion.role, assertion.issuedAt, assertion.nonce].join("\n");
}

export function signCoreBridgeAssertion(assertion: CoreBridgeAssertion, secret: string): string {
  if (!secret.trim()) throw new Error("CRM_CORE_BRIDGE_SECRET is required for Core bridge calls");
  return `sha256=${createHmac("sha256", secret).update(canonicalCoreBridgeAssertion(assertion)).digest("hex")}`;
}

export async function exchangeCoreBridgeSession(
  assertion: CoreBridgeAssertion,
  secret: string,
  options: { baseUrl?: string; fetcher?: typeof fetch } = {},
): Promise<CoreSessionResponse> {
  const response = await (options.fetcher ?? fetch)(`${options.baseUrl ?? getCoreApiUrl()}/api/v1/auth/bridge`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Core-Bridge-Signature": signCoreBridgeAssertion(assertion, secret) },
    body: JSON.stringify(assertion),
  });
  if (!response.ok) throw new CoreApiError(response.status, `Core bridge request failed: ${response.status}`);
  return response.json() as Promise<CoreSessionResponse>;
}
