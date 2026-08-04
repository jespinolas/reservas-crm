"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Instagram,
  ShieldCheck,
} from "lucide-react";
import {
  instagramCallbackMessage,
  type InstagramChecklistItem,
  type InstagramReadiness,
} from "@/lib/instagram-readiness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SensitiveConfigValue } from "@/components/settings/sensitive-config-value";

type State = {
  connected: boolean;
  account: {
    id: string;
    username: string | null;
    displayName: string | null;
    status: string;
    webhookStatus: string;
  } | null;
  readiness: InstagramReadiness;
  checklist: InstagramChecklistItem[];
};

export function InstagramConnectionCard() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<State | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const callbackMessage = useMemo(
    () =>
      instagramCallbackMessage({
        mode: searchParams.get("instagram"),
        reason: searchParams.get("reason"),
      }),
    [searchParams]
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/settings/instagram").catch(() => null);
    if (response?.ok) setState((await response.json()) as State);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, callbackMessage]);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/settings/instagram/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      authorizationUrl?: string;
      error?: { message?: string };
      code?: string;
    } | null;
    setBusy(false);
    if (!response?.ok || !body?.authorizationUrl) {
      setMessage(
        body?.error?.message ??
          body?.code ??
          "No se pudo iniciar la conexión con Instagram."
      );
      return;
    }
    window.location.assign(body.authorizationUrl);
  }

  async function disconnect() {
    if (
      !window.confirm(
        "Esto desconectará Instagram de Reservas CRM. No se eliminarán conversaciones, contactos ni reservas. ¿Continuar?"
      )
    ) {
      return;
    }
    setDisconnecting(true);
    setMessage(null);
    const response = await fetch("/api/settings/instagram/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      message?: string;
      metaRevocationStatus?: string;
      error?: { message?: string };
      code?: string;
    } | null;
    setDisconnecting(false);
    if (!response?.ok) {
      setMessage(
        body?.error?.message ??
          body?.message ??
          body?.code ??
          "No se pudo desconectar Instagram."
      );
      return;
    }
    setMessage(
      body?.metaRevocationStatus === "revoked" ||
        body?.metaRevocationStatus === "already_revoked"
        ? "Instagram fue desconectado también en Meta."
        : "Instagram fue desconectado del CRM. Revisa Meta si quieres quitar el acceso manualmente."
    );
    await refresh();
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const readiness = state?.readiness;
  const account = state?.account;
  const ready = readiness?.overall === "live_ready";
  const callbackClass =
    callbackMessage?.variant === "success"
      ? "border-[#d8e8dd] bg-[#eff7f1] text-[#3f6b52]"
      : callbackMessage?.variant === "warning"
        ? "border-[#ece2cf] bg-[#faf7f0] text-[#8a6d3b]"
        : "border-[#ecd4d2] bg-[#faf1f0] text-[#a2504c]";

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" /> Instagram
          </CardTitle>
          <CardDescription>
            Conecta una cuenta profesional de Instagram desde este CRM. Los
            tokens nunca se muestran al operador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {callbackMessage && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${callbackClass}`}>
              {callbackMessage.message}
            </div>
          )}

          {account && readiness ? (
            <div
              className={`flex items-center gap-3 rounded-lg border p-4 ${
                ready
                  ? "border-[#d8e8dd] bg-[#eff7f1]"
                  : "border-[#ece2cf] bg-[#faf7f0]"
              }`}
            >
              {ready ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-[#8a6d3b]" />
              )}
              <div className="flex-1 text-sm">
                <p className="font-medium">
                  {account.displayName ?? account.username ?? "Cuenta de Instagram"}
                </p>
                <p className="text-muted-foreground">
                  {account.username ? `@${account.username}` : "Cuenta configurada"}
                </p>
                <div className="mt-2">
                  <SensitiveConfigValue
                    label="ID de cuenta de Instagram"
                    value={account.id}
                  />
                </div>
                <p className="mt-2 text-muted-foreground">
                  {readiness.operatorMessage}
                </p>
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void disconnect()}
                    disabled={disconnecting}
                  >
                    {disconnecting ? "Desconectando…" : "Desconectar Instagram"}
                  </Button>
                </div>
              </div>
              <Badge variant={readiness.badgeVariant}>{readiness.badgeLabel}</Badge>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-5">
              <p className="text-sm font-medium">No hay una cuenta conectada.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Conecta Instagram para recibir DMs en la bandeja y gestionar
                comentarios desde el CRM.
              </p>
              <Button className="mt-4" onClick={() => void connect()} disabled={busy}>
                {busy ? "Abriendo Meta…" : "Conectar Instagram"}
              </Button>
              {message && <p className="mt-3 text-sm text-destructive">{message}</p>}
            </div>
          )}

          <div className="grid gap-3 rounded-md border bg-background/40 p-4 text-sm">
            <p className="font-medium">Estado operativo</p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> Webhook:{" "}
              {account?.webhookStatus ?? "pendiente"}
            </p>
            {readiness && (
              <p className="text-sm text-muted-foreground">
                Próximo paso: {readiness.primaryLabel}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Permisos iniciales: basic, gestionar comentarios y gestionar
              mensajes. La aprobación de Meta sigue siendo un requisito para
              cuentas externas.
            </p>
          </div>

          {state?.checklist && state.checklist.length > 0 && (
            <div className="rounded-md border bg-background/40 p-4 text-sm">
              <p className="font-medium">Checklist de prueba</p>
              <div className="mt-3 grid gap-3">
                {state.checklist.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <Badge
                      variant={
                        item.status === "done"
                          ? "success"
                          : item.status === "failed"
                            ? "destructive"
                            : item.status === "action_required"
                              ? "warning"
                              : "secondary"
                      }
                      className="mt-0.5"
                    >
                      {checklistStatusLabel(item.status)}
                    </Badge>
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function checklistStatusLabel(status: InstagramChecklistItem["status"]): string {
  if (status === "done") return "Listo";
  if (status === "failed") return "Error";
  if (status === "action_required") return "Acción";
  if (status === "not_applicable") return "N/A";
  return "Pendiente";
}
