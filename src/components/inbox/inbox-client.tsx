"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { buildBookingAttentionMap, type BookingAttention } from "@/lib/booking-attention";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/components/use-events";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { Composer } from "./composer";
import { ContactPanel } from "./contact-panel";

type ManualPaymentVerificationDto = {
  id: string;
  bookingHoldId: string;
  conversationId: string | null;
  contactId: string | null;
  resourceId: string;
  serviceId: string;
  status: "waiting_for_evidence" | "needs_operator_review";
  expectedAmountMinor: number;
  currency: string;
  customerReferenceRedacted: string | null;
  expiresAt: string;
  createdAt: string;
};

export function InboxClient() {
  const [conversations, setConversations] = useState<ConversationDto[] | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [paymentVerifications, setPaymentVerifications] = useState<
    ManualPaymentVerificationDto[]
  >([]);
  const [bookingAttentionByConversation, setBookingAttentionByConversation] =
    useState<Map<string, BookingAttention>>(new Map());
  const [replyDraft, setReplyDraft] = useState<{ id: number; text: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  // Se incrementa con cada evento SSE que puede cambiar la etapa/lead o el
  // estado del agente: el panel de detalles lo observa y refetch en vivo.
  const [detailRev, setDetailRev] = useState(0);

  useEffect(() => {
    setPanelOpen(localStorage.getItem("reservas.panelOpen") !== "false");
  }, []);
  const togglePanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    localStorage.setItem("reservas.panelOpen", String(open));
  }, []);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const lastFetchRef = useRef<string | null>(null);

  const refetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { conversations: ConversationDto[] };
    setConversations(data.conversations);
    lastFetchRef.current = new Date().toISOString();
  }, []);

  const refetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(
      `/api/conversations/${conversationId}/messages`
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { messages: MessageDto[] };
    if (selectedIdRef.current === conversationId) setMessages(data.messages);
  }, []);

  const refetchPaymentVerifications = useCallback(async (conversationId: string) => {
    const res = await fetch(
      `/api/payments/manual-verifications?conversationId=${encodeURIComponent(
        conversationId
      )}&status=needs_operator_review&status=waiting_for_evidence&limit=5`
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      verifications: ManualPaymentVerificationDto[];
    };
    if (selectedIdRef.current === conversationId) {
      setPaymentVerifications(data.verifications);
    }
  }, []);

  const refetchBookingAttention = useCallback(async () => {
    const res = await fetch(
      "/api/payments/manual-verifications?status=needs_operator_review&status=waiting_for_evidence&limit=100"
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      verifications: ManualPaymentVerificationDto[];
    };
    setBookingAttentionByConversation(buildBookingAttentionMap(data.verifications));
  }, []);

  useEffect(() => {
    void refetchConversations();
    void refetchBookingAttention();
  }, [refetchConversations, refetchBookingAttention]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMessages([]);
      setPaymentVerifications([]);
      setReplyDraft(null);
      void refetchMessages(id);
      void refetchPaymentVerifications(id);
      void fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      });
    },
    [refetchMessages, refetchPaymentVerifications]
  );

  // Enlace directo desde Contactos/Pipeline: /inbox?contact=<id>
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  const contactParam = searchParams.get("contact");
  useEffect(() => {
    if (selectedIdRef.current) return;
    if (conversationParam && conversations?.some((c) => c.id === conversationParam)) {
      select(conversationParam);
      return;
    }
    if (!contactParam) return;
    const match = conversations?.find((c) => c.contact.id === contactParam);
    if (match) select(match.id);
  }, [conversationParam, contactParam, conversations, select]);

  useEvents({
    onMessageNew: ({ conversationId, message }) => {
      if (selectedIdRef.current === conversationId) {
        const m = message as MessageDto;
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m]
        );
        void fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markRead: true }),
        });
        void refetchPaymentVerifications(conversationId);
        void refetchBookingAttention();
      }
      void refetchConversations();
      // Un entrante nuevo puede crear/mover el lead: refresca el panel.
      setDetailRev((v) => v + 1);
    },
    onMessageStatus: ({ conversationId, messageId, status }) => {
      if (selectedIdRef.current !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, status: status as MessageDto["status"] } : m
        )
      );
    },
    onConversationUpdated: () => {
      void refetchConversations();
      void refetchBookingAttention();
      // El agente movió de etapa o cambió el handoff: refresca el panel en vivo.
      setDetailRev((v) => v + 1);
    },
    onReconnect: () => {
      // Catch-up tras reconexión (contrato sse.md): refetch completo.
      void refetchConversations();
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      if (selectedIdRef.current) void refetchPaymentVerifications(selectedIdRef.current);
      void refetchBookingAttention();
      setDetailRev((v) => v + 1);
    },
  });

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  const sendText = useCallback(
    async (text: string): Promise<string | null> => {
      if (!selectedIdRef.current) return "Sin conversación seleccionada";
      const res = await fetch(
        `/api/conversations/${selectedIdRef.current}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        }
      ).catch(() => null);
      if (!res) return "Sin conexión con el servidor";
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return data?.error?.message ?? "No se pudo enviar el mensaje";
      }
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      void refetchConversations();
      return null;
    },
    [refetchMessages, refetchConversations]
  );

  const patchConversation = useCallback(
    async (patch: { aiEnabled?: boolean; reactivate?: boolean }) => {
      if (!selectedIdRef.current) return;
      await fetch(`/api/conversations/${selectedIdRef.current}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      void refetchConversations();
    },
    [refetchConversations]
  );

  const decidePaymentVerification = useCallback(
    async (id: string, action: "approve" | "reject"): Promise<string | null> => {
      const res = await fetch(`/api/payments/manual-verifications/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { note: "Confirmado desde el inbox" }
            : { reason: "not_received", note: "Marcado como no recibido desde el inbox" }
        ),
      }).catch(() => null);
      if (!res) return "Sin conexión con el servidor";
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return data?.error?.message ?? "No se pudo procesar el pago";
      }
      if (selectedIdRef.current) {
        void refetchPaymentVerifications(selectedIdRef.current);
        void refetchMessages(selectedIdRef.current);
      }
      void refetchBookingAttention();
      void refetchConversations();
      setDetailRev((v) => v + 1);
      return null;
    },
    [
      refetchConversations,
      refetchMessages,
      refetchPaymentVerifications,
      refetchBookingAttention,
    ]
  );

  return (
    <div className="flex h-full">
      <section className="w-[360px] shrink-0 overflow-hidden border-r">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          bookingAttentionByConversation={bookingAttentionByConversation}
          onSelect={select}
          onSeeded={() => void refetchConversations()}
        />
      </section>

      <section className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex items-center justify-between border-b bg-background px-4 py-2.5">
              <div className="flex items-center gap-3">
                <ContactAvatar
                  name={selected.contact.name}
                  seed={selected.contact.id}
                  size="md"
                />
                <div>
                  <p className="text-[15px] font-[650] leading-tight">
                    {selected.contact.name}
                  </p>
                  <p
                    className={
                      selected.windowOpen
                        ? "text-xs font-medium text-success"
                        : "text-xs text-text-3"
                    }
                  >
                    {selected.windowOpen
                      ? "ventana abierta"
                      : selected.contact.phone
                        ? `+${selected.contact.phone}`
                        : "Cuenta de Instagram"}
                  </p>
                </div>
              </div>
              {!panelOpen && (
                <button
                  onClick={() => togglePanel(true)}
                  aria-label="Mostrar detalles"
                  className="rounded-sm border p-1.5 text-text-3 hover:bg-accent hover:text-foreground"
                >
                  <PanelRight className="h-4 w-4" strokeWidth={1.7} />
                </button>
              )}
            </header>
            <MessageThread messages={messages} />
            <PaymentVerificationAlert
              verifications={paymentVerifications}
              onDecide={decidePaymentVerification}
            />
            <Composer
              conversation={selected}
              replyDraft={replyDraft}
              onSend={sendText}
              onSent={() => {
                if (selectedIdRef.current)
                  void refetchMessages(selectedIdRef.current);
                void refetchConversations();
              }}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-chat text-sm text-text-3">
            Elige una conversación para ver el hilo
          </div>
        )}
      </section>

      <section
        className={cn(
          "shrink-0 overflow-hidden border-l transition-[width] duration-[220ms]",
          panelOpen && selected ? "w-[320px]" : "w-0 border-l-0"
        )}
      >
        {selected && (
          <div className="h-full w-[320px]">
            <ContactPanel
              conversation={selected}
              refreshKey={detailRev}
              onPatchConversation={patchConversation}
              onUseReplyDraft={(text) => setReplyDraft({ id: Date.now(), text })}
              onClose={() => togglePanel(false)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function PaymentVerificationAlert({
  verifications,
  onDecide,
}: {
  verifications: ManualPaymentVerificationDto[];
  onDecide: (id: string, action: "approve" | "reject") => Promise<string | null>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const verification =
    verifications.find((item) => item.status === "needs_operator_review") ??
    verifications[0] ??
    null;
  if (!verification) return null;

  async function decide(action: "approve" | "reject") {
    setBusyId(verification?.id ?? null);
    setMessage(null);
    const error = verification ? await onDecide(verification.id, action) : null;
    setBusyId(null);
    setMessage(error);
  }

  return (
    <div className="border-t bg-[#fff8e8] px-4 py-3">
      <div className="rounded-lg border border-[#ead8ad] bg-background p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#7a5a12]">
              Confirmar pago manual
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#7a5a12]/85">
              ¿Recibiste esta seña de {formatMoneyMinor(verification)} para este cliente?
            </p>
            {verification.customerReferenceRedacted && (
              <p className="mt-1 truncate text-xs text-text-3">
                Ref: {verification.customerReferenceRedacted}
              </p>
            )}
            <p className="mt-1 text-xs text-text-3">
              Hold: <span className="font-mono">{verification.bookingHoldId}</span> · expira{" "}
              {formatDateTime(verification.expiresAt)}
            </p>
          </div>
          <Badge variant="warning">
            {verification.status === "needs_operator_review"
              ? "Revisar"
              : "Esperando comprobante"}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={Boolean(busyId) || verification.status !== "needs_operator_review"}
            onClick={() => void decide("approve")}
          >
            Sí, recibido
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(busyId)}
            onClick={() => void decide("reject")}
          >
            No
          </Button>
        </div>
        {message && <p className="mt-2 text-xs text-destructive">{message}</p>}
      </div>
    </div>
  );
}

function formatMoneyMinor(value: { expectedAmountMinor: number; currency: string }): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: value.currency === "PYG" ? 0 : 2,
  }).format(value.expectedAmountMinor);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
