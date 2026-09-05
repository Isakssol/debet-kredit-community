"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Bug, Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScreenshotPreview, formatBytes } from "@/components/screenshot-preview";
import { cn } from "@/lib/utils";
import { readClientErrors } from "@/lib/client-errors";
import { getReportRedactionNames } from "@/lib/actions/support";
import { buildNameRedactor, REDACT_MASK } from "@/lib/redact-names";
import { captureScreenshot, SKIP_CAPTURE_ATTR, type Screenshot } from "@/lib/screenshot";
import {
  FEEDBACK_ENDPOINT, FEEDBACK_HONEYPOT_FIELD, FEEDBACK_LIMITS,
  buildFeedbackPayload, normalizeRoute, validateFeedback,
  type FeedbackImageType, type FeedbackTechnical,
} from "@/lib/feedback";

/**
 * Buggrapporten.
 *
 * Egen dialog och inte en panel i en meny: en skärmbildsförhandsvisning i en
 * smal panel blir ett frimärke, och förhandsvisningen är hela poängen.
 *
 * Två löften styr utformningen:
 *
 *  1. **Ett klick ska räcka.** Teknisk information är förkryssad, för den är
 *     skillnaden mellan en gissning och en felsökning.
 *  2. **Ingenting lämnar datorn i det tysta.** Transparensrutan visar varje
 *     rad med sitt faktiska värde — inte en beskrivning av värdet — och den
 *     läser samma objekt som går ut på nätet. Skärmbilden syns alltid först
 *     och kan alltid tas bort.
 *
 * Det andra löftet väger tyngre i den här utgåvan än i licensutgåvan. En
 * community-installation kör på kundens egen maskin, och rapporten är det
 * enda som lämnar den — därför står mottagaren utskriven i rutan.
 */
