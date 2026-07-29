import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createKbEntry,
  kbCategorySchema,
  kbEntryInputSchema,
  kbReviewStatusSchema,
  listKbEntries,
} from "@/server/kb/manager";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const category = kbCategorySchema.safeParse(url.searchParams.get("category"));
  const reviewStatus = kbReviewStatusSchema.safeParse(
    url.searchParams.get("reviewStatus")
  );
  const activeParam = url.searchParams.get("active");
  const entries = await listKbEntries({
    organizationId: session.organizationId,
    category: category.success ? category.data : undefined,
    reviewStatus: reviewStatus.success ? reviewStatus.data : undefined,
    active:
      activeParam === "true" ? true : activeParam === "false" ? false : undefined,
  });
  return Response.json({ entries });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, kbEntryInputSchema);
  if (!body.ok) return body.response;

  try {
    const entry = await createKbEntry(session.organizationId, body.data);
    return Response.json({ entry }, { status: 201 });
  } catch {
    return apiError(500, "internal", "No se pudo crear");
  }
});
