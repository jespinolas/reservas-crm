"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Instagram, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type State = { connected: boolean; account: { id: string; username: string | null; displayName: string | null; status: string; webhookStatus: string } | null };

export function InstagramConnectionCard() {
  const [state, setState] = useState<State | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => { const response = await fetch("/api/settings/instagram").catch(() => null); if (response?.ok) setState(await response.json() as State); setLoaded(true); }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function connect() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/settings/instagram/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { authorizationUrl?: string; error?: { message?: string }; code?: string } | null;
    setBusy(false);
    if (!response?.ok || !body?.authorizationUrl) {
      setMessage(body?.error?.message ?? body?.code ?? "No se pudo iniciar la conexión con Instagram.");
      return;
    }
    window.location.assign(body.authorizationUrl);
  }
  if (!loaded) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  const healthy = Boolean(state?.connected && state.account?.status === "connected" && state.account.webhookStatus === "active");
  return <div className="max-w-3xl space-y-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Instagram className="h-5 w-5" /> Instagram</CardTitle><CardDescription>Conecta una cuenta profesional de Instagram desde este CRM. Los tokens nunca se muestran al operador.</CardDescription></CardHeader><CardContent className="space-y-4">{state?.connected && state.account ? <div className={`flex items-center gap-3 rounded-lg border p-4 ${healthy ? "border-[#d8e8dd] bg-[#eff7f1]" : "border-[#ece2cf] bg-[#faf7f0]"}`}>{healthy ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-[#8a6d3b]" />}<div className="flex-1 text-sm"><p className="font-medium">{state.account.displayName ?? state.account.username ?? "Cuenta de Instagram"}</p><p className="text-muted-foreground">{state.account.username ? `@${state.account.username}` : state.account.id}</p></div><Badge variant={healthy ? "success" : "warning"}>{healthy ? "Conectado" : "Revisar"}</Badge></div> : <div className="rounded-lg border border-dashed p-5"><p className="text-sm font-medium">No hay una cuenta conectada.</p><p className="mt-1 text-sm text-muted-foreground">Conecta Instagram para recibir DMs en la bandeja y gestionar comentarios desde el CRM.</p><Button className="mt-4" onClick={() => void connect()} disabled={busy}>{busy ? "Abriendo Meta…" : "Conectar Instagram"}</Button>{message && <p className="mt-3 text-sm text-destructive">{message}</p>}</div>}<div className="grid gap-3 rounded-md border bg-background/40 p-4 text-sm"><p className="font-medium">Estado operativo</p><p className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Webhook: {state?.account?.webhookStatus ?? "pendiente"}</p><p className="text-xs text-muted-foreground">Permisos iniciales: basic, gestionar comentarios y gestionar mensajes. La aprobación de Meta sigue siendo un requisito para cuentas externas.</p></div></CardContent></Card></div>;
}
