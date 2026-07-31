"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createViewDay,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek,
} from "@schedule-x/calendar";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createEventModalPlugin } from "@schedule-x/event-modal";
import { Temporal } from "temporal-polyfill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import "@schedule-x/theme-default/dist/index.css";

type LiteCalendarEventKind =
  | "confirmed_reservation"
  | "booking_request"
  | "payment_pending"
  | "manual_availability";

type LiteCalendarEvent = {
  id: string;
  sourceId: string;
  kind: LiteCalendarEventKind;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  calendarId: string;
  resourceId: string | null;
  resourceName: string | null;
  serviceName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  paymentExpectedDisplay: string | null;
  description: string;
  actionHref: string | null;
};

type LiteCalendarPayload = {
  events: LiteCalendarEvent[];
  summary: {
    confirmedReservations: number;
    pendingRequests: number;
    paymentPending: number;
    manualBlocks: number;
  };
  range: { from: string; to: string };
};

const TIMEZONE = "America/Asuncion";

const calendars = {
  confirmed: {
    colorName: "confirmed",
    label: "Confirmadas",
    lightColors: { main: "#2f6f4f", container: "#dceee5", onContainer: "#1f4f37" },
    darkColors: { main: "#9dd7b4", container: "#1f4f37", onContainer: "#eaf8ef" },
  },
  request: {
    colorName: "request",
    label: "Solicitudes",
    lightColors: { main: "#3f5972", container: "#dde5ee", onContainer: "#2b4056" },
    darkColors: { main: "#aac2da", container: "#2b4056", onContainer: "#f3f6f9" },
  },
  payment: {
    colorName: "payment",
    label: "Seña pendiente",
    lightColors: { main: "#9a6a2f", container: "#f2e4ce", onContainer: "#6d461e" },
    darkColors: { main: "#e5bd82", container: "#6d461e", onContainer: "#fff7ea" },
  },
  customer: {
    colorName: "customer",
    label: "Esperando cliente",
    lightColors: { main: "#72633f", container: "#ece5d6", onContainer: "#51462e" },
    darkColors: { main: "#d8c898", container: "#51462e", onContainer: "#f8f2df" },
  },
  available: {
    colorName: "available",
    label: "Disponible",
    lightColors: { main: "#5f8f74", container: "#e1f0e7", onContainer: "#3c654e" },
    darkColors: { main: "#a8dabd", container: "#3c654e", onContainer: "#effaf4" },
  },
  tentative: {
    colorName: "tentative",
    label: "Tentativo",
    lightColors: { main: "#82689b", container: "#eadff3", onContainer: "#574268" },
    darkColors: { main: "#d7b6ee", container: "#574268", onContainer: "#faf2ff" },
  },
  blocked: {
    colorName: "blocked",
    label: "Bloqueado/Ocupado",
    lightColors: { main: "#a2504c", container: "#f1dcda", onContainer: "#713632" },
    darkColors: { main: "#e9aaa5", container: "#713632", onContainer: "#fff2f0" },
  },
  muted: {
    colorName: "muted",
    label: "Cerradas",
    lightColors: { main: "#8c8c95", container: "#ededf0", onContainer: "#56565e" },
    darkColors: { main: "#c5c5cc", container: "#56565e", onContainer: "#fbfbfc" },
  },
};

