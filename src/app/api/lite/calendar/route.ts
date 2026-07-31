import { apiError, withAuth } from "@/lib/api";
import {
  LiteCalendarError,
  LiteCalendarService,
  serializeLiteCalendarFeed,
} from "@/server/lite/calendar";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const now = new Date();
  const from = parseDateParam(url.searchParams.get("from"), daysFrom(now, -30));
  const to = parseDateParam(url.searchParams.get("to"), daysFrom(now, 90));

  try {
    const feed = await new LiteCalendarService().buildCalendar({
      organizationId: session.organizationId,
      from,
      to,
    });
    return Response.json({ calendar: serializeLiteCalendarFeed(feed) });
  } catch (error) {
    if (error instanceof LiteCalendarError) {
      return apiError(400, error.code, "Rango de calendario inválido");
    }
    throw error;
  }
});

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function daysFrom(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

