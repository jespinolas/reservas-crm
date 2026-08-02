import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getEnv } from "@/lib/env";
import {
  processInstagramWebhook,
  type InstagramWebhookPayload,
} from "@/server/instagram/ingest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = getEnv();
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (
    mode === "subscribe" &&
    env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN &&
    token === env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response(null, { status: 403 });
}

export async function POST(req: Request) {
  const env = getEnv();
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = env.INSTAGRAM_APP_SECRET ?? env.META_APP_SECRET;
  if (!appSecret && env.NODE_ENV === "production") {
    return new Response(null, { status: 503 });
  }
  if (appSecret && !validSignature(rawBody, signature, appSecret)) {
    return new Response(null, { status: 401 });
  }
  let payload: InstagramWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as InstagramWebhookPayload;
  } catch {
    return Response.json({ received: true });
  }
  after(async () => {
    try {
      await processInstagramWebhook(payload);
    } catch (error) {
      console.error("[instagram] webhook processing failed", error instanceof Error ? error.message : "unknown");
    }
  });
  return Response.json({ received: true });
}

function validSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const actual = header.slice("sha256=".length);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
