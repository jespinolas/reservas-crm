"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Package, Plus, RefreshCw, Search } from "lucide-react";
import type {
  ReservationListItemDto,
  ReservationListSummaryDto,
} from "@/lib/types";
import { buildBookingAutomationReadinessSummary } from "@/lib/booking-automation-readiness";
import { buildPendingBookingWorkQueue } from "@/lib/pending-booking-work-queue";
import { buildBookingWorkQueueInboxAction } from "@/lib/booking-work-queue-link";
import { formatPhone } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StatusFilter = "all" | ReservationListItemDto["status"];
type ResourceKind =
  | "football_field"
  | "room"
  | "venue"
  | "cabin"
  | "house"
  | "court"
  | "field"
  | "chair"
  | "staff_member"
  | "therapist"
  | "stylist"
  | "vehicle"
  | "table"
  | "professional"
  | "other";

type CatalogResource = {
  id: string;
  name: string;
  description: string | null;
  kind: ResourceKind;
  location: string | null;
  capacity: number;
  active: boolean;
  sortOrder: number;
};

type CatalogService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  active: boolean;
  sortOrder: number;
};

type CatalogReadiness = {
  ready: boolean;
  activeResourceCount: number;
  activeServiceCount: number;
  inactiveResourceCount: number;
  inactiveServiceCount: number;
  missing: Array<"resources" | "services">;
  warnings: string[];
};

type AvailabilityOption = {
  resource: {
    id: string;
    name: string;
    kind: ResourceKind;
    capacity: number;
    location: string | null;
    description: string | null;
  };
  service: {
    id: string;
    name: string;
    durationMinutes: number;
  };
  startsAt: string;
  endsAt: string;
  partySize: number | null;
  priceEstimate: MoneyAmount | null;
  depositDue: (MoneyAmount & { type: DepositType }) | null;
};

type DepositType = "none" | "fixed" | "percentage" | "full";

type MoneyAmount = {
  amountMinor: number;
  currency: string;
  display: string;
};

type ServicePaymentRule = {
  id: string;
  serviceId: string;
  currency: string;
  amountMinor: number | null;
  depositType: DepositType;
  depositAmountMinor: number | null;
  depositPercentage: number | null;
  active: boolean;
};

type ManualPaymentVerification = {
  id: string;
  bookingHoldId: string;
  conversationId: string | null;
  contactId: string | null;
  resourceId: string;
  serviceId: string;
  status:
    | "waiting_for_evidence"
    | "needs_operator_review"
    | "approved"
    | "rejected"
    | "expired"
    | "cancelled";
  expectedAmountMinor: number;
  currency: string;
  customerReferenceRedacted: string | null;
  expiresAt: string;
  createdAt: string;
};

type AiBookingReadiness = {
  ready: boolean;
  liveBookingAllowed: boolean;
  mode: "disabled" | "suggest_only" | "auto_hold" | "manual_payment_confirm";
  checks: Array<{ key: string; ok: boolean; message: string }>;
};

