"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type LiteStatus =
  | "new"
  | "needs_reply"
  | "waiting_for_customer"
  | "waiting_for_payment"
  | "confirmed"
  | "declined"
  | "expired";

type PaymentStatus =
  | "not_required"
  | "requested"
  | "evidence_received"
  | "approved"
  | "rejected"
  | "expired";

type LiteRequest = {
  id: string;
  status: LiteStatus;
  customerName: string;
  customerPhone: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  customerNote: string | null;
  paymentStatus: PaymentStatus;
  paymentExpectedAmountMinor: number | null;
  paymentCurrency: string;
  paymentInstructions: string | null;
  paymentEvidenceRedacted: string | null;
  reservationId: string | null;
  resource: { name: string; capacity: number } | null;
  service: { name: string; durationMinutes: number };
  duplicateRisk: boolean;
};

type HandoffTemplate = {
  body: string;
  waMeUrl: string | null;
  disclaimer: string;
};

const statuses: { value: LiteStatus | "all"; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "new", label: "Nuevas" },
  { value: "waiting_for_payment", label: "Esperando seña" },
  { value: "confirmed", label: "Confirmadas" },
  { value: "declined", label: "Declinadas" },
];

export function LiteRequestsClient() {
  const [requests, setRequests] = useState<LiteRequest[]>([]);
  const [filter, setFilter] = useState<LiteStatus | "all">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<Record<string, string>>({});
  const [templateById, setTemplateById] = useState<Record<string, HandoffTemplate | null>>({});

  const refetch = useCallback(async () => {
    const response = await fetch("/api/lite/requests?limit=200").catch(() => null);
    if (!response?.ok) {
      setMessage("No se pudieron cargar las solicitudes Lite.");
      return;
    }
    const data = (await response.json()) as { requests: LiteRequest[] };
    setRequests(data.requests);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const filtered = useMemo(
    () => requests.filter((request) => filter === "all" || request.status === filter),
    [filter, requests]
  );

  async function action(id: string, path: string, body?: unknown) {
    setMessage(null);
    const response = await fetch(`/api/lite/requests/${id}/${path}`, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    if (!response?.ok) {
      const payload = response ? await response.json().catch(() => null) : null;
      setMessage(payload?.error?.message ?? "No se pudo completar la acción.");
      return;
    }
    await refetch();
  }

  async function loadTemplate(id: string, kind: string) {
    const response = await fetch(`/api/lite/requests/${id}/handoff?kind=${kind}`).catch(
      () => null
    );
    if (!response?.ok) return;
    const data = (await response.json()) as { template: HandoffTemplate };
    setTemplateById((current) => ({ ...current, [id]: data.template }));
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h2 className="font-semibold">Lite Manual</h2>
        <p className="mt-1 text-xs text-text-3">
          Bandeja de solicitudes, respuestas para WhatsApp personal, pagos manuales y
          confirmación sin API ni AI.
        </p>
      </header>

      <section className="border-b bg-subtle px-6 py-4">
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => (
            <Button
              key={status.value}
              size="sm"
              variant={filter === status.value ? "secondary" : "ghost"}
              onClick={() => setFilter(status.value)}
            >
              {status.label}
            </Button>
          ))}
        </div>
        {message && <p className="mt-3 text-sm text-destructive">{message}</p>}
      </section>

      <main className="min-h-0 flex-1 overflow-auto p-6">
        <div className="grid gap-4">
          {filtered.map((request) => {
            const template = templateById[request.id];
            return (
              <article key={request.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{request.customerName}</h3>
                      <Badge variant={request.status === "confirmed" ? "success" : "secondary"}>
                        {request.status}
                      </Badge>
                      {request.duplicateRisk && (
                        <Badge variant="destructive">Riesgo de duplicado</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-text-3">
                      {request.service.name}
                      {request.resource ? ` · ${request.resource.name}` : ""} ·{" "}
                      {new Date(request.startsAt).toLocaleString("es-PY")} ·{" "}
                      {request.partySize} persona(s)
                    </p>
                    <p className="mt-1 text-xs text-text-3">
                      WhatsApp: {request.customerPhone}
                      {request.customerNote ? ` · Nota: ${request.customerNote}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void loadTemplate(request.id, "request_received")}
                    >
                      Respuesta
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void loadTemplate(request.id, "payment_request")}
                    >
                      Pedir seña
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void action(request.id, "confirm")}
                      disabled={request.status === "confirmed"}
                    >
                      Confirmar
                    </Button>
                    {request.reservationId && (
                      <a
                        className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                        href={`/api/lite/reservations/${request.reservationId}/ics`}
                      >
                        .ics
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 rounded-md border bg-background p-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold">Pago</p>
                    <p className="mt-1 text-xs text-text-3">
                      {request.paymentStatus}
                      {request.paymentExpectedAmountMinor
                        ? ` · ${formatMoney(
                            request.paymentExpectedAmountMinor,
                            request.paymentCurrency
                          )}`
                        : ""}
                    </p>
                  </div>
                  <Input
                    placeholder="Monto seña en minor units, ej. 150000"
                    value={paymentDraft[request.id] ?? ""}
                    onChange={(event) =>
                      setPaymentDraft((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void action(request.id, "payment", {
                          action: "request",
                          expectedAmountMinor: Number(paymentDraft[request.id] || 0) || null,
                          currency: request.paymentCurrency,
                          instructions:
                            request.paymentInstructions ??
                            "Enviar transferencia y comprobante por WhatsApp.",
                        })
                      }
                    >
                      Registrar pedido
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const evidence = window.prompt("Referencia/comprobante redacted");
                        if (evidence) {
                          void action(request.id, "payment", {
                            action: "evidence",
                            evidenceRedacted: evidence,
                          });
                        }
                      }}
                    >
                      Evidencia
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void action(request.id, "payment", { action: "approve" })
                      }
                    >
                      Aprobar pago
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void action(request.id, "status", { status: "needs_reply" })
                    }
                  >
                    Necesita respuesta
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void action(request.id, "status", { status: "waiting_for_customer" })
                    }
                  >
                    Esperando cliente
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void action(request.id, "status", { status: "declined" })}
                  >
                    Declinar
                  </Button>
                </div>

                {template && (
                  <div className="mt-3 rounded-md border bg-subtle p-3">
                    <p className="text-xs font-semibold">Mensaje preparado</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{template.body}</p>
                    <p className="mt-2 text-xs text-text-3">{template.disclaimer}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void navigator.clipboard.writeText(template.body)}
                      >
                        Copiar
                      </Button>
                      {template.waMeUrl && (
                        <a
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium"
                          href={template.waMeUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {filtered.length === 0 && (
            <p className="rounded-lg border bg-card p-6 text-sm text-text-3">
              No hay solicitudes para este filtro.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(amountMinor);
}
