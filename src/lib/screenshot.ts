/**
 * Skärmbild av sidan, tagen i webbläsaren och alltid förhandsvisad för
 * kunden innan något skickas.
 *
 * Bibliotek: modern-screenshot. Valet är principiellt, inte smakbaserat.
 * Biblioteket serialiserar DOM:en till <svg><foreignObject> och låter
 * WEBBLÄSAREN rasta den. Det har alltså ingen egen CSS-färgparser och kan
 * därför aldrig gå bet på en färgfunktion — appens palett är oklch rakt
 * igenom, och varje opacitetsklass i Tailwind v4 blir color-mix(). Bibliotek
 * som ritar om sidan för hand (html2canvas-familjen) måste förstå varje
 * färgfunktion själv; den äldre html2canvas avbryter rakt av på oklch.
 *
 * Paketet laddas med dynamisk import först när kunden trycker på knappen —
 * det ligger inte i bundlen för de sidor ingen rapporterar från.
 */

export const SCREENSHOT_LIMITS = {
  /** Bredd i CSS-pixlar som bilden skalas ner till. */
  maxWidthPx: 1400,
  /** Hårt tak efter komprimering. Base64 av detta ryms i postens 3 MB. */
  maxBytes: 1_500_000,
  /** Kvalitetssteg. Blir bilden för stor tas den om, inte kastas. */
  qualitySteps: [0.8, 0.6, 0.45] as const,
  mimeType: "image/jpeg" as const,
} as const;

/** Element med det här attributet hamnar aldrig i bilden. */
export const SKIP_CAPTURE_ATTR = "data-skip-capture";

/** Klassen som lägger på maskeringen medan bilden tas. */
export const MASK_CLASS = "felrapport-maskerad";

/** Klassen som ligger på <html> under själva tagningen. */
export const CAPTURING_CLASS = "felrapport-tar-bild";

/**
 * Rapportdialogen ska aldrig fotografera sig själv, och dess bakgrundsdimma
 * ska aldrig lägga sig över bilden. `filter` nedan sållar bort noderna ur
 * kopian; de här reglerna tar dessutom bort dem ur den renderade sidan, så
 * att inget hinner ligga kvar i en halvfärdig omritning. Overlayerna kan inte
 * bära attributet — de renderas av Radix egen portal — och pekas därför ut.
 */
export const CAPTURE_CSS = `
.${CAPTURING_CLASS} [${SKIP_CAPTURE_ATTR}],
.${CAPTURING_CLASS} [data-slot="dialog-overlay"],
.${CAPTURING_CLASS} [data-slot="sheet-overlay"] {
  display: none !important;
}
`;

/**
 * Maskeringen. Sifferkolumner och allt som märkts som känsligt suddas — layout
 * och felmeddelanden syns fortfarande, vilket är det felsökningen behöver.
 *
 * `.tabular-nums` är appens egen konvention för belopp och summor och används
 * på över hundra ställen; `[data-sensitive]` är kroken för det som behöver
 * pekas ut särskilt.
 */
export const MASK_CSS = `
.${MASK_CLASS} [data-sensitive],
.${MASK_CLASS} .tabular-nums,
.${MASK_CLASS} table .text-right {
  filter: blur(5px) !important;
}
`;

/** 1×1 genomskinlig PNG — det som ritas i stället för en extern resurs. */
const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Får den här resursen hämtas under tagningen?
 *
 * Skärmbilden ska inte kunna få appen att prata med någon utanför den egna
 * installationen. Typsnitten kommer från next/font och ligger på samma
 * origin under /_next/static/media; ikonerna är inline-SVG. Allt annat
 * ersätts med en genomskinlig pixel i stället för att hämtas.
 */
export function isAllowedCaptureResource(url: string, origin: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (/^(data|blob):/i.test(value)) return true;
  try {
    return new URL(value, origin).origin === origin;
  } catch {
    return false;
  }
}

