"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Agenda = {
  summary: {
    todayReservations: number;
    pendingRequests: number;
    paymentsDue: number;
    remindersDue: number;
    manualBlocksToday: number;
    duplicateRisk: number;
  };
  reservationsToday: Array<{
    id: string;
    customerName: string | null;
    customerPhone: string | null;
    resourceName: string;
    serviceName: string;
    startsAt: string;
  }>;
  pendingRequests: Array<{
    id: string;
    customerName: string;
    customerPhone: string;
    status: string;
    serviceName: string;
    resourceName: string | null;
    startsAt: string;
  }>;
  reminders: ReminderTask[];
  availabilityBlocks: AvailabilityBlock[];
};

type AvailabilityBlock = {
  id: string;
  resourceId: string;
  resourceName?: string;
  status: "available" | "busy" | "tentative" | "blocked";
  startsAt: string;
  endsAt: string;
  label: string | null;
  operatorNote: string | null;
};

type ReminderTask = {
  key: string;
  kind: string;
  targetId: string;
  customerName: string;
  customerPhone: string;
  title: string;
  dueAt: string;
  template: { body: string; waMeUrl: string | null; disclaimer: string };
};

type Report = {
  currency: string;
  estimatedTotalMinor: number;
  unknownValueCount: number;
  buckets: Array<{
    key: string;
    label: string;
    count: number;
    estimatedMinor: number;
    unknownValueCount: number;
  }>;
  topServices: Array<{ serviceId: string; serviceName: string; count: number; estimatedMinor: number }>;
};

type Resource = { id: string; name: string };

type CustomerSummary = {
  profile: {
    reliability: string;
    operatorNote: string | null;
  } | null;
  counts: {
    requests: number;
    confirmedReservations: number;
    declinedOrExpired: number;
    paymentsApproved: number;
    paymentsRejectedOrExpired: number;
  };
};

