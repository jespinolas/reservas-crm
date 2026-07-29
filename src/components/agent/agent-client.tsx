"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Profile = {
  enabled: boolean;
  name: string;
  tone: string | null;
  instructions: string | null;
  escalationRules: string | null;
  greeting: string | null;
};

type KbEntry = {
  id: string;
  kind: "qa" | "block";
  question: string | null;
  answer: string | null;
  content: string | null;
  category:
    | "business_profile"
    | "services"
    | "hours"
    | "location"
    | "policies"
    | "pricing_notes"
    | "faq"
    | "escalation"
    | "payment_instructions"
    | "other";
  reviewStatus: "draft" | "reviewed" | "needs_update" | "archived";
  active: boolean;
  priority: number;
};

const KB_CATEGORIES: { value: KbEntry["category"]; label: string }[] = [
  { value: "business_profile", label: "Perfil" },
  { value: "services", label: "Servicios" },
  { value: "hours", label: "Horarios" },
  { value: "location", label: "Ubicación" },
  { value: "policies", label: "Políticas" },
  { value: "pricing_notes", label: "Precios" },
  { value: "faq", label: "FAQ" },
  { value: "escalation", label: "Escalado" },
  { value: "payment_instructions", label: "Pagos" },
  { value: "other", label: "Otro" },
];

type ProviderReadiness = {
  configured: boolean;
  model: string | null;
  keyOwnership: "managed_shared" | "managed_customer_isolated" | "self_hosted_owner_key";
  costPolicy: {
    approvedLowCostModel: string;
    usesApprovedLowCostModel: boolean;
    maxOutputTokens: number;
    dailyReplyCapConfigured: boolean;
    dailyTokenCapConfigured: boolean;
    billableProbeDisabled: boolean;
    emergencyDisabled: boolean;
  };
  lastStatus: string;
  lastErrorCode: string | null;
};

type KbReadiness = {
  ready: boolean;
  missingCategories: KbEntry["category"][];
  staleEntryIds: string[];
  draftCount: number;
  needsUpdateCount: number;
  archivedCount: number;
  liveEntryCount: number;
  promptChars: number;
  promptWarnAt: number;
  promptWarning: boolean;
};

