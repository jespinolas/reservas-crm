"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Unplug,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PLATFORM_ORIGIN = "https://platform.reservas.com.py";
const CUSTOMER_SLUG = "reservas-business";
const CRM_SIGNUP_REDIRECT_PATH = "/setup";

type SetupStatus = {
  completed: boolean;
  reservationReady: boolean;
  integrationsReady: boolean;
  steps: {
    id: string;
    label: string;
    status: "complete" | "incomplete" | "warning";
    detail: string;
  }[];
  summary: {
    activeResources: number;
    activeServices: number;
    activeSchedules: number;
    whatsappConnected: boolean;
    googleCalendarConnected: boolean;
    aiConfigured: boolean;
  };
};

export function SetupWizardClient() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const whatsappConnected = Boolean(status?.summary.whatsappConnected);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/setup/status").catch(() => null);
    setLoading(false);
    if (!response?.ok) return;
    const nextStatus = (await response.json()) as SetupStatus;
    setStatus(nextStatus);
    if (nextStatus.summary.whatsappConnected) setConnectionError(null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function connectWhatsapp() {
    if (whatsappConnected) {
      setConnectionError(null);
      await load();
      return;
    }
    setConnecting(true);
    setConnectionError(null);
    try {
      const startResponse = await fetch(`${PLATFORM_ORIGIN}/api/meta/signup-sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerSlug: CUSTOMER_SLUG,
          customerHostname: window.location.hostname,
          redirectUri: `${window.location.origin}${CRM_SIGNUP_REDIRECT_PATH}`,
        }),
      });
      const startResult = (await startResponse.json()) as StartResponse;
      if (!startResponse.ok || !startResult.ok) {
        throw new Error("No se pudo preparar la conexión con Meta.");
      }
      if (!startResult.embeddedSignup.enabled) {
        throw new Error("Meta Embedded Signup no está configurado todavía.");
      }

      const fb = await loadFacebookSdk(startResult.embeddedSignup);
      const sessionInfoPromise = waitForEmbeddedSignupMessage();
      await new Promise<void>((resolve, reject) => {
        fb.login(
          (response) => {
            void (async () => {
              try {
                const code = response.authResponse?.code;
                if (!code) {
                  reject(new Error("Meta no devolvió autorización. Intenta nuevamente."));
                  return;
                }
                const sessionInfo = await sessionInfoPromise;
                const whatsappInfo = extractEmbeddedSignupWhatsappInfo(sessionInfo);
                await completeAndProvision(startResult, {
                  authorizationCode: code,
                  metaBusinessId: whatsappInfo.metaBusinessId,
                  wabaId: whatsappInfo.wabaId,
                  phoneNumberId: whatsappInfo.phoneNumberId,
                });
                await load();
                resolve();
              } catch (error) {
                reject(error);
              }
            })();
          },
          {
            config_id: startResult.embeddedSignup.configurationId,
            response_type: "code",
            override_default_response_type: true,
            state: startResult.signupSession.state,
            extras: {
              sessionInfoVersion: 2,
              setup: {},
            },
          }
        );
      });
    } catch (error) {
      setConnectionError(
        error instanceof Error
          ? error.message
          : "No se pudo completar la conexión de WhatsApp."
      );
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectWhatsapp() {
    const confirmed = window.confirm(
      "Esto desconecta WhatsApp de esta instalación para poder probar el onboarding otra vez. No borra conversaciones ni reservas. ¿Continuar?"
    );
    if (!confirmed) return;

    setDisconnecting(true);
    setConnectionError(null);
    try {
      const response = await fetch("/api/setup/whatsapp/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: { message?: string } }
        | null;
      if (!response.ok || result?.ok === false) {
        throw new Error(
          result?.message ??
            result?.error?.message ??
            "No se pudo desconectar WhatsApp. Intenta nuevamente."
        );
      }
      await load();
    } catch (error) {
      setConnectionError(
        error instanceof Error
          ? error.message
          : "No se pudo desconectar WhatsApp. Intenta nuevamente."
      );
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Setup</h2>
          <p className="mt-0.5 text-xs text-text-3">
            Readiness de reservas, integraciones y agente para esta instalación.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Revisar
        </Button>
      </header>

      <section className="grid grid-cols-1 gap-3 border-b bg-subtle px-6 py-4 md:grid-cols-3">
        <Summary label="Reservas" ready={status?.reservationReady ?? false} />
        <Summary label="Integraciones" ready={status?.integrationsReady ?? false} />
        <Summary label="Setup completo" ready={status?.completed ?? false} />
      </section>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div id="whatsapp-connection" className="mb-5 rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">Conecta WhatsApp Business</h3>
                {whatsappConnected ? (
                  <Badge variant="success">Conectado</Badge>
                ) : (
                  <Badge variant="warning">Recomendado</Badge>
                )}
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-3">
                Conecta tu cuenta de WhatsApp Business con Meta para recibir mensajes,
                responder desde Reservas CRM y mantener la app de WhatsApp Business
                funcionando cuando Meta habilite coexistencia para tu número.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="lg"
                className="h-14 min-w-[260px] text-base font-semibold"
                onClick={() => void connectWhatsapp()}
                disabled={connecting || disconnecting || whatsappConnected}
              >
                {connecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : whatsappConnected ? (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {connecting
                  ? "Conectando..."
                  : whatsappConnected
                    ? "WhatsApp conectado"
                    : "Conectar WhatsApp"}
              </Button>
              {whatsappConnected && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-14 min-w-[220px] text-base font-semibold"
                  onClick={() => void disconnectWhatsapp()}
                  disabled={disconnecting || connecting}
                >
                  {disconnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Unplug className="mr-2 h-4 w-4" />
                  )}
                  {disconnecting ? "Desconectando..." : "Desconectar"}
                </Button>
              )}
            </div>
          </div>
          {connectionError && (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {connectionError}
            </p>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {loading ? (
            <div className="rounded-lg border bg-card p-6 text-sm text-text-3">
              Cargando setup
            </div>
          ) : (
            status?.steps.map((step) => (
              <div key={step.id} className="flex min-h-[92px] items-start gap-3 rounded-lg border bg-card p-4">
                <StepIcon status={step.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{step.label}</h3>
                    <StepBadge status={step.status} />
                  </div>
                  <p className="mt-1 text-sm text-text-3">{step.detail}</p>
                </div>
                <SetupStepAction stepId={step.id} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const SETUP_STEP_ACTIONS: Partial<Record<SetupStatus["steps"][number]["id"], { href: string; label: string }>> = {
  business_profile: { href: "/settings/branding", label: "Abrir marca" },
  resources: { href: "/reservations", label: "Abrir reservas" },
  services: { href: "/reservations", label: "Abrir reservas" },
  availability: { href: "/reservations", label: "Abrir reservas" },
  booking_rules: { href: "/reservations", label: "Abrir reservas" },
  whatsapp: { href: "#whatsapp-connection", label: "Ir a conexión" },
  google_calendar: { href: "/calendar", label: "Abrir calendario" },
  ai_readiness: { href: "/agent", label: "Configurar agente" },
};

function SetupStepAction({ stepId }: { stepId: SetupStatus["steps"][number]["id"] }) {
  const action = SETUP_STEP_ACTIONS[stepId];
  if (!action) return null;

  return (
    <Link
      href={action.href}
      className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
    >
      {action.label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

type StartResponse =
  | {
      ok: true;
      installation: { id: string };
      signupSession: { id: string; state: string };
      embeddedSignup: {
        appId: string | null;
        configurationId: string | null;
        graphApiVersion: string;
        enabled: boolean;
      };
    }
  | { ok: false; message?: string };

type FacebookSdk = {
  init(input: {
    appId: string;
    cookie: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>
  ): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

async function completeAndProvision(
  startResult: Extract<StartResponse, { ok: true }>,
  payload: {
    authorizationCode: string;
    metaBusinessId?: string;
    wabaId?: string;
    phoneNumberId?: string;
  }
) {
  const callbackResponse = await fetch(`${PLATFORM_ORIGIN}/api/meta/signup-callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: startResult.signupSession.id,
      state: startResult.signupSession.state,
      customerSlug: CUSTOMER_SLUG,
      ...payload,
    }),
  });
  const callbackResult = (await callbackResponse.json()) as
    | { ok: true }
    | { ok: false; code?: string; message?: string };
  if (!callbackResponse.ok || !callbackResult.ok) {
    throw new Error(
      "message" in callbackResult && callbackResult.message
        ? callbackResult.message
        : "Meta completó, pero no se pudo guardar la conexión."
    );
  }

  const provisionResponse = await fetch(`${PLATFORM_ORIGIN}/api/installer/whatsapp/provision-crm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ installationId: startResult.installation.id }),
  });
  const provisionResult = (await provisionResponse.json()) as
    | { ok: true }
    | { ok: false; message?: string };
  if (!provisionResponse.ok || !provisionResult.ok) {
    throw new Error(
      "message" in provisionResult && provisionResult.message
        ? provisionResult.message
        : "Meta conectó, pero no se pudo activar el CRM."
    );
  }
}

function loadFacebookSdk(input: Extract<StartResponse, { ok: true }>["embeddedSignup"]): Promise<FacebookSdk> {
  if (!input.appId) return Promise.reject(new Error("Meta app ID no está configurado."));
  if (window.FB) return Promise.resolve(window.FB);

  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      if (!window.FB) {
        reject(new Error("Facebook SDK no inició correctamente."));
        return;
      }
      window.FB.init({
        appId: input.appId!,
        cookie: true,
        xfbml: true,
        version: input.graphApiVersion,
      });
      resolve(window.FB);
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      window.setTimeout(() => {
        if (window.FB) {
          window.FB.init({
            appId: input.appId!,
            cookie: true,
            xfbml: true,
            version: input.graphApiVersion,
          });
          resolve(window.FB);
        } else {
          reject(new Error("Meta Embedded Signup no terminó de cargar. Recarga la página e intenta de nuevo."));
        }
      }, 3000);
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("No se pudo cargar Meta Embedded Signup."));
    document.body.appendChild(script);
  });
}

function waitForEmbeddedSignupMessage(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", listener);
      resolve({});
    }, 120000);

    function listener(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      const payload = parseMessageData(event.data);
      if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", listener);
      resolve(payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {});
    }

    window.addEventListener("message", listener);
  });
}

function parseMessageData(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractEmbeddedSignupWhatsappInfo(payload: Record<string, unknown>) {
  const nested =
    objectValue(payload.data) ??
    objectValue(payload.whatsapp_business_account) ??
    objectValue(payload.whatsappBusinessAccount) ??
    objectValue(payload.phone_number) ??
    objectValue(payload.phoneNumber) ??
    {};

  return {
    metaBusinessId: firstString(
      payload.business_id,
      payload.businessId,
      nested.business_id,
      nested.businessId
    ),
    wabaId: firstString(
      payload.waba_id,
      payload.wabaId,
      payload.whatsapp_business_account_id,
      payload.whatsappBusinessAccountId,
      nested.waba_id,
      nested.wabaId,
      nested.whatsapp_business_account_id,
      nested.whatsappBusinessAccountId,
      nested.id
    ),
    phoneNumberId: firstString(
      payload.phone_number_id,
      payload.phoneNumberId,
      nested.phone_number_id,
      nested.phoneNumberId,
      nested.phone_id,
      nested.phoneId
    ),
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.map(stringValue).find(Boolean);
}

function Summary({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex h-[74px] items-center justify-between rounded-md border bg-background px-4">
      <span className="text-sm font-medium text-text-2">{label}</span>
      {ready ? <Badge variant="success">Listo</Badge> : <Badge variant="warning">Pendiente</Badge>}
    </div>
  );
}

function StepIcon({ status }: { status: "complete" | "incomplete" | "warning" }) {
  if (status === "complete") return <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />;
  if (status === "warning") return <CircleAlert className="mt-0.5 h-5 w-5 text-warning" />;
  return <CircleDashed className="mt-0.5 h-5 w-5 text-text-3" />;
}

function StepBadge({ status }: { status: "complete" | "incomplete" | "warning" }) {
  if (status === "complete") return <Badge variant="success">Completo</Badge>;
  if (status === "warning") return <Badge variant="warning">Opcional</Badge>;
  return <Badge variant="outline">Bloqueado</Badge>;
}
