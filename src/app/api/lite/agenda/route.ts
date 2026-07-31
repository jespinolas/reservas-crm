import { withAuth } from "@/lib/api";
import {
  LiteOperatorService,
  serializeAvailabilityBlock,
  serializeReminderTask,
} from "@/server/lite/operator";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const agenda = await new LiteOperatorService().buildAgenda({
    organizationId: session.organizationId,
  });
  return Response.json({
    agenda: {
      ...agenda,
      reservationsToday: agenda.reservationsToday.map((reservation) => ({
        ...reservation,
        startsAt: reservation.startsAt.toISOString(),
        endsAt: reservation.endsAt.toISOString(),
      })),
      pendingRequests: agenda.pendingRequests.map((request) => ({
        ...request,
        startsAt: request.startsAt.toISOString(),
      })),
      reminders: agenda.reminders.map(serializeReminderTask),
      availabilityBlocks: agenda.availabilityBlocks.map(serializeAvailabilityBlock),
    },
  });
});
