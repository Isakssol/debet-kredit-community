import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gemensamt väntläge för hela appen.
 *
 * Regeln: ingen yta som kan ta mer än ett ögonblick får stå stum. En knapp som
 * bara blir grå säger inte om programmet arbetar eller har hängt sig — och de
 * tyngsta ytorna (SIE-import av ett helt år, arkivexporten, rapport-PDF:erna)
 * kan ta minuter. Formspråket är detsamma överallt: tre studsande prickar plus
 * en rad som säger vad som pågår just nu.
 *
 * Tre former:
 * - `inline` — prickar + text inuti en knapp eller en rad text.
 * - panel (standard) — inramad ruta med rubrikrad, valfria delsteg och hint.
 * - `progress` — samma panel med en tunn stapel och "3 av 10".
 *
 * Delstegen är till för väntan som består av flera moment: det som är klart
 * bockas av, det som pågår pulserar, resten ligger nedtonat. Då syns det att
 * något rör sig även när ett enskilt steg tar tjugo sekunder.
 *
 * Bocka bara av ett steg som verkligen går att observera. Är väntan ett enda
 * ogenomskinligt serveranrop hör alla steg hemma efter `activeStep = 0`: att
 * kryssa av det första hade varit en gissning i kryssform, och kryss läses som
 * fakta.
 */
export function WorkingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex gap-1", className)} aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-delay:240ms]" />
    </span>
  );
}

export function Working({
  label,
  steps,
  activeStep = 0,
  hint,
  progress,
  inline = false,
  className,
}: {
  /** Vad som pågår, i presens: "Läser kvittot…" */
  label: string;
  /** Delsteg i ordning — visas bockade, pågående eller nedtonade */
  steps?: readonly string[];
  /** Index i `steps` som pågår just nu */
  activeStep?: number;
  /** Extra rad under, t.ex. "Stora filer kan ta ett par minuter." */
  hint?: string;
  /** Räknare för satsvisa körningar */
  progress?: { done: number; total: number };
  /** Prickar + text utan ram — för knappar och korta rader */
  inline?: boolean;
  className?: string;
}) {
  if (inline) {
    return (
      <span role="status" aria-live="polite"
        className={cn("inline-flex items-center gap-2", className)}>
        <WorkingDots />
        {label}
      </span>
    );
  }

  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : null;

  return (
    <div role="status" aria-live="polite"
      className={cn("rounded-xl border bg-muted/30 px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-3 text-sm font-medium">
        <span className="flex items-center gap-2 text-primary">
          <WorkingDots />
          <span className="text-foreground">{label}</span>
        </span>
        {progress && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {progress.done} av {progress.total}
          </span>
        )}
      </div>

      {pct !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
      )}

      {steps && steps.length > 0 && (
        <ol className="mt-2.5 space-y-1">
          {steps.map((s, i) => (
            <li key={s} className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              i < activeStep ? "text-muted-foreground"
                : i === activeStep ? "text-foreground"
                  : "text-muted-foreground/50",
            )}>
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {i < activeStep ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : i === activeStep ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full border border-current" />
                )}
              </span>
              {s}
            </li>
          ))}
        </ol>
      )}

      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Pulserande platshållare där ett svar ska landa. Används tillsammans med
 * `Working` så att ytan visar både att något pågår och var resultatet kommer.
 */
export function WorkingSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-muted"
          style={{ animationDelay: `${i * 120}ms`, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
