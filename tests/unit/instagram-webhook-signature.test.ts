import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";

function validSignature(body: string, header: string, secret: string) {
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const actual = Buffer.from(header.slice("sha256=".length));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

describe("Instagram webhook signature contract", () => {
  it("matches Meta x-hub-signature-256 format", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(validSignature(body, signature, "app-secret")).toBe(true);
    expect(validSignature(body, signature, "wrong-secret")).toBe(false);
  });
});
