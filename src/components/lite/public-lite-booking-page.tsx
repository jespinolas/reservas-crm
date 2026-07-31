"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PublicResource = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  location: string | null;
  capacity: number;
};

type PublicService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceEstimate: { display: string } | null;
  depositDue: { display: string } | null;
};

type PublicCatalog = {
  business: { name: string; slug: string };
  resources: PublicResource[];
  services: PublicService[];
  copy: { boundary: string; noAutomation: string };
};

export function PublicLiteBookingPage({ slug }: { slug: string }) {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    serviceId: "",
    resourceId: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    partySize: "1",
    date: nextDate(),
    time: "09:00",
    customerNote: "",
    website: "",
  });

  useEffect(() => {
    fetch(`/api/public/lite/${slug}/catalog`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: PublicCatalog | null) => {
        setCatalog(data);
        setForm((current) => ({
          ...current,
          serviceId: current.serviceId || data?.services[0]?.id || "",
          resourceId: current.resourceId || data?.resources[0]?.id || "",
        }));
      })
      .catch(() => setCatalog(null));
  }, [slug]);

  const selectedService = useMemo(
    () => catalog?.services.find((service) => service.id === form.serviceId) ?? null,
    [catalog, form.serviceId]
  );

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    const startsAt = new Date(`${form.date}T${form.time}:00`);
    const response = await fetch(`/api/public/lite/${slug}/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId: form.serviceId,
        resourceId: form.resourceId || null,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || null,
        partySize: Number(form.partySize),
        startsAt: startsAt.toISOString(),
        customerNote: form.customerNote || null,
        website: form.website,
      }),
    }).catch(() => null);
    setSubmitting(false);
    if (!response?.ok) {
      setMessage("No se pudo enviar la solicitud. Revisá los datos e intentá de nuevo.");
      return;
    }
    setMessage("Solicitud recibida. El negocio la confirma manualmente.");
    setForm((current) => ({
      ...current,
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerNote: "",
    }));
  }

  if (!catalog) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-text-3">Cargando página de reservas…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Reservas Manual Lite
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{catalog.business.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-3">
          Elegí lo que necesitás y dejá tus datos. {catalog.copy.boundary}
        </p>
        <p className="mt-1 text-xs text-text-3">{catalog.copy.noAutomation}</p>
      </section>

      <section className="mt-5 grid gap-5 rounded-2xl border bg-card p-6 md:grid-cols-2">
        <label className="text-sm font-medium">
          Servicio
          <select
            className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={form.serviceId}
            onChange={(event) => setForm({ ...form, serviceId: event.target.value })}
          >
            {catalog.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
          {selectedService && (
            <span className="mt-1 block text-xs text-text-3">
              {selectedService.durationMinutes} min
              {selectedService.priceEstimate ? ` · ${selectedService.priceEstimate.display}` : ""}
              {selectedService.depositDue ? ` · seña ${selectedService.depositDue.display}` : ""}
            </span>
          )}
        </label>

        <label className="text-sm font-medium">
          Recurso / persona / lugar
          <select
            className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={form.resourceId}
            onChange={(event) => setForm({ ...form, resourceId: event.target.value })}
          >
            <option value="">Que el negocio sugiera</option>
            {catalog.resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name} · capacidad {resource.capacity}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          Fecha
          <Input
            type="date"
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            className="mt-1"
          />
        </label>

        <label className="text-sm font-medium">
          Hora
          <Input
            type="time"
            value={form.time}
            onChange={(event) => setForm({ ...form, time: event.target.value })}
            className="mt-1"
          />
        </label>

        <label className="text-sm font-medium">
          Personas
          <Input
            type="number"
            min="1"
            value={form.partySize}
            onChange={(event) => setForm({ ...form, partySize: event.target.value })}
            className="mt-1"
          />
        </label>

        <label className="text-sm font-medium">
          Nombre
          <Input
            value={form.customerName}
            onChange={(event) => setForm({ ...form, customerName: event.target.value })}
            className="mt-1"
          />
        </label>

        <label className="text-sm font-medium">
          WhatsApp
          <Input
            value={form.customerPhone}
            onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
            className="mt-1"
          />
        </label>

        <label className="text-sm font-medium">
          Email opcional
          <Input
            type="email"
            value={form.customerEmail}
            onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
            className="mt-1"
          />
        </label>

        <label className="hidden">
          Website
          <input
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
          />
        </label>

        <label className="text-sm font-medium md:col-span-2">
          Nota opcional
          <textarea
            value={form.customerNote}
            onChange={(event) => setForm({ ...form, customerNote: event.target.value })}
            className="mt-1 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="md:col-span-2">
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </Button>
          {message && <p className="mt-3 text-sm text-text-3">{message}</p>}
        </div>
      </section>
    </main>
  );
}

function nextDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}