export function AgentClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [providerReadiness, setProviderReadiness] =
    useState<ProviderReadiness | null>(null);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [kbSize, setKbSize] = useState<{ chars: number; warnAt: number; warning: boolean } | null>(null);
  const [kbReadiness, setKbReadiness] = useState<KbReadiness | null>(null);
  const [saved, setSaved] = useState(false);

  const refetch = useCallback(async () => {
    const [p, kb, size, readiness] = await Promise.all([
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb/size").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/kb/readiness").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null, null, null]);
    if (p) {
      setProfile(p.profile);
      setAiConfigured(p.aiConfigured);
      setProviderReadiness(p.providerReadiness ?? null);
    }
    if (kb) setEntries(kb.entries);
    if (size) setKbSize(size);
    if (readiness) setKbReadiness(readiness.readiness);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  async function saveProfile(patch: Partial<Profile>) {
    await fetch("/api/agent/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    void refetch();
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="font-semibold">Agente de IA</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-primary">Guardado ✓</span>}
          <span className="text-sm text-muted-foreground">
            {profile.enabled ? "Encendido" : "Apagado"}
          </span>
          <button
            role="switch"
            aria-checked={profile.enabled}
            aria-label="Agente encendido"
            disabled={!aiConfigured}
            onClick={() => void saveProfile({ enabled: !profile.enabled })}
            className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${
              profile.enabled ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                profile.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </header>

      {!aiConfigured && (
        <div className="mx-6 mt-6 rounded-lg border border-brand-soft bg-brand-tint p-6 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="font-medium">Configura tu proveedor de IA para activar el agente</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Agrega <code className="rounded bg-secondary px-1">OPENROUTER_API_TOKEN</code> y{" "}
            <code className="rounded bg-secondary px-1">OPENROUTER_MODEL</code> a las variables
            de entorno de la instancia y reiníciala. Mientras tanto puedes dejar listo el
            comportamiento y el conocimiento aquí abajo.
          </p>
        </div>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        {providerReadiness && (
          <ProviderReadinessCard readiness={providerReadiness} />
        )}
        {kbReadiness && <KnowledgeReadinessCard readiness={kbReadiness} />}
        <ProfileSection profile={profile} onSave={saveProfile} />
        <KbSection entries={entries} kbSize={kbSize} onChanged={() => void refetch()} />
      </div>
    </div>
  );
}

function KnowledgeReadinessCard({
  readiness,
}: {
  readiness: KbReadiness;
}) {
  const missingLabels = readiness.missingCategories.map(
    (category) =>
      KB_CATEGORIES.find((item) => item.value === category)?.label ?? category
  );
  const reviewQueueCount =
    readiness.draftCount + readiness.needsUpdateCount + readiness.staleEntryIds.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Preparación del conocimiento</CardTitle>
            <CardDescription>
              Estado de las entradas que el agente puede usar al responder.
            </CardDescription>
          </div>
          <Badge variant={readiness.ready ? "success" : "warning"}>
            {readiness.ready ? "Listo" : "Pendiente"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <ReadinessFact
            label="Listo para IA"
            value={`${readiness.liveEntryCount} entradas`}
          />
          <ReadinessFact label="Por revisar" value={`${reviewQueueCount}`} />
          <ReadinessFact
            label="Contexto"
            value={`${readiness.promptChars.toLocaleString("es-MX")} / ${readiness.promptWarnAt.toLocaleString("es-MX")}`}
          />
        </div>

        {readiness.ready ? (
          <div className="flex items-start gap-2 rounded-md border border-[#d8e8dd] bg-[#eff7f1] px-3 py-2 text-[#3f6b52]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>El agente tiene las categorías mínimas revisadas y activas.</span>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-[#ece2cf] bg-[#faf7f0] px-3 py-2 text-[#8a6d3b]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Completa estos puntos antes de depender de respuestas automáticas.</span>
            </div>
            {missingLabels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {missingLabels.map((label) => (
                  <Badge key={label} variant="warning">
                    Falta {label}
                  </Badge>
                ))}
              </div>
            )}
            {readiness.draftCount > 0 && (
              <p>{readiness.draftCount} entradas siguen como borrador.</p>
            )}
            {readiness.needsUpdateCount > 0 && (
              <p>{readiness.needsUpdateCount} entradas necesitan cambios.</p>
            )}
            {readiness.staleEntryIds.length > 0 && (
              <p>{readiness.staleEntryIds.length} entradas requieren revisión reciente.</p>
            )}
            {readiness.promptWarning && (
              <p>El conocimiento está cerca del límite de contexto del modelo.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderReadinessCard({
  readiness,
}: {
  readiness: ProviderReadiness;
}) {
  const statusLabel =
    readiness.lastStatus === "ok"
      ? "Listo"
      : readiness.lastStatus === "model_policy_warning"
        ? "Modelo no estándar"
        : "Bloqueado";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Proveedor de IA</CardTitle>
            <CardDescription>{readiness.model ?? "Sin modelo"}</CardDescription>
          </div>
          <Badge
            variant={
              readiness.lastStatus === "ok"
                ? "secondary"
                : readiness.lastStatus === "model_policy_warning"
                  ? "warning"
                  : "destructive"
            }
          >
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <ReadinessFact
          label="Key"
          value={
            readiness.keyOwnership === "managed_customer_isolated"
              ? "Aislada"
              : readiness.keyOwnership === "self_hosted_owner_key"
                ? "Propia"
                : "Compartida"
          }
        />
        <ReadinessFact
          label="Salida"
          value={`${readiness.costPolicy.maxOutputTokens} tokens`}
        />
        <ReadinessFact
          label="Modelo barato"
          value={readiness.costPolicy.usesApprovedLowCostModel ? "Sí" : "No"}
        />
        <ReadinessFact
          label="Probe facturable"
          value={readiness.costPolicy.billableProbeDisabled ? "No" : "Sí"}
        />
        {readiness.lastErrorCode && (
          <div className="sm:col-span-2 rounded-md border border-brand-soft bg-brand-tint px-3 py-2 text-xs text-muted-foreground">
            {readiness.lastErrorCode}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReadinessFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ProfileSection({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: Partial<Profile>) => Promise<void>;
}) {
  const [form, setForm] = useState(profile);
  useEffect(() => setForm(profile), [profile]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comportamiento</CardTitle>
        <CardDescription>
          Cómo se presenta y actúa el agente al responder a tus clientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="agent-name">Nombre del agente</Label>
          <Input
            id="agent-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-tone">Tono</Label>
          <Input
            id="agent-tone"
            placeholder="p. ej. cercano y directo, con usted"
            value={form.tone ?? ""}
            onChange={(e) => setForm({ ...form, tone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-instructions">Instrucciones</Label>
          <Textarea
            id="agent-instructions"
            rows={5}
            placeholder="Qué debe y no debe hacer el agente…"
            value={form.instructions ?? ""}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-escalation">Reglas de escalado</Label>
          <Textarea
            id="agent-escalation"
            rows={3}
            placeholder="Cuándo pasar la conversación a un humano…"
            value={form.escalationRules ?? ""}
            onChange={(e) => setForm({ ...form, escalationRules: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-greeting">Saludo</Label>
          <Input
            id="agent-greeting"
            placeholder="Saludo para conversaciones nuevas"
            value={form.greeting ?? ""}
            onChange={(e) => setForm({ ...form, greeting: e.target.value })}
          />
        </div>
        <Button onClick={() => void onSave(form)}>Guardar comportamiento</Button>
      </CardContent>
    </Card>
  );
}

function KbSection({
  entries,
  kbSize,
  onChanged,
}: {
  entries: KbEntry[];
  kbSize: { chars: number; warnAt: number; warning: boolean } | null;
  onChanged: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [block, setBlock] = useState("");
  const [category, setCategory] = useState<KbEntry["category"]>("faq");
  const [reviewed, setReviewed] = useState(false);
  const [filterCategory, setFilterCategory] = useState<KbEntry["category"] | "all">("all");
  const [filterStatus, setFilterStatus] = useState<KbEntry["reviewStatus"] | "all">("all");
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (filterCategory === "all" || entry.category === filterCategory) &&
          (filterStatus === "all" || entry.reviewStatus === filterStatus)
      ),
    [entries, filterCategory, filterStatus]
  );

  async function addQa() {
    if (!question.trim() || !answer.trim()) return;
    await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "qa",
        question,
        answer,
        category,
        reviewStatus: reviewed ? "reviewed" : "draft",
      }),
    }).catch(() => null);
    setQuestion("");
    setAnswer("");
    onChanged();
  }

  async function addBlock() {
    if (!block.trim()) return;
    await fetch("/api/kb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "block",
        content: block,
        category,
        reviewStatus: reviewed ? "reviewed" : "draft",
      }),
    }).catch(() => null);
    setBlock("");
    onChanged();
  }

  async function remove(id: string) {
    await fetch(`/api/kb/${id}`, { method: "DELETE" }).catch(() => null);
    onChanged();
  }

  async function review(id: string) {
    await fetch(`/api/kb/${id}/review`, { method: "POST" }).catch(() => null);
    onChanged();
  }

  async function exportKnowledge() {
    const response = await fetch("/api/kb/export").catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (body?.export) {
      setImportText(JSON.stringify(body.export, null, 2));
      setImportMessage("Export listo para soporte o migración.");
    }
  }

  async function importKnowledge() {
    setImportMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportMessage("JSON inválido.");
      return;
    }
    const entriesToImport =
      typeof parsed === "object" &&
      parsed !== null &&
      "entries" in parsed &&
      Array.isArray((parsed as { entries?: unknown }).entries)
        ? (parsed as { entries: unknown[] }).entries
        : Array.isArray(parsed)
          ? parsed
          : null;
    if (!entriesToImport) {
      setImportMessage("El JSON debe ser un export con entries o una lista de entradas.");
      return;
    }
    const response = await fetch("/api/kb/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries: entriesToImport }),
    }).catch(() => null);
    if (!response?.ok) {
      setImportMessage("No se pudo importar. Revisa categorías, tamaños y campos.");
      return;
    }
    const body = (await response.json().catch(() => null)) as { imported?: number } | null;
    setImportMessage(`${body?.imported ?? 0} entradas importadas.`);
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Knowledge base</CardTitle>
            <CardDescription>
              La única fuente de verdad del agente: lo que no está aquí, no lo
              afirma.
            </CardDescription>
          </div>
          {kbSize && (
            <Badge variant={kbSize.warning ? "warning" : "secondary"}>
              {kbSize.chars.toLocaleString("es-MX")} caracteres
            </Badge>
          )}
        </div>
        {kbSize?.warning && (
          <p className="text-xs text-[#8a6d3b]">
            El conocimiento se acerca al límite del contexto del modelo (v1 lo
            inyecta completo en cada turno). Considera depurar entradas.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-3 sm:items-end">
          <label className="grid gap-1 text-sm">
            Filtrar categoría
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as KbEntry["category"] | "all")}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">Todas</option>
              {KB_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Filtrar estado
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as KbEntry["reviewStatus"] | "all")}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="draft">Borrador</option>
              <option value="reviewed">Listo para IA</option>
              <option value="needs_update">Necesita cambios</option>
              <option value="archived">Archivado</option>
            </select>
          </label>
          <div className="text-xs text-muted-foreground">
            Mostrando {visibleEntries.length} de {entries.length}
          </div>
        </div>

        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm">
            Categoría
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as KbEntry["category"])}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {KB_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            Listo para IA
          </label>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Nueva pregunta / respuesta</p>
          <Input
            placeholder="Pregunta (p. ej. ¿Hacen envíos?)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Textarea
            placeholder="Respuesta"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => void addQa()}
            disabled={!question.trim() || !answer.trim()}
          >
            <Plus className="h-4 w-4" /> Agregar P/R
          </Button>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Nuevo bloque de texto libre</p>
          <Textarea
            placeholder="Horarios, direcciones, políticas…"
            rows={3}
            value={block}
            onChange={(e) => setBlock(e.target.value)}
          />
          <Button size="sm" onClick={() => void addBlock()} disabled={!block.trim()}>
            <Plus className="h-4 w-4" /> Agregar bloque
          </Button>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Importar / exportar</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void exportKnowledge()}>
                Exportar
              </Button>
              <Button
                size="sm"
                onClick={() => void importKnowledge()}
                disabled={!importText.trim()}
              >
                Importar
              </Button>
            </div>
          </div>
          <Textarea
            placeholder='Pega un export JSON con {"entries":[...]}'
            rows={4}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {importMessage && <p className="text-xs text-muted-foreground">{importMessage}</p>}
        </div>

        <ul className="space-y-2">
          {visibleEntries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 rounded-md border p-3">
              <div className="min-w-0 flex-1 text-sm">
                <div className="mb-1 flex flex-wrap gap-1">
                  <Badge variant="secondary">
                    {KB_CATEGORIES.find((item) => item.value === e.category)?.label ?? e.category}
                  </Badge>
                  <Badge variant={e.reviewStatus === "reviewed" ? "secondary" : "warning"}>
                    {e.reviewStatus === "reviewed" ? "Listo para IA" : e.reviewStatus}
                  </Badge>
                  {!e.active && <Badge variant="warning">Inactivo</Badge>}
                </div>
                {e.kind === "qa" ? (
                  <>
                    <p className="font-medium">{e.question}</p>
                    <p className="mt-0.5 text-muted-foreground">{e.answer}</p>
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-muted-foreground">{e.content}</p>
                )}
              </div>
              {e.reviewStatus !== "reviewed" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void review(e.id)}
                >
                  Revisar
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar entrada"
                onClick={() => void remove(e.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {visibleEntries.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sin entradas para estos filtros.
            </p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
