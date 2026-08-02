"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Instagram, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CommentStatus = "new" | "handled" | "hidden" | "deleted" | "failed";
type Comment = {
  id: string;
  contactId: string | null;
  providerMediaId: string | null;
  providerUsername: string | null;
  text: string | null;
  permalink: string | null;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
};
type Connection = {
  connected: boolean;
  account: {
    username: string | null;
    displayName: string | null;
    status: string;
    webhookStatus: string;
  } | null;
};

const filters: { id: "all" | CommentStatus; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Nuevos" },
  { id: "handled", label: "Atendidos" },
  { id: "failed", label: "Fallidos" },
  { id: "deleted", label: "Eliminados" },
];

export function InstagramCommentsWorkspace() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const status = filter === "all" ? "" : `?status=${filter}`;
    const [commentsResponse, connectionResponse] = await Promise.all([
      fetch(`/api/instagram/comments${status}`),
      fetch("/api/settings/instagram"),
    ]).catch(() => [null, null]);
    if (!commentsResponse?.ok) {
      setError("No se pudieron cargar los comentarios.");
      setLoading(false);
      return;
    }
    const commentsBody = (await commentsResponse.json()) as { comments: Comment[] };
    setComments(commentsBody.comments);
    if (connectionResponse?.ok) setConnection((await connectionResponse.json()) as Connection);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Instagram className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-semibold">Comentarios de Instagram</h1>
            <p className="text-xs text-muted-foreground">Revisa y responde comentarios públicos de tu cuenta.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 p-6">
        <ConnectionBanner connection={connection} />
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <Button key={item.id} size="sm" variant={filter === item.id ? "default" : "outline"} onClick={() => setFilter(item.id)}>
              {item.label}
            </Button>
          ))}
        </div>
        {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {loading ? <p className="text-sm text-muted-foreground">Cargando comentarios…</p> : comments.length === 0 ? <EmptyState connected={Boolean(connection?.connected)} /> : (
          <div className="grid gap-3">
            {comments.map((comment) => <CommentCard key={comment.id} comment={comment} onChanged={() => void refresh()} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionBanner({ connection }: { connection: Connection | null }) {
  if (!connection?.connected) return <div className="rounded-lg border border-[#ece2cf] bg-[#faf7f0] p-4 text-sm text-[#8a6d3b]">Instagram no está conectado. Conecta una cuenta profesional desde el instalador para recibir comentarios.</div>;
  const healthy = connection.account?.status === "connected" && connection.account.webhookStatus === "active";
  return <div className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${healthy ? "border-[#d8e8dd] bg-[#eff7f1]" : "border-[#ece2cf] bg-[#faf7f0]"}`}><Instagram className="h-4 w-4" /><span className="flex-1">{connection.account?.displayName ?? connection.account?.username ?? "Cuenta conectada"} {connection.account?.username ? `(@${connection.account.username})` : ""}</span><Badge variant={healthy ? "success" : "warning"}>{healthy ? "Webhook activo" : "Revisar conexión"}</Badge></div>;
}

function EmptyState({ connected }: { connected: boolean }) {
  return <div className="rounded-lg border border-dashed p-10 text-center"><MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">{connected ? "No hay comentarios para este filtro" : "Conecta Instagram para empezar"}</p><p className="mt-1 text-sm text-muted-foreground">Los comentarios de las publicaciones aparecerán aquí.</p></div>;
}

function CommentCard({ comment, onChanged }: { comment: Comment; onChanged: () => void }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canAct = comment.status !== "deleted";
  const date = useMemo(() => new Date(comment.createdAt).toLocaleString(), [comment.createdAt]);

  async function action(path: string, body?: unknown) {
    setBusy(true); setMessage(null);
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { const data = await response?.json().catch(() => null) as { error?: { message?: string } } | null; setMessage(data?.error?.message ?? "No se pudo completar la acción"); return; }
    setReply(""); setMessage("Listo"); onChanged();
  }

  return <article className="rounded-lg border bg-card p-4 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text">{(comment.providerUsername ?? "?").slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">@{comment.providerUsername ?? "usuario de Instagram"}</span><StatusBadge status={comment.status} /><span className="text-xs text-muted-foreground">{date}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{comment.text ?? "(sin texto)"}</p><p className="mt-2 text-xs text-muted-foreground">Media: {comment.providerMediaId ?? "no disponible"}</p></div>{comment.permalink && <a href={comment.permalink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Abrir comentario en Instagram"><ExternalLink className="h-4 w-4" /></a>}</div>{canAct && <><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void action(`/api/instagram/comments/${comment.id}/moderate`, { action: "handled" })}>Marcar atendido</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("¿Eliminar este comentario en Instagram?")) void action(`/api/instagram/comments/${comment.id}/moderate`, { action: "delete" }); }}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button></div><div className="mt-3 flex gap-2"><input className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" placeholder="Responder públicamente…" value={reply} onChange={(event) => setReply(event.target.value)} disabled={busy} /><Button size="sm" disabled={busy || !reply.trim()} onClick={() => void action(`/api/instagram/comments/${comment.id}/reply`, { text: reply })}>Responder</Button></div></>}{message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}</article>;
}

function StatusBadge({ status }: { status: CommentStatus }) {
  const labels: Record<CommentStatus, string> = { new: "Nuevo", handled: "Atendido", hidden: "Oculto", deleted: "Eliminado", failed: "Fallido" };
  const variants: Record<CommentStatus, "default" | "success" | "warning" | "destructive" | "secondary"> = { new: "default", handled: "success", hidden: "warning", deleted: "secondary", failed: "destructive" };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}
