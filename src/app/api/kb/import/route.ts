import { apiError, parseBody, withAuth } from "@/lib/api";
import { importKbEntries, kbImportSchema } from "@/server/kb/manager";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, kbImportSchema);
  if (!body.ok) return body.response;
  try {
    const result = await importKbEntries(session.organizationId, body.data);
    return Response.json(result, { status: 201 });
  } catch {
    return apiError(500, "internal", "No se pudo importar");
  }
});
