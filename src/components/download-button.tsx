"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Working } from "@/components/ui/working";
import { fileNameFrom } from "@/lib/download";

/**
 * Nedladdning med väntläge.
 *
 * Exporterna byggs på servern och kan ta allt från några sekunder (CSV) till
 * flera minuter (arkiv-zip för ett helt räkenskapsår). Som vanlig `<a download>`
 * händer ingenting alls i gränssnittet under tiden: knappen ser oklickad ut och
 * webbläsaren visar inget förrän filen börjar komma. En `target="_blank"`-PDF
 * blev i stället en tom flik i minuter.
 *
 * Här hämtas filen i stället med fetch, så att knappen kan säga att den
 * arbetar — och så att ett fel från servern blir en läsbar toast i stället för
 * en flik med rå JSON.
 *
 * `newTab` öppnar fliken synkront i klicket (annars stoppar
 * popup-spärren den) och pekar om den till filen när den är klar.
 */
export function DownloadButton({
  href,
  children,
  workingLabel = "Förbereder filen…",
  hint,
  newTab = false,
  variant = "outline",
  size,
  className,
  title,
}: {
  href: string;
  children: React.ReactNode;
  /** Vad som pågår, i presens */
  workingLabel?: string;
  /** Extra rad under knappen medan det pågår, för de riktigt långa */
  hint?: string;
  /** PDF:er visas i en ny flik i stället för att laddas ned */
  newTab?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  // Object-URL:er städas när komponenten försvinner, annars läcker filen
  // kvar i minnet tills fliken stängs.
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); }, []);

  async function download() {
    if (busy) return;
    setBusy(true);
    // Fliken måste öppnas i klicket — efter await är den en popup i webbläsarens ögon
    const tab = newTab ? window.open("", "_blank") : null;
    try {
      const res = await fetch(href);
      if (!res.ok) {
        tab?.close();
        const text = await res.text().catch(() => "");
        // Rutterna svarar antingen { error } eller ren text
        let message = text.slice(0, 400);
        try {
          const json = JSON.parse(text) as { error?: string };
          if (json.error) message = json.error;
        } catch { /* ren text — använd som den är */ }
        toast.error(message || `Exporten misslyckades (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      if (tab) {
        tab.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        // Servern namnger filen i Content-Disposition; utan namn får den
        // webbläsarens standardnamn, vilket är sämre men aldrig fel.
        a.download = fileNameFrom(res.headers.get("Content-Disposition")) ?? "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      tab?.close();
      toast.error(`Filen kunde inte hämtas: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant={variant} size={size} className={className}
        title={title} disabled={busy} onClick={download}>
        {busy ? <Working inline label={workingLabel} /> : children}
      </Button>
      {busy && hint && (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      )}
    </span>
  );
}
