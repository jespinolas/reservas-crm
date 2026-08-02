import { getEnv } from "@/lib/env";

export class InstagramApiError extends Error {
  status: number;
  code: number | null;
  details: unknown;

  constructor(message: string, opts: { status: number; code?: number | null; details?: unknown }) {
    super(message);
    this.name = "InstagramApiError";
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.details = opts.details;
  }

  get isAuthError() {
    return this.status === 401 || this.code === 190;
  }
}

export async function instagramRequest<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; token: string; body?: unknown }
): Promise<T> {
  const env = getEnv();
  const url = `${env.INSTAGRAM_GRAPH_BASE_URL}/${env.META_GRAPH_API_VERSION}/${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (cause) {
    throw new InstagramApiError("No se pudo contactar la API de Instagram", {
      status: 0,
      details: cause,
    });
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Provider response remains outside customer-facing errors.
  }
  if (!response.ok) {
    const error = (json as { error?: { message?: string; code?: number } } | null)?.error;
    throw new InstagramApiError(error?.message ?? `Instagram respondió ${response.status}`, {
      status: response.status,
      code: error?.code ?? null,
      details: json ?? text,
    });
  }
  return json as T;
}
