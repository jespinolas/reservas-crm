import { withAuth } from "@/lib/api";
import { renderKb } from "@/server/ai/prompts";
import { listLiveKbEntries } from "@/server/kb/manager";

export const dynamic = "force-dynamic";

/**
 * Tamaño estimado del knowledge base (FR-020). v1 inyecta el KB completo al
 * prompt; umbral de aviso heurístico: ~24.000 caracteres (≈6k tokens).
 */
const WARN_CHARS = 24_000;

export const GET = withAuth(async (session) => {
  const entries = await listLiveKbEntries(session.organizationId);
  const chars = renderKb(entries).length;
  return Response.json({
    chars,
    warnAt: WARN_CHARS,
    warning: chars >= WARN_CHARS,
  });
});