export function LiteCalendarClient() {
  const [payload, setPayload] = useState<LiteCalendarPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventsService] = useState(() => createEventsServicePlugin());
  const [eventModal] = useState(() => createEventModalPlugin());

  const calendarEvents = useMemo(
    () =>
      (payload?.events ?? []).map((event) => ({
        id: event.id,
        title: event.title,
        start: toZonedDateTime(event.startsAt),
        end: toZonedDateTime(event.endsAt),
        calendarId: event.calendarId,
        resourceId: event.resourceId ?? undefined,
        location: event.resourceName ?? undefined,
        description: event.description,
        people: event.customerName ? [event.customerName] : undefined,
        _options: { disableDND: true, disableResize: true },
      })),
    [payload?.events]
  );

  const calendarApp = useNextCalendarApp(
    {
      views: [
        createViewWeek(),
        createViewDay(),
        createViewMonthGrid(),
        createViewMonthAgenda(),
      ],
      events: calendarEvents,
      calendars,
      defaultView: "week",
      locale: "es-PY",
      timezone: TIMEZONE,
      dayBoundaries: { start: "06:00", end: "23:00" },
      weekOptions: {
        gridHeight: 720,
        gridStep: 60,
        eventOverlap: true,
      },
    },
    [eventsService, eventModal]
  );

  const refetch = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/lite/calendar").catch(() => null);
    setLoading(false);
    if (!response?.ok) {
      setMessage("No se pudo cargar el calendario Lite.");
      return;
    }
    const data = (await response.json()) as { calendar: LiteCalendarPayload };
    setPayload(data.calendar);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    eventsService.set(calendarEvents);
  }, [calendarEvents, eventsService]);

  const events = payload?.events ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              Integración OSS · Schedule-X
            </p>
            <h2 className="mt-1 font-semibold">Calendario Lite</h2>
            <p className="mt-1 max-w-3xl text-xs text-text-3">
              Vista profesional para operar reservas manuales sin WABA, sin AI y sin Google
              Calendar. El calendario es visual: Reservas CRM sigue siendo la autoridad.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void refetch()} disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar"}
            </Button>
            <Link
              href="/lite/operator"
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium"
            >
              Centro operativo
            </Link>
            <Link
              href="/lite"
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium"
            >
              Solicitudes
            </Link>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-6">
        {message && <p className="mb-4 rounded-md border bg-subtle p-3 text-sm">{message}</p>}

        <section className="grid gap-3 md:grid-cols-4">
          <SummaryCard label="Confirmadas" value={payload?.summary.confirmedReservations ?? 0} />
          <SummaryCard label="Solicitudes" value={payload?.summary.pendingRequests ?? 0} />
          <SummaryCard label="Señas pendientes" value={payload?.summary.paymentPending ?? 0} />
          <SummaryCard label="Bloques manuales" value={payload?.summary.manualBlocks ?? 0} />
        </section>

        <section className="mt-5 overflow-hidden rounded-lg border bg-card p-3">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Legend label="Confirmada" className="bg-[#dceee5] text-[#1f4f37]" />
            <Legend label="Solicitud" className="bg-brand-soft text-brand-text" />
            <Legend label="Seña pendiente" className="bg-[#f2e4ce] text-[#6d461e]" />
            <Legend label="Bloqueado/Ocupado" className="bg-[#f1dcda] text-[#713632]" />
          </div>
          <div className="min-h-[760px] rounded-md bg-background" data-testid="lite-sx-calendar">
            {calendarApp ? (
              <ScheduleXCalendar calendarApp={calendarApp} />
            ) : (
              <p className="p-4 text-sm text-text-3">Preparando calendario…</p>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Agenda de respaldo</h3>
          <p className="mt-1 text-sm text-text-3">
            Si el calendario no carga en un teléfono viejo, esta lista mantiene la operación.
          </p>
          <div className="mt-3 grid gap-2">
            {events.slice(0, 80).map((event) => (
              <article key={event.id} className="rounded-md border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="mt-1 text-xs text-text-3">
                      {formatDate(event.startsAt)} → {formatDate(event.endsAt)}
                      {event.resourceName ? ` · ${event.resourceName}` : ""}
                      {event.customerName ? ` · ${event.customerName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={event.kind === "payment_pending" ? "secondary" : "outline"}>
                      {event.status}
                    </Badge>
                    {event.actionHref && (
                      <Link
                        href={event.actionHref}
                        className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                      >
                        Abrir
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {!events.length && (
              <p className="rounded-md border bg-background p-3 text-sm text-text-3">
                Todavía no hay reservas, solicitudes ni bloques en el rango del calendario.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-text-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Legend({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full px-2.5 py-1 font-medium ${className}`}>{label}</span>;
}

function toZonedDateTime(iso: string) {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(TIMEZONE);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIMEZONE,
  }).format(new Date(iso));
}
