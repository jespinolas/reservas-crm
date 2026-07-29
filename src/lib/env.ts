import { z } from "zod";

/**
 * Validación central del entorno.
 *
 * Lazy + memoizada: se evalúa en el primer uso en runtime, nunca al importar.
 * Durante `next build` no hay secretos (la imagen se construye sin ellos), así
 * que en esa fase se aceptan placeholders — los valores reales llegan al boot.
 */

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message:
        "ENCRYPTION_KEY debe ser 32 bytes en base64 (genera con: openssl rand -base64 32)",
    }),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(8),
  META_APP_SECRET: z.string().optional(),
  CRM_PROVISIONING_SECRET: z.string().min(16).optional(),
  CRM_PROVISIONING_TOKEN_SECRET_DIR: z.string().optional(),
  CRM_PROVISIONING_ACCEPT_RAW_TOKEN_SMOKE_ONLY: z.string().optional(),
  PLATFORM_ORIGIN: z.string().url().default("https://platform.reservas.com.py"),
  PLATFORM_INSTALLATION_ID: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  OPENROUTER_API_TOKEN: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api"),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_JUDGE_MODEL: z.string().optional(),
  AI_PROVIDER_KEY_OWNERSHIP: z
    .enum(["managed_shared", "managed_customer_isolated", "self_hosted_owner_key"])
    .default("managed_shared"),
  AI_APPROVED_LOW_COST_MODEL: z.string().default("deepseek/deepseek-v4-flash"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(4000).default(500),
  AI_DAILY_REPLY_CAP: z.coerce.number().int().min(0).optional(),
  AI_DAILY_TOKEN_CAP: z.coerce.number().int().min(0).optional(),
  AI_BILLABLE_PROBE_ENABLED: z.string().optional(),
  AI_EMERGENCY_DISABLE: z.string().optional(),
  ALLOW_SIGNUP: z.string().optional(),
  AGENT_COALESCE_MS: z.coerce.number().int().min(0).default(6000),
  WA_MOCK_ENABLED: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof envSchema>;

const BUILD_PLACEHOLDERS: Record<string, string> = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "placeholder-build-secret",
  ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  META_WEBHOOK_VERIFY_TOKEN: "placeholder-verify-token",
};

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached && process.env.NODE_ENV !== "test") return cached;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  // Los strings vacíos cuentan como ausentes: los compose/paneles suelen
  // inyectar VAR="" para opcionales y eso debe activar los defaults.
  const source = isBuild
    ? { ...BUILD_PLACEHOLDERS, ...stripEmpty(process.env) }
    : stripEmpty(process.env);
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(
      `Variables de entorno inválidas o faltantes:\n  ${missing}\n` +
        "Revisa .env.example para la guía de cada variable."
    );
  }
  if (process.env.NODE_ENV !== "test") cached = parsed.data;
  return parsed.data;
}

function stripEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

/** true si el entorno de pruebas interno (mocks) está habilitado y NO es producción. */
export function isMockEnabled(): boolean {
  return (
    process.env.WA_MOCK_ENABLED === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

/** true si hay proveedor de IA configurado (token presente y no vacío). */
export function isAiConfigured(): boolean {
  const token = process.env.OPENROUTER_API_TOKEN;
  const model = process.env.OPENROUTER_MODEL;
  return (
    isTruthy(process.env.AI_EMERGENCY_DISABLE) === false &&
    process.env.AI_DAILY_REPLY_CAP !== "0" &&
    typeof token === "string" &&
    token.trim().length > 0 &&
    typeof model === "string" &&
    model.trim().length > 0
  );
}

export type AiProviderReadiness = {
  provider: "openrouter";
  configured: boolean;
  model: string | null;
  keyOwnership: Env["AI_PROVIDER_KEY_OWNERSHIP"];
  costPolicy: {
    approvedLowCostModel: string;
    usesApprovedLowCostModel: boolean;
    maxOutputTokens: number;
    dailyReplyCapConfigured: boolean;
    dailyTokenCapConfigured: boolean;
    billableProbeDisabled: boolean;
    emergencyDisabled: boolean;
  };
  lastStatus:
    | "ok"
    | "not_configured"
    | "emergency_disabled"
    | "spend_cap_reached"
    | "model_policy_warning";
  lastErrorCode:
    | null
    | "missing_api_token"
    | "missing_model"
    | "emergency_disabled"
    | "spend_cap_reached"
    | "non_low_cost_model";
};

export function getAiProviderReadiness(): AiProviderReadiness {
  const env = getEnv();
  const token = process.env.OPENROUTER_API_TOKEN?.trim();
  const model = env.OPENROUTER_MODEL?.trim() || null;
  const emergencyDisabled = isTruthy(env.AI_EMERGENCY_DISABLE);
  const dailyReplyCapReached = env.AI_DAILY_REPLY_CAP === 0;
  const usesApprovedLowCostModel = model === env.AI_APPROVED_LOW_COST_MODEL;

  let lastStatus: AiProviderReadiness["lastStatus"] = "ok";
  let lastErrorCode: AiProviderReadiness["lastErrorCode"] = null;

  if (emergencyDisabled) {
    lastStatus = "emergency_disabled";
    lastErrorCode = "emergency_disabled";
  } else if (dailyReplyCapReached) {
    lastStatus = "spend_cap_reached";
    lastErrorCode = "spend_cap_reached";
  } else if (!token) {
    lastStatus = "not_configured";
    lastErrorCode = "missing_api_token";
  } else if (!model) {
    lastStatus = "not_configured";
    lastErrorCode = "missing_model";
  } else if (!usesApprovedLowCostModel) {
    lastStatus = "model_policy_warning";
    lastErrorCode = "non_low_cost_model";
  }

  return {
    provider: "openrouter",
    configured: lastStatus === "ok" || lastStatus === "model_policy_warning",
    model,
    keyOwnership: env.AI_PROVIDER_KEY_OWNERSHIP,
    costPolicy: {
      approvedLowCostModel: env.AI_APPROVED_LOW_COST_MODEL,
      usesApprovedLowCostModel,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      dailyReplyCapConfigured: env.AI_DAILY_REPLY_CAP !== undefined,
      dailyTokenCapConfigured: env.AI_DAILY_TOKEN_CAP !== undefined,
      billableProbeDisabled: isTruthy(env.AI_BILLABLE_PROBE_ENABLED) === false,
      emergencyDisabled,
    },
    lastStatus,
    lastErrorCode,
  };
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}
