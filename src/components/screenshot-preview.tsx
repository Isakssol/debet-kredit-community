"use client";

import { useState } from "react";
import { Camera, Maximize2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SKIP_CAPTURE_ATTR, type Screenshot } from "@/lib/screenshot";

/** "240 kB" — läsbart, utan att låtsas vara exakt. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "14:02" i användarens egen tid. */
function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Förhandsvisningen av skärmbilden.
 *
 * Obligatorisk, aldrig överhoppningsbar: bilden finns inte i utskicket förrän
 * kunden sett den, och den kan alltid tas bort. Maskeringen är förkryssad, och
 * att kryssa av den tar om bilden direkt — så det som visas ALLTID är exakt
 * det som skickas, aldrig en beskrivning av det.
 */
export function ScreenshotPreview({
  screenshot,
  masked,
  busy,
  onToggleMask,
  onRetake,
  onRemove,
}: {
  screenshot: Screenshot;
  masked: boolean;
  busy: boolean;
  onToggleMask: (next: boolean) => void;
  onRetake: () => void;
  onRemove: () => void;
}) {
  const [zoom, setZoom] = useState(false);

  return (
    <div className="space-y-2.5 rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Camera className="h-3.5 w-3.5 text-primary" /> Skärmbild
        </p>
        <p className="text-[11px] text-muted-foreground">
          Tagen {clock(screenshot.takenAt)} · {formatBytes(screenshot.bytes)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label="Visa skärmbilden i helskärm"
        className="block w-full overflow-hidden rounded-lg border bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* Bilden är en data-URL i minnet — next/image gör ingen nytta här. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshot.dataUrl}
          alt="Förhandsvisning av skärmbilden som följer med rapporten"
          className="max-h-[40dvh] w-full object-contain"
        />
      </button>

      <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] leading-relaxed">
        <input
          type="checkbox"
          checked={masked}
          disabled={busy}
          onChange={(e) => onToggleMask(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
        />
        <span>
          Maskera belopp och siffror i bilden
          <span className="block text-muted-foreground">
            Sifferkolumner suddas innan bilden lämnar datorn. Layout och felmeddelanden
            syns fortfarande. Ändrar du valet tas bilden om.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetake}>
          <RefreshCw /> Ta om
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setZoom(true)}>
          <Maximize2 /> Visa i helskärm
        </Button>
        {/* Medvetet längst till höger, aldrig intill Skicka rapport. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onRemove}
          className="ms-auto text-muted-foreground hover:text-destructive"
        >
          <Trash2 /> Ta bort bilden
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Bilden skickas först när du trycker Skicka rapport.
      </p>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent
          {...{ [SKIP_CAPTURE_ATTR]: "" }}
          className="max-w-[calc(100%-1rem)] sm:max-w-4xl"
        >
          <DialogTitle className="sr-only">Skärmbilden i helskärm</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot.dataUrl}
            alt="Skärmbilden som följer med rapporten, i helskärm"
            className="max-h-[80dvh] w-full object-contain"
          />
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setZoom(false)}>Stäng</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
