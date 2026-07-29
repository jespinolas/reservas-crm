"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AnalyticsDashboard = {
  range: { from: string; to: string; timezone: string };
  summary: {
    confirmedReservations: number;
    cancelledReservations: number;
    activeHolds: number;
    expiredHolds: number;
    convertedHolds: number;
  };
  series: {
    bookingsByDay: { day: string; count: number }[];
    bookingsByHour: { hour: number; count: number }[];
    topResources: { id: string; name: string; count: number }[];
    topServices: { id: string; name: string; count: number }[];
  };
  conversion: { available: false; reason: string };
};

export function ReservationAnalyticsClient() {
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const response = await fetch(`/api/analytics/reservations?${params}`).catch(() => null);
    setLoading(false);
    if (!response?.ok) return;
    const next = (await response.json()) as AnalyticsDashboard;
    setDashboard(next);
    setFrom(next.range.from);
    setTo(next.range.to);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Analytics</h2>
          <p className="mt-0.5 text-xs text-text-3">
            Reservas, holds y demanda por recurso desde la base CRM.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Aplicar
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 border-b bg-subtle px-6 py-4 lg:grid-cols-5">
        <Metric label="Confirmadas" value={dashboard?.summary.confirmedReservations ?? 0} />
        <Metric label="Canceladas" value={dashboard?.summary.cancelledReservations ?? 0} />
        <Metric label="Holds activos" value={dashboard?.summary.activeHolds ?? 0} />
        <Metric label="Holds vencidos" value={dashboard?.summary.expiredHolds ?? 0} />
        <Metric label="Convertidos" value={dashboard?.summary.convertedHolds ?? 0} />
      </section>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {loading ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-text-3">
            Cargando analytics
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Reservas por día">
              <BarRows rows={dashboard?.series.bookingsByDay.map((row) => ({ label: row.day, value: row.count })) ?? []} />
            </Panel>
            <Panel title="Reservas por hora">
              <BarRows rows={dashboard?.series.bookingsByHour.map((row) => ({ label: `${row.hour}:00`, value: row.count })) ?? []} />
            </Panel>
            <Panel title="Recursos principales">
              <BarRows rows={dashboard?.series.topResources.map((row) => ({ label: row.name, value: row.count })) ?? []} />
            </Panel>
            <Panel title="Servicios principales">
              <BarRows rows={dashboard?.series.topServices.map((row) => ({ label: row.name, value: row.count })) ?? []} />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex h-[74px] items-center justify-between rounded-md border bg-background px-4">
      <span className="text-sm font-medium text-text-2">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <BarChart3 className="h-4 w-4 text-brand" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function BarRows({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) {
    return <div className="h-32 text-sm text-text-3">Sin datos en este rango</div>;
  }
  return (
    <div className="space-y-2">
      {rows.slice(0, 10).map((row) => (
        <div key={row.label} className="grid grid-cols-[128px_1fr_40px] items-center gap-3 text-sm">
          <span className="truncate text-text-2">{row.label}</span>
          <span className="h-2 rounded-full bg-subtle">
            <span
              className="block h-2 rounded-full bg-brand"
              style={{ width: `${Math.max(6, (row.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-right tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
