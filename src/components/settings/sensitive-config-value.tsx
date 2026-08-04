"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SensitiveConfigValueProps = {
  value: string | null | undefined;
  label: string;
  copiedLabel?: string;
  copyable?: boolean;
  className?: string;
};

export function SensitiveConfigValue({
  value,
  label,
  copiedLabel = "Copiado ✓",
  copyable = false,
  className,
}: SensitiveConfigValueProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayValue = value?.trim() ? value : "No configurado";
  const isConfigured = Boolean(value?.trim());
  const maskedValue = isConfigured ? maskValue(displayValue) : displayValue;

  function copy() {
    if (!revealed || !isConfigured) return;
    void navigator.clipboard.writeText(displayValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <code className="min-w-0 flex-1 truncate rounded-md border bg-background/60 px-3 py-2 text-xs">
        {revealed ? displayValue : maskedValue}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
        aria-pressed={revealed}
        onClick={() => setRevealed((current) => !current)}
        disabled={!isConfigured}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      {copyable && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copiar ${label}`}
          onClick={copy}
          disabled={!revealed || !isConfigured}
          title={
            revealed
              ? `Copiar ${label}`
              : `Muestra ${label} antes de copiarlo`
          }
        >
          <Copy className="h-4 w-4" />
        </Button>
      )}
      {copied && <span className="text-xs text-primary">{copiedLabel}</span>}
    </div>
  );
}

export function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  if (value.length <= 12) return "••••••••";
  return `${"•".repeat(12)}${value.slice(-4)}`;
}
