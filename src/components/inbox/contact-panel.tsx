"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Sparkles, UserRound } from "lucide-react";
import type { ConversationDto, StageDto } from "@/lib/types";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildBookingReplyDraftActions } from "@/lib/booking-reply-drafts";

type BookingSessionStatus =
  | "collecting_intent"
  | "showing_options"
  | "awaiting_customer_confirmation"
  | "hold_created"
  | "awaiting_payment_evidence"
  | "awaiting_operator_payment_review"
  | "confirmed"
  | "rejected"
  | "expired"
  | "escalated";

type SelectedBookingOption = {
  optionId?: string;
  resourceId: string;
  resourceName?: string;
  serviceId: string;
  serviceName?: string;
  startsAt: string;
  endsAt: string;
  partySize?: number;
  capacity?: number;
  currency?: string;
  amountMinor?: number;
  depositRequired?: boolean;
  depositAmountMinor?: number;
};

type BookingSessionDto = {
  id: string;
  conversationId: string;
  contactId: string | null;
  status: BookingSessionStatus;
  serviceId: string | null;
  resourceId: string | null;
  requestedStartsAt: string | null;
  requestedEndsAt: string | null;
  partySize: number | null;
  selectedOptionJsonRedacted: SelectedBookingOption | null;
  bookingHoldId: string | null;
  manualPaymentVerificationId: string | null;
  reservationId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ManualPaymentVerificationDto = {
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
  evidenceMessageId: string | null;
  evidenceMediaId: string | null;
  evidenceStorageRef: string | null;
  customerReferenceRedacted: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type BookingPanelState = {
  bookingSession: BookingSessionDto | null;
  paymentVerification: ManualPaymentVerificationDto | null;
  timeline: BookingTimelineItemDto[];
};

type BookingTimelineItemDto = {
  id: string;
  eventType: string;
  label: string;
  actorLabel: string;
  metadataSummary: string | null;
  createdAt: string;
};

const HANDOFF_LABELS: Record<string, string> = {
  cliente: "El cliente pidió un humano",
  modelo: "El agente decidió escalar",
  error: "Error del proveedor de IA",
  ventana: "Ventana de 24h cerrada",
};

const AGENT_STATE_LABELS: Record<ConversationDto["agentState"]["state"], string> = {
  disabled: "Desactivado",
  not_ready: "No listo",
  eligible: "Esperando mensaje",
  generating: "Generando respuesta",
  sent: "Última respuesta enviada",
  blocked: "Bloqueado",
  failed: "Falló",
  handoff: "Atención humana",
};

const AGENT_BLOCKED_LABELS: Record<
  Exclude<ConversationDto["agentState"]["blockedReason"], null>,
  string
> = {
  crm_unhealthy: "El CRM no está saludable.",
  db_unavailable: "La base de datos no está disponible.",
  provider_not_configured: "Falta configurar el proveedor de IA.",
  provider_failed: "El proveedor de IA falló.",
  conversation_ai_disabled: "La IA está pausada en esta conversación.",
  business_ai_disabled: "El agente del negocio está apagado.",
  human_handoff: "La conversación fue escalada a humano.",
  outside_window: "La ventana de WhatsApp de 24 horas está cerrada.",
  duplicate_inbound: "Ese mensaje ya fue procesado.",
  send_failed: "No se pudo enviar la respuesta.",
  invalid_model_output: "La IA devolvió una acción inválida.",
};

const BOOKING_STATUS_LABELS: Record<BookingSessionStatus, string> = {
  collecting_intent: "Recolectando datos",
  showing_options: "Mostrando opciones",
  awaiting_customer_confirmation: "Esperando elección",
  hold_created: "Hold creado",
  awaiting_payment_evidence: "Esperando comprobante",
  awaiting_operator_payment_review: "Revisar pago",
  confirmed: "Reserva confirmada",
  rejected: "Pago rechazado",
  expired: "Expirado",
  escalated: "Atención humana",
};

const PAYMENT_STATUS_LABELS: Record<ManualPaymentVerificationDto["status"], string> = {
  waiting_for_evidence: "Esperando comprobante",
  needs_operator_review: "Revisión pendiente",
  approved: "Pago aprobado",
  rejected: "Pago rechazado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export function ContactPanel({
  conversation,
  refreshKey = 0,
  onPatchConversation,
  onUseReplyDraft,
  onClose,
}: {
  conversation: ConversationDto;
  /** Aumenta con cada evento SSE relevante: dispara un refetch en vivo. */
  refreshKey?: number;
  onPatchConversation: (patch: {
    aiEnabled?: boolean;
    reactivate?: boolean;
  }) => Promise<void>;
  onUseReplyDraft: (text: string) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  // Estado global del agente: sin esto, el toggle "Respondiendo" mentiría
  // cuando el agente aún no se ha configurado/encendido.
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [bookingPanel, setBookingPanel] = useState<BookingPanelState | null>(null);
  const [bookingPanelError, setBookingPanelError] = useState<string | null>(null);
  const [bookingAction, setBookingAction] = useState<
    "approve" | "reject" | "escalate" | null
  >(null);

  const contactId = conversation.contact.id;
  const conversationId = conversation.id;

  const agentReady = aiConfigured && agentEnabled;
  const aiActive =
    agentReady && conversation.aiEnabled && !conversation.handoffAt;
  const agentState = conversation.agentState;
  const agentIssue =
    agentState.blockedReason ? AGENT_BLOCKED_LABELS[agentState.blockedReason] : null;
  const lastAttemptLabel = agentState.lastAttemptAt
    ? new Intl.DateTimeFormat("es-PY", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(agentState.lastAttemptAt))
    : null;

  // Carga inicial (incluye notas): se re-ejecuta al cambiar de contacto.
  const refetch = useCallback(async () => {
    const [detail, stagesRes, agentRes] = await Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/pipeline/stages").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null, null]);
    if (detail) {
      setNotes(detail.contact?.notes ?? "");
      setCurrentStageId(detail.stage?.id ?? null);
      setLeadId(detail.lead?.id ?? null);
    }
    if (stagesRes) setStages(stagesRes.stages);
    setAgentEnabled(Boolean(agentRes?.profile?.enabled));
    setAiConfigured(Boolean(agentRes?.aiConfigured));
    setNotesLoaded(true);
  }, [contactId]);

  const refetchBookingPanel = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conversationId}/booking-session`).catch(
      () => null
    );
    if (!res?.ok) {
      setBookingPanelError("No se pudo cargar la reserva de esta conversación.");
      return;
    }
    const data = (await res.json()) as BookingPanelState;
    setBookingPanel(data);
    setBookingPanelError(null);
  }, [conversationId]);

  // Refetch en vivo (etapa/lead + estado del agente) SIN tocar las notas, para
  // no pisar lo que el operador esté escribiendo. Lo dispara el SSE.
  const refreshLive = useCallback(async () => {
    const [detail, agentRes] = await Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (detail) {
      setCurrentStageId(detail.stage?.id ?? null);
      setLeadId(detail.lead?.id ?? null);
    }
    if (agentRes) {
      setAgentEnabled(Boolean(agentRes.profile?.enabled));
      setAiConfigured(Boolean(agentRes.aiConfigured));
    }
  }, [contactId]);

  useEffect(() => {
    setNotesLoaded(false);
    void refetch();
    void refetchBookingPanel();
  }, [refetch, refetchBookingPanel]);

  useEffect(() => {
    if (!notesLoaded) return; // la carga inicial ya trae el estado fresco
    void refreshLive();
    void refetchBookingPanel();
  }, [refreshKey, notesLoaded, refreshLive, refetchBookingPanel]);

  async function moveToStage(stageId: string) {
    if (!leadId || stageId === currentStageId) return;
    setCurrentStageId(stageId); // optimista
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId, position: 0 }),
    }).catch(() => null);
    void refreshLive();
  }

  async function saveNotes() {
    setSavingNotes(true);
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
    }).catch(() => null);
    setSavingNotes(false);
  }

  async function decidePaymentVerification(action: "approve" | "reject") {
    const verification = bookingPanel?.paymentVerification;
    if (!verification) return;
    setBookingAction(action);
    setBookingPanelError(null);
    const res = await fetch(`/api/payments/manual-verifications/${verification.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        action === "approve"
          ? { note: "Confirmado desde el panel del inbox" }
          : {
              reason: "not_received",
              note: "Marcado como no recibido desde el panel del inbox",
            }
      ),
    }).catch(() => null);
    setBookingAction(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setBookingPanelError(data?.error?.message ?? "No se pudo procesar el pago.");
    }
    await refetchBookingPanel();
  }

  async function escalateBookingSession() {
    setBookingAction("escalate");
    setBookingPanelError(null);
    const res = await fetch(`/api/conversations/${conversationId}/booking-session/escalate`, {
      method: "POST",
    }).catch(() => null);
    setBookingAction(null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setBookingPanelError(data?.error?.message ?? "No se pudo escalar la reserva.");
    }
    await refetchBookingPanel();
  }

  const currentIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 flex items-center justify-between border-b bg-background px-4 py-3">
        <h3 className="text-[13px] font-[650] uppercase tracking-wide text-text-2">
          Detalles
        </h3>
        <button
          onClick={onClose}
          aria-label="Ocultar panel"
          className="rounded p-1 text-text-3 hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Contacto */}
        <section className="border-b p-4">
          <div className="flex items-center gap-3">
            <ContactAvatar
              name={conversation.contact.name}
              seed={conversation.contact.id}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-[650]">
                {conversation.contact.name}
              </p>
              <p className="text-xs text-text-3">
                {formatPhone(conversation.contact.phone)}
              </p>
            </div>
          </div>

          {conversation.handoffAt && (
            <div className="mt-3 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#8a6d3b]">
                <UserRound className="h-4 w-4" strokeWidth={1.7} /> Atención humana
              </p>
              <p className="mt-1 text-xs text-[#8a6d3b]/80">
                {HANDOFF_LABELS[conversation.handoffReason ?? ""] ??
                  "La IA está en pausa en esta conversación."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                disabled={!agentReady}
                onClick={() => void onPatchConversation({ reactivate: true })}
              >
                Reactivar IA
              </Button>
            </div>
          )}

          <div className="mt-3 rounded-md border bg-secondary/50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">IA en esta conversación</p>
                <p className="text-[11px] text-text-3">
                  {!agentReady
                    ? "Agente sin activar"
                    : conversation.handoffAt
                      ? "En pausa · atención humana"
                      : conversation.aiEnabled
                        ? AGENT_STATE_LABELS[agentState.state]
                        : "En pausa"}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={aiActive}
                aria-label="IA en esta conversación"
                disabled={!agentReady}
                onClick={() => {
                  if (!agentReady) return;
                  void onPatchConversation({
                    aiEnabled: !conversation.aiEnabled,
                  });
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
                  aiActive ? "bg-brand" : "bg-border-strong",
                  !agentReady && "cursor-not-allowed opacity-60"
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    aiActive ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {!agentReady && (
              <div className="mt-2.5 flex items-start gap-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-2.5">
                <Sparkles
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a6d3b]"
                  strokeWidth={1.7}
                />
                <p className="text-[11px] leading-relaxed text-[#8a6d3b]">
                  {aiConfigured
                    ? "La IA todavía no responde por su cuenta. Configura lo básico del agente y enciéndelo."
                    : "Falta la clave de IA de la instancia (OPENROUTER_API_TOKEN) para que el agente pueda responder."}
                  {aiConfigured && (
                    <Link
                      href="/agent"
                      className="ml-1 whitespace-nowrap font-medium text-brand-text underline underline-offset-2 hover:text-brand"
                    >
                      Configurar agente →
                    </Link>
                  )}
                </p>
              </div>
            )}

            {agentReady && agentIssue && (
              <div className="mt-2.5 flex items-start gap-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] p-2.5">
                <Sparkles
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a6d3b]"
                  strokeWidth={1.7}
                />
                <p className="text-[11px] leading-relaxed text-[#8a6d3b]">
                  {agentIssue}
                  <Link
                    href="/agent"
                    className="ml-1 whitespace-nowrap font-medium text-brand-text underline underline-offset-2 hover:text-brand"
                  >
                    Revisar agente
                  </Link>
                </p>
              </div>
            )}

            {agentState.attemptId && (
              <div className="mt-2.5 rounded-md border bg-background p-2.5">
                <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[11px]">
                  <dt className="text-text-3">Intento</dt>
                  <dd className="truncate font-mono text-text-2">
                    {agentState.attemptId}
                  </dd>
                  <dt className="text-text-3">Modelo</dt>
                  <dd className="truncate text-text-2">
                    {agentState.provider ?? "sin proveedor"}
                    {agentState.model ? ` · ${agentState.model}` : ""}
                  </dd>
                  <dt className="text-text-3">Latencia</dt>
                  <dd className="text-text-2">
                    {agentState.latencyMs === null
                      ? "sin dato"
                      : `${agentState.latencyMs} ms`}
                  </dd>
                  <dt className="text-text-3">Último</dt>
                  <dd className="text-text-2">{lastAttemptLabel ?? "sin dato"}</dd>
                </dl>
                {agentState.redactedError && (
                  <p className="mt-2 break-words rounded bg-secondary px-2 py-1.5 font-mono text-[10px] leading-relaxed text-text-2">
                    {agentState.redactedError}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Stepper de etapa */}
        {stages.length > 0 && leadId && (
          <section className="border-b p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-3">
              Etapa del pipeline
            </p>
            <ol>
              {stages.map((s, i) => {
                const done = currentIndex >= 0 && i < currentIndex;
                const current = s.id === currentStageId;
                return (
                  <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < stages.length - 1 && (
                      <span
                        className={cn(
                          "absolute left-[7px] top-4 h-full w-px",
                          done ? "bg-brand" : "bg-border-strong"
                        )}
                      />
                    )}
                    <button
                      onClick={() => void moveToStage(s.id)}
                      aria-label={`Mover a ${s.name}`}
                      className={cn(
                        "relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full transition-colors",
                        done && "bg-brand text-white",
                        current && "bg-brand ring-4 ring-brand-soft",
                        !done && !current && "border border-border-strong bg-background hover:border-brand"
                      )}
                    >
                      {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </button>
                    <button
                      onClick={() => void moveToStage(s.id)}
                      className={cn(
                        "text-left text-[13px]",
                        current ? "font-[650] text-brand-text" : "text-text-2 hover:text-foreground"
                      )}
                    >
                      {s.name}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <BookingOperatorPanel
          state={bookingPanel}
          error={bookingPanelError}
          busyAction={bookingAction}
          canUseReplyDraft={conversation.windowOpen}
          onUseReplyDraft={onUseReplyDraft}
          onApprove={() => void decidePaymentVerification("approve")}
          onReject={() => void decidePaymentVerification("reject")}
          onEscalate={() => void escalateBookingSession()}
        />

        {/* Notas */}
        <section className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
            Notas
          </p>
          <Textarea
            rows={5}
            placeholder="Notas internas sobre este contacto…"
            value={notes}
            disabled={!notesLoaded}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={savingNotes || !notesLoaded}
            onClick={() => void saveNotes()}
          >
            {savingNotes ? "Guardando…" : "Guardar notas"}
          </Button>
        </section>
      </div>
    </div>
  );
}

function BookingOperatorPanel({
  state,
  error,
  busyAction,
  canUseReplyDraft,
  onUseReplyDraft,
  onApprove,
  onReject,
  onEscalate,
}: {
  state: BookingPanelState | null;
  error: string | null;
  busyAction: "approve" | "reject" | "escalate" | null;
  canUseReplyDraft: boolean;
  onUseReplyDraft: (text: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onEscalate: () => void;
}) {
  const session = state?.bookingSession ?? null;
  const verification = state?.paymentVerification ?? null;
  const option = session?.selectedOptionJsonRedacted ?? null;
  const canReview = verification?.status === "needs_operator_review";
  const canEscalate =
    Boolean(session) &&
    !["confirmed", "rejected", "expired", "escalated"].includes(session?.status ?? "");
  const replyDrafts = buildBookingReplyDraftActions({
    session,
    paymentVerification: verification,
  });

  return (
    <section className="border-b p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
          Reserva AI
        </p>
        {session && (
          <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-text-2">
            {BOOKING_STATUS_LABELS[session.status]}
          </span>
        )}
      </div>

      {!session && !error && (
        <div className="rounded-md border bg-secondary/40 p-3">
          <p className="text-[13px] font-medium text-text-2">Sin reserva activa</p>
          <p className="mt-1 text-xs leading-relaxed text-text-3">
            Cuando la IA cree un hold o pida una seña, el estado aparecerá acá.
          </p>
        </div>
      )}

      {session && (
        <div className="space-y-3">
          <div className="rounded-md border bg-background p-3">
            <p className="text-[13px] font-semibold text-foreground">
              {option?.resourceName ?? session.resourceId ?? "Recurso por definir"}
            </p>
            <p className="mt-1 text-xs text-text-3">
              {option?.serviceName ?? session.serviceId ?? "Servicio por definir"}
            </p>
            <dl className="mt-3 grid grid-cols-[78px_1fr] gap-x-2 gap-y-1 text-[11px]">
              <dt className="text-text-3">Fecha</dt>
              <dd className="text-text-2">
                {formatMaybeDateTime(option?.startsAt ?? session.requestedStartsAt)}
              </dd>
              <dt className="text-text-3">Personas</dt>
              <dd className="text-text-2">
                {option?.partySize ?? session.partySize ?? "sin dato"}
              </dd>
              <dt className="text-text-3">Total</dt>
              <dd className="text-text-2">
                {option?.amountMinor != null && option.currency
                  ? formatMoneyMinor({
                      expectedAmountMinor: option.amountMinor,
                      currency: option.currency,
                    })
                  : "sin dato"}
              </dd>
              <dt className="text-text-3">Hold</dt>
              <dd className="truncate font-mono text-text-2">
                {session.bookingHoldId ?? "sin hold"}
              </dd>
              <dt className="text-text-3">Expira</dt>
              <dd className="text-text-2">{formatMaybeDateTime(session.expiresAt)}</dd>
            </dl>
          </div>

          {verification && (
            <div className="rounded-md border border-[#ead8ad] bg-[#fff8e8] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#7a5a12]">
                    Seña manual
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#7a5a12]/85">
                    {formatMoneyMinor(verification)} ·{" "}
                    {PAYMENT_STATUS_LABELS[verification.status]}
                  </p>
                  {verification.customerReferenceRedacted && (
                    <p className="mt-1 truncate text-xs text-text-3">
                      Ref: {verification.customerReferenceRedacted}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-background px-2 py-1 text-[10px] font-semibold text-[#7a5a12]">
                  {PAYMENT_STATUS_LABELS[verification.status]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!canReview || Boolean(busyAction)}
                  onClick={onApprove}
                >
                  {busyAction === "approve" ? "Confirmando…" : "Sí, recibido"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canReview || Boolean(busyAction)}
                  onClick={onReject}
                >
                  {busyAction === "reject" ? "Marcando…" : "No"}
                </Button>
              </div>
            </div>
          )}

          {canEscalate && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={Boolean(busyAction)}
              onClick={onEscalate}
            >
              {busyAction === "escalate" ? "Escalando…" : "Pasar a humano"}
            </Button>
          )}

          {replyDrafts.length > 0 && (
            <div className="rounded-md border bg-secondary/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
                Respuestas rápidas
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {replyDrafts.map((draft) => (
                  <Button
                    key={draft.id}
                    size="sm"
                    variant="secondary"
                    disabled={!canUseReplyDraft}
                    title={
                      canUseReplyDraft
                        ? draft.text
                        : "La ventana de 24 horas está cerrada; usa una plantilla aprobada."
                    }
                    onClick={() => onUseReplyDraft(draft.text)}
                  >
                    {draft.label}
                  </Button>
                ))}
              </div>
              {!canUseReplyDraft && (
                <p className="mt-2 text-xs text-text-3">
                  Ventana cerrada: usa una plantilla aprobada para retomar.
                </p>
              )}
            </div>
          )}

          {state?.timeline && state.timeline.length > 0 && (
            <div className="rounded-md border bg-background p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
                Historial
              </p>
              <ol className="mt-3 space-y-3">
                {state.timeline.map((item) => (
                  <li key={item.id} className="grid grid-cols-[10px_1fr] gap-2">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-brand" />
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-foreground">{item.label}</p>
                        <span className="shrink-0 text-[10px] text-text-3">
                          {formatMaybeDateTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-3">
                        {item.actorLabel}
                        {item.metadataSummary ? ` · ${item.metadataSummary}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}

function formatMaybeDateTime(value?: string | null): string {
  if (!value) return "sin dato";
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoneyMinor(value: { expectedAmountMinor: number; currency: string }): string {
  const amount =
    value.currency === "PYG" ? value.expectedAmountMinor : value.expectedAmountMinor / 100;
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: value.currency === "PYG" ? 0 : 2,
  }).format(amount);
}
