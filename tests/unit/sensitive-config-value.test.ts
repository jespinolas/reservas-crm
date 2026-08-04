import { describe, expect, it } from "vitest";
import { maskValue } from "@/components/settings/sensitive-config-value";

describe("sensitive settings values", () => {
  it("masks identifiers by default while preserving only a short suffix", () => {
    expect(maskValue("12345678901234567890")).toBe("••••••••••••7890");
    expect(maskValue("123456789012")).toBe("••••••••");
    expect(maskValue("1234")).toBe("••••");
  });
});
