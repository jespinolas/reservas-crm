export type CoreApiMode = "legacy" | "shadow" | "core";

type Environment = Record<string, string | undefined>;

export function getCoreApiMode(env: Environment = process.env): CoreApiMode {
  const mode = env.CORE_API_MODE ?? "legacy";
  if (mode === "legacy" || mode === "shadow" || mode === "core") return mode;
  throw new Error("CORE_API_MODE must be legacy, shadow, or core");
}

export function getCoreApiUrl(env: Environment = process.env): string {
  const value = env.CORE_API_URL?.trim();
  if (!value) throw new Error("CORE_API_URL is required for Core API calls");
  return value.replace(/\/$/, "");
}