type ResourceCalendarMappingDto = {
  id: string;
  resourceId: string;
  provider: "google";
  calendarIdRedacted: string;
  status: "connected" | "sync_failed" | "disabled";
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

type ResourceBusyBlockDto = {
  id: string;
  resourceId: string;
  source: "google_calendar";
  startsAt: string;
  endsAt: string;
  status: "active" | "cancelled";
  summaryRedacted: string | null;
  createdAt: string;
  updatedAt: string;
};

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

const RESOURCE_KINDS: { value: ResourceKind; label: string }[] = [
  { value: "house", label: "Casa" },
  { value: "cabin", label: "Cabaña" },
  { value: "room", label: "Habitación" },
  { value: "court", label: "Cancha" },
  { value: "football_field", label: "Cancha fútbol" },
  { value: "field", label: "Campo" },
  { value: "chair", label: "Silla" },
  { value: "stylist", label: "Estilista" },
  { value: "therapist", label: "Terapeuta" },
  { value: "staff_member", label: "Profesional" },
  { value: "professional", label: "Especialista" },
  { value: "venue", label: "Local" },
  { value: "vehicle", label: "Vehículo" },
  { value: "table", label: "Mesa" },
  { value: "other", label: "Otro" },
];

export function ReservationsClient() {
  const [items, setItems] = useState<ReservationListItemDto[]>([]);
  const [summary, setSummary] = useState<ReservationListSummaryDto>(emptySummary);
  const [resources, setResources] = useState<CatalogResource[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [catalogReadiness, setCatalogReadiness] = useState<CatalogReadiness | null>(null);
  const [resourceDraft, setResourceDraft] = useState({
    name: "",
    kind: "house" as ResourceKind,
    capacity: "1",
    location: "",
    description: "",
  });
  const [serviceDraft, setServiceDraft] = useState({
    name: "",
    durationMinutes: "60",
    description: "",
  });
  const [availabilitySearch, setAvailabilitySearch] = useState({
    serviceId: "",
    date: nextLocalDate(),
    startTime: "08:00",
    endTime: "20:00",
    partySize: "1",
  });
  const [availabilityOptions, setAvailabilityOptions] = useState<AvailabilityOption[]>([]);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const [res, resourceRes, serviceRes, readinessRes] = await Promise.all([
      fetch("/api/reservations").catch(() => null),
      fetch("/api/reservations/resources").catch(() => null),
      fetch("/api/reservations/services").catch(() => null),
      fetch("/api/reservations/catalog/readiness").catch(() => null),
    ]);
    setLoading(false);
    if (res?.ok) {
      const data = (await res.json()) as {
        reservations: ReservationListItemDto[];
        summary: ReservationListSummaryDto;
      };
      setItems(data.reservations);
      setSummary(data.summary);
    }
    if (resourceRes?.ok) {
      const data = (await resourceRes.json()) as { resources: CatalogResource[] };
      setResources(data.resources);
    }
    if (serviceRes?.ok) {
      const data = (await serviceRes.json()) as { services: CatalogService[] };
      setServices(data.services);
    }
    if (readinessRes?.ok) {
      const data = (await readinessRes.json()) as { readiness: CatalogReadiness };
      setCatalogReadiness(data.readiness);
    }
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

      <BookingAutomationReadinessCard />

      <CatalogPanel
        resources={resources}
        services={services}
        readiness={catalogReadiness}
        resourceDraft={resourceDraft}
        serviceDraft={serviceDraft}
        onResourceDraftChange={setResourceDraft}
        onServiceDraftChange={setServiceDraft}
        onResourcesChange={setResources}
        onServicesChange={setServices}
        onChanged={() => void refetch()}
      />

      <AvailabilityPanel
        services={services}
        search={availabilitySearch}
        options={availabilityOptions}
        message={availabilityMessage}
        onSearchChange={setAvailabilitySearch}
        onOptionsChange={setAvailabilityOptions}
        onMessageChange={setAvailabilityMessage}
      />

      <PaymentRulesPanel services={services} />

      <ManualPaymentVerificationsPanel services={services} resources={resources} />

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

function BookingAutomationReadinessCard() {
  const [readiness, setReadiness] = useState<AiBookingReadiness | null>(null);
  const [pendingVerifications, setPendingVerifications] = useState<ManualPaymentVerification[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const [readinessRes, pendingRes] = await Promise.all([
      fetch("/api/agent/booking-readiness").catch(() => null),
      fetch(
        "/api/payments/manual-verifications?status=needs_operator_review&status=waiting_for_evidence&limit=100"
      ).catch(() => null),
    ]);
    if (!readinessRes?.ok || !pendingRes?.ok) {
      setMessage("No se pudo cargar la preparación de auto-reservas.");
      return;
    }
    const readinessData = (await readinessRes.json()) as { readiness: AiBookingReadiness };
    const pendingData = (await pendingRes.json()) as {
      verifications: ManualPaymentVerification[];
    };
    setReadiness(readinessData.readiness);
    setPendingVerifications(pendingData.verifications);
    setMessage(null);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const queue = useMemo(
    () =>
      buildPendingBookingWorkQueue(
        pendingVerifications.filter(
          (
            verification
          ): verification is ManualPaymentVerification & {
            status: "waiting_for_evidence" | "needs_operator_review";
          } =>
            verification.status === "waiting_for_evidence" ||
            verification.status === "needs_operator_review"
        )
      ),
    [pendingVerifications]
  );
  const summary = useMemo(
    () =>
      buildBookingAutomationReadinessSummary({
        aiBooking: readiness,
        pendingWork: queue.summary,
      }),
    [readiness, queue.summary]
  );

  return (
    <section className="border-b px-6 py-5">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Preparación de auto-reservas</h3>
              <Badge
                variant={
                  summary.status === "ready"
                    ? "success"
                    : summary.status === "blocked"
                      ? "destructive"
                      : "warning"
                }
              >
                {summary.status === "ready"
                  ? "Lista"
                  : summary.status === "blocked"
                    ? "Bloqueada"
                    : "Revisar"}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-text-3">{summary.message}</p>
            {message && <p className="mt-2 text-xs text-destructive">{message}</p>}
          </div>
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>
            Actualizar
          </Button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {summary.checks.map((check) => (
            <div key={check.key} className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{check.label}</p>
                <Badge
                  variant={
                    check.status === "ok"
                      ? "success"
                      : check.status === "blocked"
                        ? "destructive"
                        : check.status === "warning"
                          ? "warning"
                          : "secondary"
                  }
                >
                  {check.status === "ok"
                    ? "OK"
                    : check.status === "blocked"
                      ? "Falta"
                      : check.status === "warning"
                        ? "Revisar"
                        : "Info"}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-3">{check.message}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AvailabilityPanel({
  services,
  search,
  options,
  message,
  onSearchChange,
  onOptionsChange,
  onMessageChange,
}: {
  services: CatalogService[];
  search: {
    serviceId: string;
    date: string;
    startTime: string;
    endTime: string;
    partySize: string;
  };
  options: AvailabilityOption[];
  message: string | null;
  onSearchChange: (value: {
    serviceId: string;
    date: string;
    startTime: string;
    endTime: string;
    partySize: string;
  }) => void;
  onOptionsChange: (options: AvailabilityOption[]) => void;
  onMessageChange: (message: string | null) => void;
}) {
  const activeServices = services.filter((service) => service.active);
  const selectedServiceId = search.serviceId || activeServices[0]?.id || "";

  async function findOptions() {
    if (!selectedServiceId || !search.date || !search.startTime || !search.endTime) {
      onMessageChange("Completa servicio, fecha y horario.");
      return;
    }
    onMessageChange(null);
    const response = await fetch("/api/reservations/availability/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId: selectedServiceId,
        rangeStart: localInputToIso(search.date, search.startTime),
        rangeEnd: localInputToIso(search.date, search.endTime),
        partySize: Number(search.partySize || 1),
        maxOptions: 12,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      onOptionsChange([]);
      onMessageChange("No se pudo buscar disponibilidad.");
      return;
    }
    const data = (await response.json()) as { options: AvailabilityOption[] };
    onOptionsChange(data.options);
    onMessageChange(data.options.length === 0 ? "Sin opciones disponibles para ese rango." : null);
  }

  return (
    <section className="border-b bg-subtle px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Buscar disponibilidad</h3>
          <p className="mt-1 max-w-2xl text-xs text-text-3">
            El CRM calcula opciones reales usando items activos, capacidad,
            horarios, holds y reservas confirmadas.
          </p>
        </div>
      </div>
      <div className="grid gap-2 rounded-md border bg-card p-4 md:grid-cols-[1fr_150px_110px_110px_96px_auto] md:items-end">
        <label className="grid gap-1 text-xs text-text-3">
          Servicio
          <select
            value={selectedServiceId}
            onChange={(e) => onSearchChange({ ...search, serviceId: e.target.value })}
            className="h-10 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            {activeServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-text-3">
          Fecha
          <Input
            type="date"
            value={search.date}
            onChange={(e) => onSearchChange({ ...search, date: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-text-3">
          Desde
          <Input
            type="time"
            value={search.startTime}
            onChange={(e) => onSearchChange({ ...search, startTime: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-text-3">
          Hasta
          <Input
            type="time"
            value={search.endTime}
            onChange={(e) => onSearchChange({ ...search, endTime: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-text-3">
          Personas
          <Input
            inputMode="numeric"
            value={search.partySize}
            onChange={(e) => onSearchChange({ ...search, partySize: e.target.value })}
          />
        </label>
        <Button onClick={() => void findOptions()} disabled={activeServices.length === 0}>
          Buscar
        </Button>
      </div>
      {message && <p className="mt-3 text-xs text-text-3">{message}</p>}
      {options.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => (
            <div
              key={`${option.resource.id}:${option.startsAt}`}
              className="rounded-md border bg-background p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{option.resource.name}</p>
                  <p className="mt-0.5 text-xs text-text-3">
                    {resourceKindLabel(option.resource.kind)} · hasta {option.resource.capacity}
                  </p>
                </div>
                <Badge variant="secondary">{formatTime(option.startsAt)}</Badge>
              </div>
              {option.resource.location && (
                <p className="mt-2 text-xs text-text-3">{option.resource.location}</p>
              )}
              <p className="mt-2 text-xs text-text-3">
                {formatTime(option.startsAt)} a {formatTime(option.endsAt)}
              </p>
              {(option.priceEstimate || option.depositDue) && (
                <div className="mt-3 rounded-md bg-subtle px-2 py-1.5 text-xs text-text-3">
                  {option.priceEstimate && <p>Precio: {option.priceEstimate.display}</p>}
                  {option.depositDue && <p>Seña: {option.depositDue.display}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PaymentRulesPanel({ services }: { services: CatalogService[] }) {
  const activeServices = services.filter((service) => service.active);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [draft, setDraft] = useState({
    currency: "PYG",
    amountMajor: "",
    depositType: "none" as DepositType,
    depositValue: "",
    active: true,
  });
  const [message, setMessage] = useState<string | null>(null);

  const effectiveServiceId = selectedServiceId || activeServices[0]?.id || "";

  useEffect(() => {
    if (!effectiveServiceId) return;
    let cancelled = false;
    async function loadRule() {
      const response = await fetch(
        `/api/reservations/services/${effectiveServiceId}/payment-rule`
      ).catch(() => null);
      if (cancelled) return;
      if (!response?.ok) {
        setMessage("No se pudo cargar la regla de pago.");
        return;
      }
      const data = (await response.json()) as { paymentRule: ServicePaymentRule | null };
      const rule = data.paymentRule;
      setDraft({
        currency: rule?.currency ?? "PYG",
        amountMajor: rule?.amountMinor == null ? "" : String(rule.amountMinor),
        depositType: rule?.depositType ?? "none",
        depositValue:
          rule?.depositType === "percentage"
            ? String(rule.depositPercentage ?? "")
            : rule?.depositType === "fixed"
              ? String(rule.depositAmountMinor ?? "")
              : "",
        active: rule?.active ?? true,
      });
      setMessage(null);
    }
    void loadRule();
    return () => {
      cancelled = true;
    };
  }, [effectiveServiceId]);

  async function saveRule() {
    if (!effectiveServiceId) {
      setMessage("Agrega un servicio primero.");
      return;
    }
    const response = await fetch(
      `/api/reservations/services/${effectiveServiceId}/payment-rule`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currency: draft.currency,
          amountMinor: draft.amountMajor === "" ? null : Number(draft.amountMajor),
          depositType: draft.depositType,
          depositAmountMinor:
            draft.depositType === "fixed" && draft.depositValue !== ""
              ? Number(draft.depositValue)
              : null,
          depositPercentage:
            draft.depositType === "percentage" && draft.depositValue !== ""
              ? Number(draft.depositValue)
              : null,
          active: draft.active,
        }),
      }
    ).catch(() => null);
    if (!response?.ok) {
      setMessage("No se pudo guardar. Revisa precio y seña.");
      return;
    }
    setMessage("Regla de pago guardada.");
  }

  return (
    <section className="border-b px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Reglas de pago</h3>
          <p className="mt-1 max-w-2xl text-xs text-text-3">
            Define el precio y la seña por servicio. El CRM calcula el monto; la IA
            solo comunica ese resultado.
          </p>
        </div>
        <Badge variant="secondary">CRM decide montos</Badge>
      </div>
      <div className="grid gap-2 rounded-md border bg-card p-4 md:grid-cols-[1fr_92px_150px_130px_auto] md:items-end">
        <label className="grid gap-1 text-xs text-text-3">
          Servicio
          <select
            value={effectiveServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="h-10 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            {activeServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-text-3">
          Moneda
          <Input
            value={draft.currency}
            onChange={(e) =>
              setDraft({ ...draft, currency: e.target.value.toUpperCase().slice(0, 3) })
            }
          />
        </label>
        <label className="grid gap-1 text-xs text-text-3">
          Precio
          <Input
            inputMode="numeric"
            placeholder="500000"
            value={draft.amountMajor}
            onChange={(e) => setDraft({ ...draft, amountMajor: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-xs text-text-3">
          Seña
          <select
            value={draft.depositType}
            onChange={(e) =>
              setDraft({
                ...draft,
                depositType: e.target.value as DepositType,
                depositValue: "",
              })
            }
            className="h-10 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value="none">Sin seña</option>
            <option value="percentage">Porcentaje</option>
            <option value="fixed">Monto fijo</option>
            <option value="full">Pago total</option>
          </select>
        </label>
        <Button onClick={() => void saveRule()} disabled={activeServices.length === 0}>
          Guardar pago
        </Button>
        {(draft.depositType === "percentage" || draft.depositType === "fixed") && (
          <label className="grid gap-1 text-xs text-text-3 md:col-start-4">
            {draft.depositType === "percentage" ? "Porcentaje de seña" : "Monto de seña"}
            <Input
              inputMode="numeric"
              placeholder={draft.depositType === "percentage" ? "30" : "150000"}
              value={draft.depositValue}
              onChange={(e) => setDraft({ ...draft, depositValue: e.target.value })}
            />
          </label>
        )}
      </div>
      {message && <p className="mt-3 text-xs text-text-3">{message}</p>}
    </section>
  );
}

function ManualPaymentVerificationsPanel({
  services,
  resources,
}: {
  services: CatalogService[];
  resources: CatalogResource[];
}) {
  const [verifications, setVerifications] = useState<ManualPaymentVerification[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const queue = useMemo(
    () =>
      buildPendingBookingWorkQueue(
        verifications.filter(
          (
            verification
          ): verification is ManualPaymentVerification & {
            status: "waiting_for_evidence" | "needs_operator_review";
          } =>
            verification.status === "waiting_for_evidence" ||
            verification.status === "needs_operator_review"
        )
      ),
    [verifications]
  );

  const loadVerifications = useCallback(async () => {
    const response = await fetch(
      "/api/payments/manual-verifications?status=needs_operator_review&status=waiting_for_evidence&limit=10"
    ).catch(() => null);
    if (!response?.ok) {
      setMessage("No se pudieron cargar los pagos pendientes.");
      return;
    }
    const data = (await response.json()) as {
      verifications: ManualPaymentVerification[];
    };
    setVerifications(data.verifications);
    setMessage(null);
  }, []);

  useEffect(() => {
    void loadVerifications();
  }, [loadVerifications]);

  async function decide(id: string, action: "approve" | "reject") {
    const response = await fetch(`/api/payments/manual-verifications/${id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        action === "approve"
          ? { note: "Confirmado desde Reservas CRM" }
          : { reason: "not_received", note: "Marcado como no recibido" }
      ),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(
        action === "approve"
          ? "No se pudo confirmar. El hold puede haber expirado."
          : "No se pudo rechazar el pago."
      );
      return;
    }
    await loadVerifications();
  }

  return (
    <section className="border-b bg-subtle px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Trabajo pendiente de reservas</h3>
          <p className="mt-1 max-w-2xl text-xs text-text-3">
            Prioriza pagos por revisar, comprobantes faltantes y holds que están por vencer.
            Solo el botón Sí puede convertir un hold en reserva.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void loadVerifications()}>
          Actualizar
        </Button>
      </div>
      <div className="mb-4 grid gap-2 md:grid-cols-4">
        <QueueMetric label="Total pendiente" value={queue.summary.total} />
        <QueueMetric label="Revisar pago" value={queue.summary.needsReview} />
        <QueueMetric label="Falta comprobante" value={queue.summary.waitingForEvidence} />
        <QueueMetric
          label="Sin atender"
          value={queue.summary.stale}
          tone={queue.summary.stale > 0 ? "warning" : "neutral"}
        />
        <QueueMetric
          label="Urgentes/vencidos"
          value={queue.summary.urgent + queue.summary.expired}
          tone={queue.summary.urgent + queue.summary.expired > 0 ? "warning" : "neutral"}
        />
      </div>
      {message && <p className="mb-3 text-xs text-text-3">{message}</p>}
      {queue.items.length === 0 ? (
        <p className="rounded-md border border-dashed bg-card py-6 text-center text-xs text-text-3">
          Sin trabajo pendiente de reservas.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {queue.items.map((workItem) => {
            const verification = verifications.find((item) => item.id === workItem.id);
            if (!verification) return null;
            const resource = resources.find((item) => item.id === verification.resourceId);
            const service = services.find((item) => item.id === verification.serviceId);
            const canDecide = verification.status === "needs_operator_review";
            const inboxAction =
              verification.status === "waiting_for_evidence" ||
              verification.status === "needs_operator_review"
                ? buildBookingWorkQueueInboxAction({
                    conversationId: verification.conversationId,
                    status: verification.status,
                  })
                : null;
            return (
              <div key={verification.id} className="rounded-md border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {resource?.name ?? verification.resourceId}
                    </p>
                    <p className="mt-0.5 text-xs text-text-3">
                      {service?.name ?? verification.serviceId}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge
                      variant={
                        workItem.level === "expired"
                          ? "destructive"
                          : workItem.level === "waiting"
                            ? "secondary"
                            : "warning"
                      }
                    >
                      {workItem.label}
                    </Badge>
                    <Badge variant="secondary">{formatMoneyMinor(verification)}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs text-text-3">
                  {workItem.actionText}
                </p>
                {verification.customerReferenceRedacted && (
                  <p className="mt-1 truncate text-xs text-text-3">
                    Ref: {verification.customerReferenceRedacted}
                  </p>
                )}
                <p className="mt-1 text-xs text-text-3">
                  Expira: {formatDateTime(verification.expiresAt)}
                </p>
                {canDecide ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => void decide(verification.id, "approve")}>
                      Sí, recibido
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void decide(verification.id, "reject")}
                    >
                      No
                    </Button>
                    {inboxAction && (
                      <QueueLinkButton href={inboxAction.href} title={inboxAction.title}>
                        {inboxAction.label}
                      </QueueLinkButton>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="rounded-md bg-subtle px-2 py-1.5 text-xs text-text-3">
                      Esperando comprobante del cliente.
                    </p>
                    {inboxAction && (
                      <QueueLinkButton href={inboxAction.href} title={inboxAction.title}>
                        {inboxAction.label}
                      </QueueLinkButton>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QueueLinkButton({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className="inline-flex h-8 items-center justify-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </Link>
  );
}

function QueueMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-md border border-[#ece2cf] bg-[#faf7f0] p-3"
          : "rounded-md border bg-card p-3"
      }
    >
      <p className="text-[11px] uppercase tracking-wide text-text-3">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function CatalogPanel({
  resources,
  services,
  readiness,
  resourceDraft,
  serviceDraft,
  onResourceDraftChange,
  onServiceDraftChange,
  onResourcesChange,
  onServicesChange,
  onChanged,
}: {
  resources: CatalogResource[];
  services: CatalogService[];
  readiness: CatalogReadiness | null;
  resourceDraft: {
    name: string;
    kind: ResourceKind;
    capacity: string;
    location: string;
    description: string;
  };
  serviceDraft: { name: string; durationMinutes: string; description: string };
  onResourceDraftChange: (value: {
    name: string;
    kind: ResourceKind;
    capacity: string;
    location: string;
    description: string;
  }) => void;
  onServiceDraftChange: (value: {
    name: string;
    durationMinutes: string;
    description: string;
  }) => void;
  onResourcesChange: (resources: CatalogResource[]) => void;
  onServicesChange: (services: CatalogService[]) => void;
  onChanged: () => void;
}) {
  async function addResource() {
    if (!resourceDraft.name.trim()) return;
    const response = await fetch("/api/reservations/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: resourceDraft.name,
        kind: resourceDraft.kind,
        capacity: Number(resourceDraft.capacity || 1),
        location: resourceDraft.location || null,
        description: resourceDraft.description || null,
      }),
    }).catch(() => null);
    if (!response?.ok) return;
    onResourceDraftChange({
      name: "",
      kind: resourceDraft.kind,
      capacity: "1",
      location: "",
      description: "",
    });
    onChanged();
  }

  async function addService() {
    if (!serviceDraft.name.trim()) return;
    const response = await fetch("/api/reservations/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: serviceDraft.name,
        durationMinutes: Number(serviceDraft.durationMinutes || 60),
        description: serviceDraft.description || null,
      }),
    }).catch(() => null);
    if (!response?.ok) return;
    onServiceDraftChange({ name: "", durationMinutes: "60", description: "" });
    onChanged();
  }

  async function saveResource(resource: CatalogResource) {
    await fetch(`/api/reservations/resources/${resource.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: resource.name,
        description: resource.description,
        kind: resource.kind,
        location: resource.location,
        capacity: resource.capacity,
        sortOrder: resource.sortOrder,
      }),
    }).catch(() => null);
    onChanged();
  }

  async function saveService(service: CatalogService) {
    await fetch(`/api/reservations/services/${service.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        sortOrder: service.sortOrder,
      }),
    }).catch(() => null);
    onChanged();
  }

  async function toggleResource(resource: CatalogResource) {
    await fetch(
      `/api/reservations/resources/${resource.id}/${resource.active ? "disable" : "enable"}`,
      { method: "POST" }
    ).catch(() => null);
    onChanged();
  }

  async function toggleService(service: CatalogService) {
    await fetch(
      `/api/reservations/services/${service.id}/${service.active ? "disable" : "enable"}`,
      { method: "POST" }
    ).catch(() => null);
    onChanged();
  }

  return (
    <section className="border-b px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4 text-brand" />
            Catálogo de reservas
          </h3>
          <p className="mt-1 max-w-2xl text-xs text-text-3">
            Agrega lo que el negocio vende y los items que se pueden reservar.
          </p>
        </div>
        {readiness && (
          <Badge variant={readiness.ready ? "success" : "warning"}>
            {readiness.ready ? "Catálogo listo" : "Falta configuración"}
          </Badge>
        )}
      </div>

      {readiness && !readiness.ready && (
        <div className="mb-4 rounded-md border border-[#ece2cf] bg-[#faf7f0] px-3 py-2 text-xs text-[#8a6d3b]">
          {readiness.missing.includes("resources") && <span>Agrega al menos un item reservable. </span>}
          {readiness.missing.includes("services") && <span>Agrega al menos un servicio. </span>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium">Items reservables</h4>
            <span className="text-xs text-text-3">
              {readiness?.activeResourceCount ?? 0} activos
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_160px_96px]">
            <Input
              placeholder="Casa 3, Cancha 1, Ana"
              value={resourceDraft.name}
              onChange={(e) =>
                onResourceDraftChange({ ...resourceDraft, name: e.target.value })
              }
            />
            <select
              value={resourceDraft.kind}
              onChange={(e) =>
                onResourceDraftChange({
                  ...resourceDraft,
                  kind: e.target.value as ResourceKind,
                })
              }
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              {RESOURCE_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
            <Input
              inputMode="numeric"
              placeholder="Cap."
              value={resourceDraft.capacity}
              onChange={(e) =>
                onResourceDraftChange({ ...resourceDraft, capacity: e.target.value })
              }
            />
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="Ubicación"
              value={resourceDraft.location}
              onChange={(e) =>
                onResourceDraftChange({ ...resourceDraft, location: e.target.value })
              }
            />
            <Button size="sm" onClick={() => void addResource()}>
              <Plus className="h-4 w-4" />
              Agregar item
            </Button>
          </div>
          <Input
            placeholder="Descripción para clientes"
            value={resourceDraft.description}
            onChange={(e) =>
              onResourceDraftChange({ ...resourceDraft, description: e.target.value })
            }
            className="mt-2"
          />
          <div className="mt-3 space-y-2">
            {resources.map((resource) => (
              <ResourceEditor
                key={resource.id}
                resource={resource}
                onChange={(next) =>
                  onResourcesChange(
                    resources.map((item) => (item.id === next.id ? next : item))
                  )
                }
                onSave={() => void saveResource(resource)}
                onToggle={() => void toggleResource(resource)}
              />
            ))}
            {resources.length === 0 && (
              <p className="rounded-md border border-dashed py-6 text-center text-xs text-text-3">
                Sin items todavía.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium">Servicios</h4>
            <span className="text-xs text-text-3">
              {readiness?.activeServiceCount ?? 0} activos
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_112px_auto]">
            <Input
              placeholder="Estadía, masaje 60 min, corte"
              value={serviceDraft.name}
              onChange={(e) =>
                onServiceDraftChange({ ...serviceDraft, name: e.target.value })
              }
            />
            <Input
              inputMode="numeric"
              placeholder="Minutos"
              value={serviceDraft.durationMinutes}
              onChange={(e) =>
                onServiceDraftChange({
                  ...serviceDraft,
                  durationMinutes: e.target.value,
                })
              }
            />
            <Button size="sm" onClick={() => void addService()}>
              <Plus className="h-4 w-4" />
              Agregar servicio
            </Button>
          </div>
          <Input
            placeholder="Descripción para clientes"
            value={serviceDraft.description}
            onChange={(e) =>
              onServiceDraftChange({ ...serviceDraft, description: e.target.value })
            }
            className="mt-2"
          />
          <div className="mt-3 space-y-2">
            {services.map((service) => (
              <ServiceEditor
                key={service.id}
                service={service}
                onChange={(next) =>
                  onServicesChange(
                    services.map((item) => (item.id === next.id ? next : item))
                  )
                }
                onSave={() => void saveService(service)}
                onToggle={() => void toggleService(service)}
              />
            ))}
            {services.length === 0 && (
              <p className="rounded-md border border-dashed py-6 text-center text-xs text-text-3">
                Sin servicios todavía.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ResourceEditor({
  resource,
  onChange,
  onSave,
  onToggle,
}: {
  resource: CatalogResource;
  onChange: (resource: CatalogResource) => void;
  onSave: () => void;
  onToggle: () => void;
}) {
  const [calendarId, setCalendarId] = useState("");
  const [mapping, setMapping] = useState<ResourceCalendarMappingDto | null>(null);
  const [busyBlocks, setBusyBlocks] = useState<ResourceBusyBlockDto[]>([]);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const loadCalendarState = useCallback(async () => {
    setCalendarLoading(true);
    const [mappingResponse, blocksResponse] = await Promise.all([
      fetch(`/api/reservations/resources/${resource.id}/calendar-mapping`).catch(() => null),
      fetch(`/api/reservations/resources/${resource.id}/busy-blocks?status=active`).catch(
        () => null
      ),
    ]);
    setCalendarLoading(false);
    if (mappingResponse?.ok) {
      const data = (await mappingResponse.json()) as {
        mapping: ResourceCalendarMappingDto | null;
      };
      setMapping(data.mapping);
      setCalendarId("");
    }
    if (blocksResponse?.ok) {
      const data = (await blocksResponse.json()) as { busyBlocks: ResourceBusyBlockDto[] };
      setBusyBlocks(data.busyBlocks.slice(0, 5));
    }
  }, [resource.id]);

  useEffect(() => {
    void loadCalendarState();
  }, [loadCalendarState]);

  async function saveCalendarMapping(status: "connected" | "disabled" = "connected") {
    const value = calendarId.trim();
    if (status === "connected" && !value) {
      setCalendarMessage("Agrega el ID del calendario para este item.");
      return;
    }
    const response = await fetch(`/api/reservations/resources/${resource.id}/calendar-mapping`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(value ? { calendarId: value } : {}),
        status,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      setCalendarMessage("No se pudo guardar el calendario.");
      return;
    }
    const data = (await response.json()) as { mapping: ResourceCalendarMappingDto };
    setMapping(data.mapping);
    setCalendarId("");
    setCalendarMessage(
      status === "disabled" ? "Calendario desactivado." : "Calendario conectado al item."
    );
  }

  return (
    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_150px_88px_auto_auto] md:items-center">
      <Input
        value={resource.name}
        onChange={(e) => onChange({ ...resource, name: e.target.value })}
      />
      <select
        value={resource.kind}
        onChange={(e) => onChange({ ...resource, kind: e.target.value as ResourceKind })}
        className="h-10 rounded-md border bg-background px-2 text-sm"
      >
        {RESOURCE_KINDS.map((kind) => (
          <option key={kind.value} value={kind.value}>
            {kind.label}
          </option>
        ))}
      </select>
      <Input
        inputMode="numeric"
        value={String(resource.capacity)}
        onChange={(e) =>
          onChange({ ...resource, capacity: Number(e.target.value || 1) })
        }
      />
      <Button size="sm" variant="secondary" onClick={onSave}>
        Guardar
      </Button>
      <Button size="sm" variant={resource.active ? "ghost" : "secondary"} onClick={onToggle}>
        {resource.active ? "Pausar" : "Activar"}
      </Button>
      <Input
        value={resource.description ?? ""}
        placeholder="Descripción para clientes"
        onChange={(e) => onChange({ ...resource, description: e.target.value })}
        className="md:col-span-5"
      />
      <div className="rounded-md border bg-subtle p-3 md:col-span-5">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium">Google Calendar del item</p>
            <p className="mt-0.5 text-xs text-text-3">
              Bloqueos importados afectan disponibilidad; el CRM sigue decidiendo reservas.
            </p>
          </div>
          <MappingBadge mapping={mapping} />
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <Input
            placeholder="primary o calendario@empresa.com"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void saveCalendarMapping("connected")}
          >
            Guardar calendario
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void saveCalendarMapping("disabled")}
            disabled={!mapping}
          >
            Desactivar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadCalendarState()}
            disabled={calendarLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Ver bloqueos
          </Button>
        </div>
        {mapping && (
          <p className="mt-2 text-xs text-text-3">
            Calendario: {mapping.calendarIdRedacted}
            {mapping.lastSyncedAt ? ` · última sync ${formatDateTime(mapping.lastSyncedAt)}` : ""}
            {mapping.lastErrorCode ? ` · error ${mapping.lastErrorCode}` : ""}
          </p>
        )}
        {calendarMessage && <p className="mt-2 text-xs text-text-3">{calendarMessage}</p>}
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {busyBlocks.map((block) => (
            <div key={block.id} className="rounded-md border bg-card px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{formatDateTime(block.startsAt)}</span>
                <Badge variant={block.status === "active" ? "secondary" : "warning"}>
                  {block.status === "active" ? "Bloqueado" : "Cancelado"}
                </Badge>
              </div>
              <p className="mt-1 text-text-3">hasta {formatDateTime(block.endsAt)}</p>
              {block.summaryRedacted && (
                <p className="mt-1 truncate text-text-3">{block.summaryRedacted}</p>
              )}
            </div>
          ))}
          {busyBlocks.length === 0 && (
            <p className="rounded-md border border-dashed bg-card py-4 text-center text-xs text-text-3 md:col-span-2">
              Sin bloqueos importados activos todavía.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MappingBadge({ mapping }: { mapping: ResourceCalendarMappingDto | null }) {
  if (!mapping) return <Badge variant="secondary">Sin calendario</Badge>;
  if (mapping.status === "connected") return <Badge variant="success">Conectado</Badge>;
  if (mapping.status === "sync_failed") return <Badge variant="warning">Sync falló</Badge>;
  return <Badge variant="secondary">Desactivado</Badge>;
}

function ServiceEditor({
  service,
  onChange,
  onSave,
  onToggle,
}: {
  service: CatalogService;
  onChange: (service: CatalogService) => void;
  onSave: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_96px_auto_auto] md:items-center">
      <Input
        value={service.name}
        onChange={(e) => onChange({ ...service, name: e.target.value })}
      />
      <Input
        inputMode="numeric"
        value={String(service.durationMinutes)}
        onChange={(e) =>
          onChange({ ...service, durationMinutes: Number(e.target.value || 60) })
        }
      />
      <Button size="sm" variant="secondary" onClick={onSave}>
        Guardar
      </Button>
      <Button size="sm" variant={service.active ? "ghost" : "secondary"} onClick={onToggle}>
        {service.active ? "Pausar" : "Activar"}
      </Button>
      <Input
        value={service.description ?? ""}
        placeholder="Descripción para clientes"
        onChange={(e) => onChange({ ...service, description: e.target.value })}
        className="md:col-span-4"
      />
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

function formatMoneyMinor(value: { expectedAmountMinor: number; currency: string }): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: value.currency === "PYG" ? 0 : 2,
  }).format(value.expectedAmountMinor);
}

function localInputToIso(localDate: string, localTime: string): string {
  return new Date(`${localDate}T${localTime}:00`).toISOString();
}

function nextLocalDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function resourceKindLabel(kind: ResourceKind): string {
  return RESOURCE_KINDS.find((item) => item.value === kind)?.label ?? "Item";
}
