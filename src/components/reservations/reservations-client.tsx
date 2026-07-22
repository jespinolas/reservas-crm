"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Search } from "lucide-react";
import type {
  ReservationListItemDto,
  ReservationListSummaryDto,
} from "@/lib/types";
import { formatPhone } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StatusFilter = "all" | ReservationListItemDto["status"];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "confirmed", label: "Confirmadas" },
  { value: "active_hold", label: "Holds" },
  { value: "cancelled", label: "Canceladas" },
];

const emptySummary: ReservationListSummaryDto = {
  confirmed: 0,
  cancelled: 0,
  activeHolds: 0,
};

export function ReservationsClient() {
  const [items, setItems] = useState<ReservationListItemDto[]>([]);
  const [summary, setSummary] = useState<ReservationListSummaryDto>(emptySummary);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/reservations").catch(() => null);
    setLoading(false);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      reservations: ReservationListItemDto[];
      summary: ReservationListSummaryDto;
    };
    setItems(data.reservations);
    setSummary(data.summary);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        item.id,
        item.resource.name,
        item.service.name,
        item.contact?.name,
        item.contact?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, query, status]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Reservas</h2>
          <p className="mt-0.5 text-xs text-text-3">
            {summary.confirmed} confirmadas · {summary.activeHolds} holds activos ·{" "}
            {summary.cancelled} canceladas
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex rounded-md border bg-background p-0.5">
            {FILTERS.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                variant={status === filter.value ? "secondary" : "ghost"}
                size="sm"
                className="h-7 rounded-sm px-2.5"
                onClick={() => setStatus(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar reserva…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72 pl-8"
            />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 border-b bg-subtle px-6 py-4 md:grid-cols-3">
        <SummaryTile
          icon={<CalendarDays className="h-4 w-4" />}
          label="Confirmadas"
          value={summary.confirmed}
        />
        <SummaryTile
          icon={<Clock3 className="h-4 w-4" />}
          label="Holds activos"
          value={summary.activeHolds}
        />
        <SummaryTile label="Canceladas" value={summary.cancelled} />
      </section>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full min-w-[860px] table-fixed text-left text-sm">
            <thead className="border-b bg-subtle text-xs font-semibold uppercase text-text-3">
              <tr>
                <th className="w-[18%] px-4 py-3">Horario</th>
                <th className="w-[18%] px-4 py-3">Recurso</th>
                <th className="w-[18%] px-4 py-3">Servicio</th>
                <th className="w-[20%] px-4 py-3">Contacto</th>
                <th className="w-[14%] px-4 py-3">Estado</th>
                <th className="w-[12%] px-4 py-3">ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow text="Cargando reservas" />
              ) : filtered.length === 0 ? (
                <EmptyRow text="Sin reservas para este filtro" />
              ) : (
                filtered.map((item) => <ReservationRow key={item.id} item={item} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex h-[74px] items-center justify-between rounded-md border bg-background px-4">
      <div className="flex items-center gap-2 text-sm font-medium text-text-2">
        {icon && <span className="text-brand">{icon}</span>}
        <span>{label}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ReservationRow({ item }: { item: ReservationListItemDto }) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-accent">
      <td className="px-4 py-3 align-top">
        <div className="font-medium">{formatDateTime(item.startsAt)}</div>
        <div className="mt-0.5 text-xs text-text-3">hasta {formatTime(item.endsAt)}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="truncate font-medium">{item.resource.name}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="truncate font-medium">{item.service.name}</div>
        <div className="mt-0.5 text-xs text-text-3">{item.service.durationMinutes} min</div>
      </td>
      <td className="px-4 py-3 align-top">
        {item.contact ? (
          <>
            <div className="truncate font-medium">{item.contact.name}</div>
            <div className="mt-0.5 text-xs text-text-3">{formatPhone(item.contact.phone)}</div>
          </>
        ) : (
          <span className="text-text-3">Sin contacto</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge item={item} />
        {item.expiresAt && (
          <div className="mt-1 text-xs text-text-3">vence {formatTime(item.expiresAt)}</div>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <code className="block truncate text-xs text-text-3">{item.id}</code>
      </td>
    </tr>
  );
}

function StatusBadge({ item }: { item: ReservationListItemDto }) {
  if (item.status === "confirmed") return <Badge variant="success">Confirmada</Badge>;
  if (item.status === "cancelled") return <Badge variant="destructive">Cancelada</Badge>;
  return <Badge variant="warning">Hold activo</Badge>;
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
