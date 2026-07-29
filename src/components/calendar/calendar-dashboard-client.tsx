"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, RefreshCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CalendarStatus =
  | "all"
  | "pending"
  | "synced"
  | "failed"
  | "deleted"
  | "reconnect_required";

type CalendarDashboard = {
  connection: {
    connected: boolean;
    googleAccountEmail: string | null;
    calendarId: string | null;
    scopes: string[];
    accessTokenExpiresAt: string | null;
    status: Exclude<CalendarStatus, "all"> | "not_connected";
    updatedAt: string | null;
  };
  counts: Record<Exclude<CalendarStatus, "all">, number>;
  syncs: {
    id: string;
    reservationId: string;
    googleEventId: string | null;
    status: Exclude<CalendarStatus, "all" | "reconnect_required">;
    attempts: number;
    lastError: string | null;
    lastSyncedAt: string | null;
    updatedAt: string;
    reservation: {
      startsAt: string;
      endsAt: string;
      status: "confirmed" | "cancelled";
    } | null;
    resource: { id: string; name: string } | null;
    service: { id: string; name: string; durationMinutes: number } | null;
    contact: { id: string; name: string; phone: string } | null;
  }[];
};

const filters: { value: CalendarStatus; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "failed", label: "Fallidas" },
  { value: "pending", label: "Pendientes" },
  { value: "synced", label: "Sincronizadas" },
];

export function CalendarDashboardClient() {
  const [dashboard, setDashboard] = useState<CalendarDashboard | null>(null);
  const [filter, setFilter] = useState<CalendarStatus>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(status = filter) {
    setLoading(true);
    const response = await fetch(`/api/calendar/dashboard?status=${status}`).catch(() => null);
    setLoading(false);
    if (!response?.ok) return;
    setDashboard((await response.json()) as CalendarDashboard);
  }

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const syncs = dashboard?.syncs ?? [];
    if (!needle) return syncs;
    return syncs.filter((sync) =>
      [
        sync.id,
        sync.reservationId,
        sync.googleEventId,
        sync.resource?.name,
        sync.service?.name,
        sync.contact?.name,
        sync.lastError,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [dashboard?.syncs, query]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Calendar sync</h2>
          <p className="mt-0.5 text-xs text-text-3">
            Estado de Google Calendar y registros de sincronización.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </header>

      <section className="grid grid-cols-1 gap-3 border-b bg-subtle px-6 py-4 lg:grid-cols-4">
        <Metric label="Conexión" value={labelConnection(dashboard?.connection.status)} />
        <Metric label="Fallidas" value={dashboard?.counts.failed ?? 0} />
        <Metric label="Pendientes" value={dashboard?.counts.pending ?? 0} />
        <Metric label="Sincronizadas" value={dashboard?.counts.synced ?? 0} />
      </section>

      <section className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <CalendarCheck className="h-4 w-4 text-brand" />
          <span className="font-medium">
            {dashboard?.connection.calendarId ?? "Sin calendario conectado"}
          </span>
          <span className="text-text-3">{dashboard?.connection.googleAccountEmail}</span>
          <ConnectionBadge status={dashboard?.connection.status ?? "not_connected"} />
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex rounded-md border bg-background p-0.5">
          {filters.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={filter === item.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 rounded-sm px-2.5"
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar sync…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-72 pl-8"
          />
        </div>
      </section>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full min-w-[960px] table-fixed text-left text-sm">
            <thead className="border-b bg-subtle text-xs font-semibold uppercase text-text-3">
              <tr>
                <th className="w-[17%] px-4 py-3">Reserva</th>
                <th className="w-[18%] px-4 py-3">Recurso</th>
                <th className="w-[16%] px-4 py-3">Google event</th>
                <th className="w-[12%] px-4 py-3">Estado</th>
                <th className="w-[10%] px-4 py-3">Intentos</th>
                <th className="w-[27%] px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow text="Cargando sincronización" />
              ) : rows.length === 0 ? (
                <EmptyRow text="Sin registros para este filtro" />
              ) : (
                rows.map((sync) => (
                  <tr key={sync.id} className="border-b last:border-b-0 hover:bg-accent">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">
                        {sync.reservation ? formatDateTime(sync.reservation.startsAt) : sync.reservationId}
                      </div>
                      <code className="mt-0.5 block truncate text-xs text-text-3">
                        {sync.reservationId}
                      </code>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="truncate font-medium">{sync.resource?.name ?? "Sin recurso"}</div>
                      <div className="mt-0.5 truncate text-xs text-text-3">
                        {sync.service?.name ?? "Sin servicio"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="block truncate text-xs text-text-3">
                        {sync.googleEventId ?? "pendiente"}
                      </code>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <SyncBadge status={sync.status} />
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums">{sync.attempts}</td>
                    <td className="px-4 py-3 align-top">
                      <span className="line-clamp-2 text-xs text-text-3">
                        {sync.lastError ?? "Sin error"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex h-[72px] items-center justify-between rounded-md border bg-background px-4">
      <span className="text-sm font-medium text-text-2">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  if (status === "connected") return <Badge variant="success">Conectado</Badge>;
  if (status === "reconnect_required") return <Badge variant="warning">Reconectar</Badge>;
  if (status === "disabled") return <Badge variant="secondary">Desactivado</Badge>;
  return <Badge variant="outline">Sin conexión</Badge>;
}

function SyncBadge({ status }: { status: string }) {
  if (status === "synced") return <Badge variant="success">Sync</Badge>;
  if (status === "failed") return <Badge variant="destructive">Fallida</Badge>;
  if (status === "deleted") return <Badge variant="secondary">Eliminada</Badge>;
  return <Badge variant="warning">Pendiente</Badge>;
}

function EmptyRow({ text }: { text: string }) {
  return (
    <tr>
      <td colSpan={6} className="h-48 px-4 text-center text-sm text-text-3">
        {text}
      </td>
    </tr>
  );
}

function labelConnection(status?: string): string {
  if (status === "connected") return "Conectado";
  if (status === "reconnect_required") return "Reconectar";
  if (status === "disabled") return "Desactivado";
  return "Pendiente";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
