import { and, desc, eq, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const requestedStatus = new URL(req.url).searchParams.get("status");
  const statuses = requestedStatus
    ? requestedStatus.split(",").filter((status): status is "new" | "handled" | "hidden" | "deleted" | "failed" =>
        ["new", "handled", "hidden", "deleted", "failed"].includes(status)
      )
    : [];
  const comments = await getDb()
    .select({
      id: schema.instagramComment.id,
      contactId: schema.instagramComment.contactId,
      providerCommentId: schema.instagramComment.providerCommentId,
      providerMediaId: schema.instagramComment.providerMediaId,
      providerUsername: schema.instagramComment.providerUsername,
      text: schema.instagramComment.text,
      permalink: schema.instagramComment.permalink,
      status: schema.instagramComment.status,
      createdAt: schema.instagramComment.createdAt,
      updatedAt: schema.instagramComment.updatedAt,
    })
    .from(schema.instagramComment)
    .where(
      statuses.length
        ? and(
            inArray(schema.instagramComment.status, statuses),
            eq(schema.instagramComment.organizationId, session.organizationId)
          )
        : eq(schema.instagramComment.organizationId, session.organizationId)
    )
    .orderBy(desc(schema.instagramComment.createdAt))
    .limit(200);
  return Response.json({
    comments: comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    })),
  });
});