/** Nedskalning så en 3× DPR-telefonskärm inte blir en flermegabytesbild. */
export function captureScale(innerWidth: number): number {
  if (!Number.isFinite(innerWidth) || innerWidth <= 0) return 1;
  return Math.min(1, SCREENSHOT_LIMITS.maxWidthPx / innerWidth);
}

/** Ungefärlig storlek i byte på det en data-URL bär. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/** Dela upp en data-URL i mime-typ och base64 — formen endpointen tar emot. */
export function splitDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export type Screenshot = {
  /** Hela data-URL:en, för förhandsvisningen. */
  dataUrl: string;
  mimeType: string;
  /** Ren base64 utan prefix, för utskicket. */
  data: string;
  bytes: number;
  takenAt: string;
  masked: boolean;
};

export type CaptureResult =
  | { ok: true; screenshot: Screenshot }
  | { ok: false; error: string };

/**
 * Ta bilden. Anroparen ansvarar för att dölja sin egen dialog först —
 * elementet ska bära data-skip-capture, annars fotograferar rapporten sig
 * själv.
 */
export async function captureScreenshot(
  options: { mask: boolean; now?: () => Date } = { mask: true },
): Promise<CaptureResult> {
  if (typeof document === "undefined") {
    return { ok: false, error: "Skärmbilden gick inte att ta just nu. Rapporten går att skicka ändå." };
  }

  const root = document.documentElement;
  const style = document.createElement("style");
  style.setAttribute(SKIP_CAPTURE_ATTR, "");
  style.textContent = options.mask ? `${CAPTURE_CSS}\n${MASK_CSS}` : CAPTURE_CSS;

  try {
    document.head.appendChild(style);
    root.classList.add(CAPTURING_CLASS);
    if (options.mask) root.classList.add(MASK_CLASS);
    // Två bildrutor: en för att stilarna ska slå igenom, en för att
    // omritningen ska hinna bli klar innan DOM:en serialiseras.
    await nextFrame();
    await nextFrame();

    const { domToJpeg } = await import("modern-screenshot");
    const origin = window.location.origin;
    const scale = captureScale(window.innerWidth);

    let dataUrl = "";
    for (const quality of SCREENSHOT_LIMITS.qualitySteps) {
      dataUrl = await domToJpeg(root, {
        quality,
        scale: quality === SCREENSHOT_LIMITS.qualitySteps[0] ? scale : scale * 0.75,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        filter: (node: Node) => !(node as Element)?.hasAttribute?.(SKIP_CAPTURE_ATTR),
        // Låset: inga anrop utanför den egna origin under tagningen.
        fetchFn: async (url: string) =>
          isAllowedCaptureResource(url, origin) ? false : TRANSPARENT_PIXEL,
        fetch: { requestInit: { cache: "force-cache" } },
      });
      if (dataUrlBytes(dataUrl) <= SCREENSHOT_LIMITS.maxBytes) break;
    }

    const parts = splitDataUrl(dataUrl);
    if (!parts) {
      return { ok: false, error: "Skärmbilden gick inte att ta just nu. Rapporten går att skicka ändå." };
    }
    const bytes = dataUrlBytes(dataUrl);
    if (bytes > SCREENSHOT_LIMITS.maxBytes) {
      return {
        ok: false,
        error: "Skärmbilden blev för stor för att skickas. Rapporten går att skicka utan den.",
      };
    }

    return {
      ok: true,
      screenshot: {
        dataUrl,
        mimeType: parts.mimeType,
        data: parts.data,
        bytes,
        takenAt: (options.now?.() ?? new Date()).toISOString(),
        masked: options.mask,
      },
    };
  } catch {
    return { ok: false, error: "Skärmbilden gick inte att ta just nu. Rapporten går att skicka ändå." };
  } finally {
    root.classList.remove(MASK_CLASS);
    root.classList.remove(CAPTURING_CLASS);
    style.remove();
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}
