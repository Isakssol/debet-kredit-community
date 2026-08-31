/**
 * Utseendeteman: kuraterade accentfärger och bakgrundstoner. Standard är
 * "korall" på "gräddvit" (Wint-ljus). Varje accent definierar alla tokens som
 * hänger ihop med primärfärgen så helheten alltid är harmonisk.
 */

export type AccentPreset = {
  id: string;
  label: string;
  /** Visningsfärg för swatchen i inställningarna */
  swatch: string;
  vars: Record<string, string>;
};

const accent = (l: number, c: number, h: number) => ({
  "--primary": `oklch(${l} ${c} ${h})`,
  "--ring": `oklch(${l} ${c} ${h})`,
  "--sidebar-primary": `oklch(${l} ${c} ${h})`,
  "--sidebar-ring": `oklch(${l} ${c} ${h})`,
  "--chart-1": `oklch(${l} ${c} ${h})`,
  "--chart-2": `oklch(${Math.min(l + 0.16, 0.92)} ${Math.max(c - 0.07, 0.05)} ${h + 15})`,
  "--chart-3": `oklch(${Math.max(l - 0.2, 0.25)} ${Math.max(c - 0.11, 0.04)} ${h})`,
  "--accent": `oklch(0.94 0.03 ${h + 25})`,
});

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "korall", label: "Korall", swatch: "oklch(0.62 0.19 40)", vars: accent(0.62, 0.19, 40) },
  { id: "skog", label: "Skog", swatch: "oklch(0.55 0.13 150)", vars: accent(0.55, 0.13, 150) },
  { id: "hav", label: "Hav", swatch: "oklch(0.55 0.15 245)", vars: accent(0.55, 0.15, 245) },
  { id: "ljung", label: "Ljung", swatch: "oklch(0.55 0.18 300)", vars: accent(0.55, 0.18, 300) },
  { id: "bar", label: "Bär", swatch: "oklch(0.58 0.2 15)", vars: accent(0.58, 0.2, 15) },
  { id: "midnatt", label: "Midnatt", swatch: "oklch(0.35 0.05 260)", vars: accent(0.42, 0.07, 260) },
];

export type BackgroundPreset = {
  id: string;
  label: string;
  swatch: string;
  vars: Record<string, string>;
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "graddvit", label: "Gräddvit", swatch: "oklch(0.975 0.012 75)",
    vars: {},   // standard — inga överskrivningar
  },
  {
    id: "sval", label: "Sval", swatch: "oklch(0.975 0.005 250)",
    vars: {
      "--background": "oklch(0.975 0.005 250)",
      "--muted": "oklch(0.955 0.006 250)",
      "--secondary": "oklch(0.95 0.008 250)",
      "--border": "oklch(0.905 0.008 250)",
      "--input": "oklch(0.905 0.008 250)",
      "--sidebar": "oklch(0.945 0.008 250)",
      "--sidebar-border": "oklch(0.885 0.01 250)",
      "--sidebar-accent": "oklch(0.9 0.012 250)",
    },
  },
  {
    id: "ren", label: "Ren vit", swatch: "oklch(0.995 0 0)",
    vars: {
      "--background": "oklch(0.99 0 0)",
      "--muted": "oklch(0.965 0 0)",
      "--secondary": "oklch(0.96 0 0)",
      "--border": "oklch(0.915 0 0)",
      "--input": "oklch(0.915 0 0)",
      "--sidebar": "oklch(0.965 0 0)",
      "--sidebar-border": "oklch(0.9 0 0)",
      "--sidebar-accent": "oklch(0.92 0 0)",
    },
  },
];

/** Bygg CSS-överskrivningar för valt tema (tomt = standard) */
export function buildThemeCss(accentId?: string | null, backgroundId?: string | null): string {
  const vars: Record<string, string> = {};
  const acc = ACCENT_PRESETS.find((a) => a.id === accentId);
  const bg = BACKGROUND_PRESETS.find((b) => b.id === backgroundId);
  if (acc && acc.id !== "korall") Object.assign(vars, acc.vars);
  if (bg && bg.id !== "graddvit") Object.assign(vars, bg.vars);
  if (!Object.keys(vars).length) return "";
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
