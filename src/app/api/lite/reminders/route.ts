import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { LiteOperatorService, serializeReminderTask } from "@/server/lite/operator";

export const dynamic = "force-dynamic";

const doneBodySchema = z.object({
  taskKey: z.string().trim().min(1).max(240),
  taskKind: z.string().trim().min(1).max(80),
  targetId: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const GET = withAuth(async (session) => {
  const tasks = await new LiteOperatorService().listReminderTasks({
    organizationId: session.organizationId,
  });
  return Response.json({ tasks: tasks.map(serializeReminderTask) });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, doneBodySchema);
  if (!body.ok) return body.response;
  if (!body.data.taskKey.startsWith(`${body.data.taskKind}:`)) {
    return apiError(422, "invalid_task", "Tarea inválida");
  }
  await new LiteOperatorService().markReminderDone({
    organizationId: session.organizationId,
    actorUserId: session.userId,
    ...body.data,
  });
  return Response.json({ ok: true });
});