export function LiteOperatorDashboardClient() {
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [reminders, setReminders] = useState<ReminderTask[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [availabilityDraft, setAvailabilityDraft] = useState({
    resourceId: "",
    status: "available",
    date: today(),
    startTime: "09:00",
    endTime: "10:00",
    label: "",
    operatorNote: "",
  });
  const [profilePhone, setProfilePhone] = useState("");
  const [profile, setProfile] = useState<CustomerSummary | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    reliability: "new",
    operatorNote: "",
  });

  const refetch = useCallback(async () => {
    const [agendaRes, remindersRes, reportRes, resourcesRes] = await Promise.all([
      fetch("/api/lite/agenda").catch(() => null),
      fetch("/api/lite/reminders").catch(() => null),
      fetch("/api/lite/report").catch(() => null),
      fetch("/api/reservations/resources").catch(() => null),
    ]);
    if (agendaRes?.ok) setAgenda(((await agendaRes.json()) as { agenda: Agenda }).agenda);
    if (remindersRes?.ok) {
      setReminders(((await remindersRes.json()) as { tasks: ReminderTask[] }).tasks);
    }
    if (reportRes?.ok) setReport(((await reportRes.json()) as { report: Report }).report);
    if (resourcesRes?.ok) {
      const data = (await resourcesRes.json()) as { resources: Resource[] };
      setResources(data.resources);
      setAvailabilityDraft((current) => ({
        ...current,
        resourceId: current.resourceId || data.resources[0]?.id || "",
      }));
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function createBlock() {
    const response = await fetch("/api/lite/availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: availabilityDraft.resourceId,
        status: availabilityDraft.status,
        startsAt: new Date(`${availabilityDraft.date}T${availabilityDraft.startTime}:00`).toISOString(),
        endsAt: new Date(`${availabilityDraft.date}T${availabilityDraft.endTime}:00`).toISOString(),
        label: availabilityDraft.label || null,
        operatorNote: availabilityDraft.operatorNote || null,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("No se pudo guardar el bloque de disponibilidad.");
      return;
    }
    setMessage("Bloque guardado.");
    await refetch();
  }

  async function markReminderDone(task: ReminderTask) {
    await fetch("/api/lite/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskKey: task.key,
        taskKind: task.kind,
        targetId: task.targetId,
      }),
    }).catch(() => null);
    await refetch();
  }

  async function loadProfile(phone = profilePhone) {
    if (!phone.trim()) return;
    const response = await fetch(`/api/lite/customers/${encodeURIComponent(phone)}`).catch(
      () => null
    );
    if (!response?.ok) return;
    const data = (await response.json()) as { customer: CustomerSummary };
    setProfile(data.customer);
    setProfileDraft({
      reliability: data.customer.profile?.reliability ?? "new",
      operatorNote: data.customer.profile?.operatorNote ?? "",
    });
  }

  async function saveProfile() {
    if (!profilePhone.trim()) return;
    const response = await fetch(`/api/lite/customers/${encodeURIComponent(profilePhone)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profileDraft),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("No se pudo guardar el perfil del cliente.");
      return;
    }
    await loadProfile(profilePhone);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h2 className="font-semibold">Centro operativo Lite</h2>
        <p className="mt-1 text-xs text-text-3">
          Agenda, disponibilidad manual, recordatorios, clientes y plata perdida. Sin WABA, sin AI,
          sin envíos automáticos.
        </p>
        <a
          href="/lite/calendar"
          className="mt-3 inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
        >
          Ver calendario Lite
        </a>
      </header>
      <main className="min-h-0 flex-1 overflow-auto p-6">
        {message && <p className="mb-4 rounded-md border bg-subtle p-3 text-sm">{message}</p>}
        <section className="grid gap-3 md:grid-cols-5">
          {agenda &&
            Object.entries(agenda.summary).map(([key, value]) => (
              <div key={key} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-text-3">{key}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel title="Agenda de hoy">
            <List
              items={[
                ...(agenda?.reservationsToday ?? []).map(
                  (item) =>
                    `${new Date(item.startsAt).toLocaleTimeString("es-PY", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })} · ${item.serviceName} · ${item.resourceName} · ${
                      item.customerName ?? "sin cliente"
                    }`
                ),
                ...(agenda?.pendingRequests ?? []).map(
                  (item) => `Solicitud ${item.status}: ${item.customerName} · ${item.serviceName}`
                ),
              ]}
              empty="Sin pendientes principales."
            />
          </Panel>

          <Panel title="Disponibilidad manual">
            <div className="grid gap-2 md:grid-cols-2">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={availabilityDraft.resourceId}
                onChange={(event) =>
                  setAvailabilityDraft({ ...availabilityDraft, resourceId: event.target.value })
                }
              >
                {resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={availabilityDraft.status}
                onChange={(event) =>
                  setAvailabilityDraft({ ...availabilityDraft, status: event.target.value })
                }
              >
                <option value="available">Disponible</option>
                <option value="busy">Ocupado</option>
                <option value="tentative">Tentativo</option>
                <option value="blocked">Bloqueado</option>
              </select>
              <Input
                type="date"
                value={availabilityDraft.date}
                onChange={(event) =>
                  setAvailabilityDraft({ ...availabilityDraft, date: event.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="time"
                  value={availabilityDraft.startTime}
                  onChange={(event) =>
                    setAvailabilityDraft({ ...availabilityDraft, startTime: event.target.value })
                  }
                />
                <Input
                  type="time"
                  value={availabilityDraft.endTime}
                  onChange={(event) =>
                    setAvailabilityDraft({ ...availabilityDraft, endTime: event.target.value })
                  }
                />
              </div>
              <Input
                placeholder="Etiqueta"
                value={availabilityDraft.label}
                onChange={(event) =>
                  setAvailabilityDraft({ ...availabilityDraft, label: event.target.value })
                }
              />
              <Button onClick={() => void createBlock()}>Guardar bloque</Button>
            </div>
            <div className="mt-3 grid gap-2">
              {(agenda?.availabilityBlocks ?? []).map((block) => (
                <div key={block.id} className="rounded-md border bg-background p-2 text-xs">
                  <Badge variant={block.status === "blocked" ? "destructive" : "secondary"}>
                    {block.status}
                  </Badge>{" "}
                  {block.resourceName} · {new Date(block.startsAt).toLocaleTimeString("es-PY")} -{" "}
                  {new Date(block.endsAt).toLocaleTimeString("es-PY")} {block.label ?? ""}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recordatorios manuales">
            <div className="grid gap-3">
              {reminders.map((task) => (
                <div key={task.key} className="rounded-md border bg-background p-3">
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-text-3">{task.customerName}</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs">{task.template.body}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void navigator.clipboard.writeText(task.template.body)}
                    >
                      Copiar
                    </Button>
                    {task.template.waMeUrl && (
                      <a
                        className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                        href={task.template.waMeUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    )}
                    <Button size="sm" onClick={() => void markReminderDone(task)}>
                      Hecho
                    </Button>
                  </div>
                </div>
              ))}
              {reminders.length === 0 && <p className="text-sm text-text-3">Sin recordatorios.</p>}
            </div>
          </Panel>

          <Panel title="Perfil de cliente">
            <div className="flex gap-2">
              <Input
                placeholder="WhatsApp del cliente"
                value={profilePhone}
                onChange={(event) => setProfilePhone(event.target.value)}
              />
              <Button variant="secondary" onClick={() => void loadProfile()}>
                Buscar
              </Button>
            </div>
            {profile && (
              <div className="mt-3 rounded-md border bg-background p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={profileDraft.reliability}
                    onChange={(event) =>
                      setProfileDraft({ ...profileDraft, reliability: event.target.value })
                    }
                  >
                    <option value="new">Nuevo</option>
                    <option value="good">Buen cliente</option>
                    <option value="late_payer">Paga tarde</option>
                    <option value="no_show_risk">Riesgo no-show</option>
                    <option value="vip">VIP</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                  <Button onClick={() => void saveProfile()}>Guardar perfil</Button>
                  <Input
                    className="md:col-span-2"
                    placeholder="Nota interna"
                    value={profileDraft.operatorNote}
                    onChange={(event) =>
                      setProfileDraft({ ...profileDraft, operatorNote: event.target.value })
                    }
                  />
                </div>
                <p className="mt-3 text-xs text-text-3">
                  Solicitudes: {profile.counts.requests} · Confirmadas:{" "}
                  {profile.counts.confirmedReservations} · Declinadas/expiradas:{" "}
                  {profile.counts.declinedOrExpired} · Pagos aprobados:{" "}
                  {profile.counts.paymentsApproved}
                </p>
              </div>
            )}
          </Panel>
        </section>

        <section className="mt-5 rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Reporte de plata perdida estimada</h3>
          <p className="mt-1 text-sm text-text-3">
            Total potencial no confirmado:{" "}
            <span className="font-semibold text-foreground">
              {report ? formatMoney(report.estimatedTotalMinor, report.currency) : "—"}
            </span>
            {report?.unknownValueCount ? ` · ${report.unknownValueCount} sin precio configurado` : ""}
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {report?.buckets.map((bucket) => (
              <div key={bucket.key} className="rounded-md border bg-background p-3">
                <p className="text-xs text-text-3">{bucket.label}</p>
                <p className="mt-1 text-lg font-semibold">
                  {formatMoney(bucket.estimatedMinor, report.currency)}
                </p>
                <p className="text-xs text-text-3">{bucket.count} solicitudes</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-text-3">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.slice(0, 12).map((item) => (
        <li key={item} className="rounded-md border bg-background p-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amountMinor);
}
