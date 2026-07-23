"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Clock, TriangleAlert } from "lucide-react";
import type {
  ConversationDto,
  ReservationResourceDto,
  ReservationServiceDto,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildReservationHoldPayload } from "./reservation-hold-form";

type HoldResponse = {
  hold: {
    id: string;
    startsAt: string;
    endsAt: string;
    expiresAt: string;
  };
};

export function ReservationHoldCard({
  conversation,
}: {
  conversation: ConversationDto;
}) {
  const [resources, setResources] = useState<ReservationResourceDto[]>([]);
  const [services, setServices] = useState<ReservationServiceDto[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [localDate, setLocalDate] = useState(() => todayInputValue());
  const [localTime, setLocalTime] = useState(() => nextHourInputValue());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<
    | { tone: "success"; text: string }
    | { tone: "error"; text: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch("/api/reservations/resources").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/reservations/services").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([resourceData, serviceData]) => {
        if (cancelled) return;
        const nextResources = resourceData?.resources ?? [];
        const nextServices = serviceData?.services ?? [];
        setResources(nextResources);
        setServices(nextServices);
        setResourceId((current) => current || nextResources[0]?.id || "");
        setServiceId((current) => current || nextServices[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text: "No se pudo cargar el catálogo de reservas.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveResourceId = resourceId || resources[0]?.id || "";
  const effectiveServiceId = serviceId || services[0]?.id || "";
  const selectedService = useMemo(
    () => services.find((service) => service.id === effectiveServiceId) ?? null,
    [effectiveServiceId, services]
  );

  async function createHold() {
    setMessage(null);
    setSubmitting(true);
    try {
      const payload = buildReservationHoldPayload(
        {
          conversationId: conversation.id,
          contactId: conversation.contact.id,
          resourceId: effectiveResourceId,
          serviceId: effectiveServiceId,
          localDate,
          localTime,
        },
        services
      );
      const response = await fetch("/api/reservations/holds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | HoldResponse
        | { error?: { code?: string; message?: string } }
        | null;
      if (!response.ok) {
        setMessage({
          tone: "error",
          text: errorText(data && "error" in data ? data : null),
        });
        return;
      }
      const hold = (data as HoldResponse).hold;
      setMessage({
        tone: "success",
        text: `Hold ${hold.id} creado hasta ${formatDateTime(hold.expiresAt)}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? localErrorText(error.message) : "No se pudo crear el hold.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const disabled =
    loading ||
    submitting ||
    resources.length === 0 ||
    services.length === 0 ||
    !effectiveResourceId ||
    !effectiveServiceId ||
    !localDate ||
    !localTime;

  return (
    <section className="border-b p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-brand" strokeWidth={1.8} />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
          Crear hold
        </p>
      </div>

      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-3">Recurso</span>
          <select
            value={resourceId}
            disabled={loading || resources.length === 0}
            onChange={(event) => setResourceId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {resources.length === 0 ? (
              <option value="">Sin recursos activos</option>
            ) : (
              resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-text-3">Servicio</span>
          <select
            value={serviceId}
            disabled={loading || services.length === 0}
            onChange={(event) => setServiceId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {services.length === 0 ? (
              <option value="">Sin servicios activos</option>
            ) : (
              services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-3">Fecha</span>
            <Input
              type="date"
              value={localDate}
              onChange={(event) => setLocalDate(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-3">Hora</span>
            <Input
              type="time"
              value={localTime}
              onChange={(event) => setLocalTime(event.target.value)}
            />
          </label>
        </div>

        {selectedService && (
          <p className="flex items-center gap-1.5 text-[11px] text-text-3">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.7} />
            Duración: {selectedService.durationMinutes} minutos
          </p>
        )}

        <Button className="w-full" size="sm" disabled={disabled} onClick={() => void createHold()}>
          {submitting ? "Creando…" : "Crear hold"}
        </Button>

        {message && (
          <div
            className={
              message.tone === "success"
                ? "rounded-md border border-[#d8e8dd] bg-[#eff7f1] p-2.5 text-[12px] text-[#3f6b52]"
                : "rounded-md border border-[#ecd4d2] bg-[#faf1f0] p-2.5 text-[12px] text-[#a2504c]"
            }
          >
            <span className="flex items-start gap-1.5">
              {message.tone === "error" && (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              )}
              <span>{message.text}</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function nextHourInputValue(): string {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const hours = String(next.getHours()).padStart(2, "0");
  return `${hours}:00`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorText(data: { error?: { code?: string; message?: string } } | null): string {
  if (data?.error?.code === "booking_conflict") return "Ese horario ya no está disponible.";
  if (data?.error?.code === "contact_not_found") return "El contacto ya no existe.";
  if (data?.error?.code === "resource_not_found") return "El recurso ya no está activo.";
  if (data?.error?.code === "service_not_found") return "El servicio ya no está activo.";
  return data?.error?.message ?? "No se pudo crear el hold.";
}

function localErrorText(code: string): string {
  if (code === "time_required") return "Elegí fecha y hora.";
  if (code === "resource_required") return "Elegí un recurso.";
  if (code === "service_not_found") return "Elegí un servicio.";
  if (code === "invalid_time") return "La fecha u hora no es válida.";
  return "No se pudo crear el hold.";
}