export function BugReportDialog({
  open,
  onOpenChange,
  companyName,
  appVersion,
  buildSha,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  appVersion: string;
  /** Sju tecken ur bygget — skiljer två rapporter från olika veckor åt. */
  buildSha?: string;
}) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [shareCompany, setShareCompany] = useState(false);
  const [attachTechnical, setAttachTechnical] = useState(true);
  const [honeypot, setHoneypot] = useState("");

  // null = ännu inte hämtad eller misslyckad. Skillnaden mot en tom lista är
  // hela poängen: transparensrutan får inte lova maskering som inte skedde.
  const [names, setNames] = useState<string[] | null>(null);
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [masked, setMasked] = useState(true);

  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  /**
   * Miljön läses när dialogen öppnas, inte vid varje tangenttryck: det är
   * läget när felet upptäcktes som är intressant. Dialogen renderas bara
   * efter ett klick, så window finns alltid här.
   *
   * `appLogExcerpt` sätts aldrig — community-utgåvan har ingen egen
   * systemlogg att hämta rader ur.
   */
  const technical = useMemo<FeedbackTechnical | null>(() => {
    if (!open || typeof window === "undefined") return null;
    return {
      route: normalizeRoute(pathname),
      buildSha: buildSha || process.env.NEXT_PUBLIC_BUILD_SHA || "lokal",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      theme: currentTheme(),
      locale: navigator.language,
      tzOffset: new Date().getTimezoneOffset(),
      clientErrors: readClientErrors(),
    };
  }, [open, pathname, buildSha]);

  // Registernamnen hämtas när dialogen öppnas och används bara här, för att
  // maska. De följer aldrig med utskicket.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getReportRedactionNames()
      .then((rows) => { if (!cancelled) setNames(rows); })
      .catch(() => { /* utan listan maskas inga namn — och rutan säger det */ });
    return () => { cancelled = true; };
  }, [open]);

  const redact = useMemo(() => buildNameRedactor(names ?? []), [names]);

  const payload = useMemo(() => buildFeedbackPayload({
    type: "bug",
    title,
    message,
    email: email.trim() || undefined,
    appVersion,
    companyName: shareCompany ? companyName : undefined,
    technical: attachTechnical && technical ? technical : undefined,
    screenshot: screenshot
      ? { mimeType: screenshot.mimeType as FeedbackImageType, data: screenshot.data }
      : undefined,
    honeypot,
    redact,
  }), [
    title, message, email, appVersion, shareCompany, companyName,
    attachTechnical, technical, screenshot, honeypot, redact,
  ]);

  const takeScreenshot = useCallback(async (withMask: boolean) => {
    setCapturing(true);
    // Dialogen tas ur bilden av captureScreenshot självt — den och dess
    // bakgrundsdimma döljs medan tagningen pågår.
    const result = await captureScreenshot({ mask: withMask });
    setCapturing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMasked(withMask);
    setScreenshot(result.screenshot);
  }, []);

  function reset() {
    setTitle("");
    setMessage("");
    setScreenshot(null);
    setMasked(true);
    setSent(false);
    setReference(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    const invalid = validateFeedback(payload);
    if (invalid) {
      toast.error(invalid);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? `Inskicket gick inte fram (fel ${response.status}).`);
        return;
      }
      const data = (await response.json().catch(() => null)) as { reference?: string } | null;
      setReference(data?.reference ?? null);
      setSent(true);
      toast.success("Tack! Rapporten är skickad till utvecklarna.");
    } catch {
      toast.error("Kunde inte nå Debet & Kredits utvecklare — kontrollera nätverket och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  const heading = sent ? "Tack — rapporten är framme." : "Rapportera en bugg";
  const subheading = sent
    ? ""
    : "Beskriv vad som hände, så tar vi det härifrån.";

  const body = sent ? (
    <SentReceipt email={payload.email} reference={reference} onClose={() => { reset(); onOpenChange(false); }} onAgain={reset} />
  ) : (
    <form id="felrapport-form" onSubmit={submit} className="space-y-3">
      <Field label="Rubrik" htmlFor="felrapport-rubrik">
        <Input
          id="felrapport-rubrik"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={FEEDBACK_LIMITS.title}
          placeholder="Kort rubrik, t.ex. Fakturan får fel förfallodatum"
          required
        />
      </Field>

      <Field label="Vad hände?" htmlFor="felrapport-beskrivning">
        <Textarea
          id="felrapport-beskrivning"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={FEEDBACK_LIMITS.message}
          rows={5}
          placeholder="Vad gjorde du, vad hände och vad hade du väntat dig? Ta gärna med sidan du var på och eventuellt felmeddelande."
          required
          className="max-h-[30dvh]"
        />
      </Field>

      <Field
        label="E-post"
        htmlFor="felrapport-epost"
        hint="(valfritt, om du vill ha svar)"
      >
        <Input
          id="felrapport-epost"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={FEEDBACK_LIMITS.email}
          placeholder="du@foretaget.se"
        />
      </Field>

      {/* Honeypot: dold för människor, oemotståndlig för robotar. */}
      <div aria-hidden className="sr-only">
        <label htmlFor="felrapport-referens-kod">Lämna tomt</label>
        <input
          id="felrapport-referens-kod"
          name={FEEDBACK_HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs">
        <input
          type="checkbox"
          checked={attachTechnical}
          onChange={(e) => setAttachTechnical(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
        />
        <span>
          Bifoga teknisk information
          <span className="block text-muted-foreground">
            Programversion, webbläsare, vilken sida du var på och de senaste
            felmeddelandena från din webbläsare. Det gör felsökningen mycket snabbare.
          </span>
        </span>
      </label>

      {screenshot ? (
        <ScreenshotPreview
          screenshot={screenshot}
          masked={masked}
          busy={capturing}
          onToggleMask={(next) => void takeScreenshot(next)}
          onRetake={() => void takeScreenshot(masked)}
          onRemove={() => setScreenshot(null)}
        />
      ) : (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={capturing}
            onClick={() => void takeScreenshot(true)}
          >
            <Camera /> {capturing ? "Tar bilden…" : "Ta en skärmbild"}
            <span className="text-muted-foreground">(valfritt)</span>
          </Button>
          <p className="px-1 text-[11px] text-muted-foreground">
            Du får se bilden innan något skickas.
          </p>
        </div>
      )}

      <TransparencyPanel
        payload={payload}
        attachTechnical={attachTechnical}
        screenshot={screenshot}
        names={names}
        onRemoveScreenshot={() => setScreenshot(null)}
      />

      <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs">
        <input
          type="checkbox"
          checked={shareCompany}
          onChange={(e) => setShareCompany(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
        />
        <span>
          Skicka med företagsnamnet
          <span className="block text-muted-foreground">
            {companyName} följer då med rapporten. Utan kryss skickas det inte.
          </span>
        </span>
      </label>
    </form>
  );

  const footer = sent ? null : (
    <div
      className={cn(
        "sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t bg-popover/95 px-4 py-3 backdrop-blur",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        isMobile ? "flex-col" : "flex-row justify-end",
      )}
    >
      {/* På mobil ligger Skicka överst i full bredd — handen når underkanten. */}
      <Button type="submit" form="felrapport-form" disabled={busy || capturing} className={isMobile ? "w-full" : ""}>
        <Bug /> {busy ? "Skickar…" : "Skicka rapport"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className={isMobile ? "w-full" : ""}>
        Avbryt
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          {...{ [SKIP_CAPTURE_ATTR]: "" }}
          className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-xl p-4"
        >
          <SheetHeader className="p-0 pb-3">
            <SheetTitle className="font-heading text-base">{heading}</SheetTitle>
            {subheading && <SheetDescription>{subheading}</SheetDescription>}
          </SheetHeader>
          {body}
          {footer}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...{ [SKIP_CAPTURE_ATTR]: "" }}
        className="max-h-[calc(100dvh-4rem)] gap-0 overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader className="pb-3">
          <DialogTitle>{heading}</DialogTitle>
          {subheading && <DialogDescription>{subheading}</DialogDescription>}
        </DialogHeader>
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, htmlFor, hint, children,
}: {
  label: string; htmlFor: string; hint?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-xs font-medium">
        {label}{hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** Värden hos mottagaren, skrivna som de står — inte som de beskrivs. */
const ENDPOINT_HOST = (() => {
  try {
    return new URL(FEEDBACK_ENDPOINT).host;
  } catch {
    return FEEDBACK_ENDPOINT;
  }
})();

/**
 * "Visa exakt vad som skickas".
 *
 * Raderna läses ur samma post som går ut på nätet, med de faktiska värdena.
 * Det är skillnaden mot en integritetstext: en text kan bli osann när koden
 * ändras, den här listan kan det inte.
 */
function TransparencyPanel({
  payload,
  attachTechnical,
  screenshot,
  names,
  onRemoveScreenshot,
}: {
  payload: ReturnType<typeof buildFeedbackPayload>;
  attachTechnical: boolean;
  screenshot: Screenshot | null;
  /** null = registret kunde inte läsas, alltså ingen namnmaskering. */
  names: string[] | null;
  onRemoveScreenshot: () => void;
}) {
  const technical = payload.technical;
  const clientErrors = technical?.clientErrors ?? [];

  return (
    <details className="rounded-xl border border-dashed px-3 py-2.5 text-[11px] leading-relaxed">
      <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none">
        Visa exakt vad som skickas
      </summary>

      <div className="mt-2.5 space-y-3">
        {/* Community-utgåvan kör på kundens egen maskin. Då är det inte
            självklart vart en rapport tar vägen — alltså står det utskrivet. */}
        <Group title="Tas emot av">
          <Row label="Mottagare" value={`${ENDPOINT_HOST} (Debet & Kredits utvecklare)`} />
          <Row label="Inloggning" value="Rapporten skickas anonymt, utan din session" />
        </Group>

        <Group title="Din text">
          <Row label="Rubrik" value={payload.title || "Skickas inte"} />
          {payload.message ? (
            /* Beskrivningen står ORDAGRANT, inte som ett teckenantal. Det är
               det längsta fritextfältet och därmed det som oftast bär ett
               kundnamn — och sedan maskeringen infördes är det inte längre
               samma text kunden skrev. Ett antal tecken hade dolt just den
               skillnaden i den ruta som finns för att visa den. */
            <details className="py-0.5">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 marker:content-none">
                <span className="text-muted-foreground">Beskrivning</span>
                <span className="underline underline-offset-2">
                  {payload.message.length} tecken — visa texten
                </span>
              </summary>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2 font-mono text-[10px] leading-snug">
                {payload.message}
              </p>
            </details>
          ) : (
            <Row label="Beskrivning" value="Skickas inte" />
          )}
          <Row label="E-post" value={payload.email ?? "Skickas inte"} />
          <Row label="Företagsnamn" value={payload.companyName ?? "Skickas inte"} />
        </Group>

        {attachTechnical && technical ? (
          <Group title="Teknisk information">
            <Row label="Sida" value={technical.route ?? "—"} />
            <Row label="Programversion" value={`${payload.appVersion ?? "—"} (bygge ${technical.buildSha ?? "—"})`} />
            <Row label="Skärmstorlek" value={technical.viewport ?? "—"} />
            <Row label="Utseende" value={technical.theme === "dark" ? "Mörkt läge" : "Ljust läge"} />
            <Row label="Språk och tidszon" value={`${technical.locale ?? "—"}, UTC${offsetLabel(technical.tzOffset)}`} />
            <Row label="Webbläsare" value="Webbläsarens versionssträng läses av mottagaren" />

            <Lines
              label="Fel i webbläsaren"
              count={clientErrors.length}
              rows={clientErrors.map((e) => ({
                key: `${e.at}-${e.message}`,
                text: `${clock(e.at)} ${e.message}${e.count > 1 ? ` (${e.count} ggr)` : ""}${e.source ? ` — ${e.source}` : ""}`,
              }))}
            />

            <div className="flex items-baseline justify-between gap-2 py-0.5">
              <span className="text-muted-foreground">Skärmbild</span>
              <span className="flex items-center gap-2 text-right">
                {screenshot ? (
                  <>
                    <span>1 bild, {formatBytes(screenshot.bytes)}</span>
                    <button
                      type="button"
                      onClick={onRemoveScreenshot}
                      className="underline underline-offset-2 hover:text-destructive"
                    >
                      Ta bort
                    </button>
                  </>
                ) : "Skickas inte"}
              </span>
            </div>
          </Group>
        ) : (
          <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-muted-foreground">
            Ingen teknisk information följer med. Rubrik, beskrivning
            {payload.email ? " och e-postadress" : ""} skickas som vanligt.
          </p>
        )}

        <Group title="Skickas aldrig">
          <p className="text-muted-foreground">
            Belopp, verifikationer, personnummer, kontonummer, filer och
            inloggningsuppgifter. Namnen i ditt kund- och leverantörsregister byts mot
            {" "}{REDACT_MASK}. Maskeringen gäller också det du själv skriver — därför
            kan raderna ovan skilja sig från det du skrev.
          </p>
          {names === null && (
            <p className="text-amber-700 dark:text-amber-300">
              Registret kunde inte läsas just nu, så namn maskeras inte automatiskt
              den här gången. Läs igenom raderna ovan innan du skickar.
            </p>
          )}
        </Group>
      </div>
    </details>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0 py-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words sm:text-right">{value}</span>
    </div>
  );
}

/** En hopfälld lista där raderna står ORDAGRANT som de skickas. */
function Lines({
  label, count, rows,
}: {
  label: string;
  count: number;
  rows: { key: string; text: string }[];
}) {
  if (count === 0) {
    return <Row label={label} value="Inga" />;
  }
  return (
    <details className="py-0.5">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 marker:content-none">
        <span className="text-muted-foreground">{label}</span>
        <span className="underline underline-offset-2">{count} st — visa raderna</span>
      </summary>
      <ul className="mt-1 space-y-1 rounded-lg bg-muted/60 p-2 font-mono text-[10px] leading-snug">
        {rows.map((row) => (
          <li key={row.key} className="break-words">{row.text}</li>
        ))}
      </ul>
    </details>
  );
}

function SentReceipt({
  email, reference, onClose, onAgain,
}: {
  email?: string; reference: string | null; onClose: () => void; onAgain: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      <CheckCircle2 className="h-8 w-8 text-primary" />
      <p className="text-sm text-muted-foreground">
        {email
          ? `Vi läser allt som kommer in. Behöver vi veta mer hör vi av oss till ${email}.`
          : "Vi läser allt som kommer in, men kan inte svara utan en e-postadress."}
      </p>
      {reference && (
        <p className="text-xs text-muted-foreground">
          Referens: <span className="font-mono">{reference}</span>
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={onClose}>Stäng</Button>
        <Button type="button" variant="outline" onClick={onAgain}>Skicka en till</Button>
      </div>
    </div>
  );
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function offsetLabel(tzOffset?: number): string {
  if (typeof tzOffset !== "number") return "";
  // getTimezoneOffset() räknar åt andra hållet än UTC-beteckningen gör.
  const hours = -tzOffset / 60;
  return `${hours >= 0 ? "+" : ""}${hours}`;
}

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}
