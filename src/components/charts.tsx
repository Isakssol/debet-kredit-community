"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatSEK, kronorToOre } from "@/lib/money";

/**
 * Diagrammen på Analys-sidan.
 *
 * Husets formspråk kommer från `monthly-chart.tsx`: ren inline-SVG utan
 * bibliotek, hela kolumnen är träffyta (viktigt på telefon), tooltip i
 * bg-foreground/text-background, icke-aktiva staplar nedtonade till 35 %.
 *
 * Färgregel: bara `--chart-1/2/3`, `--destructive` och `--muted-foreground`.
 * `--chart-4` och `--chart-5` skrivs inte om när användaren väljer egen
 * accentfärg (se lib/theme.ts) och skär sig då mot resten av gränssnittet.
 *
 * Vågräta staplar ritas i HTML i stället för SVG — där är innehållet text som
 * ska kunna kapas, radbrytas och läsas av en skärmläsare, och det gör CSS
 * bättre än en SVG-etikett. Samma färgvariabler, samma uttryck.
 */

export type ChartColor = "chart-1" | "chart-2" | "chart-3" | "destructive";

/**
 * Enheten anges som ett ord, inte som en funktion.
 *
 * Analys-sidan är en serverkomponent och diagrammen är klientkomponenter. En
 * funktion går inte över den gränsen — React vägrar rendera och hela sidan
 * faller ned i felgränsen. Därför skickas "sek" eller "procent" och
 * formateringen sker här inne, precis som i monthly-chart.tsx.
 */
export type ChartUnit = "sek" | "percent";

function formatValue(n: number, unit: ChartUnit): string {
  return unit === "percent"
    ? `${n.toFixed(1).replace(".", ",")} %`
    : formatSEK(kronorToOre(n));
}

const FILL: Record<ChartColor, string> = {
  "chart-1": "fill-chart-1",
  "chart-2": "fill-chart-2",
  "chart-3": "fill-chart-3",
  destructive: "fill-destructive",
};
const STROKE: Record<ChartColor, string> = {
  "chart-1": "stroke-chart-1",
  "chart-2": "stroke-chart-2",
  "chart-3": "stroke-chart-3",
  destructive: "stroke-destructive",
};
const BG: Record<ChartColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  destructive: "bg-destructive",
};

/** Tom yta med en förklaring — aldrig ett tomt kort utan besked. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-24 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Färgprick + text. Delas av alla diagram som har fler än en serie. */
export function ChartLegend({
  items,
}: { items: { label: string; color: ChartColor; faded?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", BG[i.color],
            i.faded && "opacity-45")} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Bubblan som följer den aktiva kolumnen. Position i procent av bredden. */
function Tooltip({ leftPct, children }: { leftPct: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-xl bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg transition-all duration-150"
      style={{
        left: `${Math.min(88, Math.max(12, leftPct))}%`,
        // Bubblan får inte skjuta ut ur kortet på telefon
        maxWidth: "min(16rem, 80%)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Grupperade staplar per period, med valfri linje ovanpå.
 *
 * Används för omsättning i år mot i fjol med årets resultat som linje — tre
 * mått i samma bild utan att någon av dem blir svårläst.
 */
export function GroupedBarChart({
  labels, series, line, unit = "sek",
}: {
  labels: string[];
  series: { label: string; values: number[]; color: ChartColor; faded?: boolean }[];
  line?: { label: string; values: number[]; color: ChartColor };
  unit?: ChartUnit;
}) {
  const [active, setActive] = useState<number | null>(null);
  const format = (n: number) => formatValue(n, unit);
  const all = [...series.flatMap((s) => s.values), ...(line?.values ?? [])];

  const SLOT = 46, H = 150, PAD_BOTTOM = 18, PAD_TOP = 4;
  const W = labels.length * SLOT;
  // Nollinjen läggs där den faktiskt hör hemma: efter hur stort det största
  // överskottet är mot det största underskottet. En fast andel (t.ex. 60/40)
  // låter en enda djupt negativ månad rita utanför rutan.
  const maxPos = Math.max(0, ...all);
  const maxNeg = Math.max(0, ...all.map((v) => -v));
  const range = maxPos + maxNeg || 1;
  const span = H - PAD_TOP * 2;
  const zero = PAD_TOP + (maxPos / range) * span;
  const scale = (v: number) => (Math.abs(v) / range) * span;
  const barW = Math.max(5, (SLOT - 12) / series.length);

  const pointsFor = (values: number[]) => values
    .map((v, i) => `${i * SLOT + SLOT / 2},${zero - (v >= 0 ? scale(v) : -scale(v))}`)
    .join(" ");

  return (
    <div className="relative">
      {active !== null && (
        <Tooltip leftPct={((active * SLOT + SLOT / 2) / W) * 100}>
          <div className="opacity-70">{labels[active]}</div>
          {series.map((s) => (
            <div key={s.label} className="whitespace-nowrap tabular-nums">
              {s.label}: {format(s.values[active] ?? 0)}
            </div>
          ))}
          {line && (
            <div className="whitespace-nowrap tabular-nums">
              {line.label}: {format(line.values[active] ?? 0)}
            </div>
          )}
        </Tooltip>
      )}
      <svg viewBox={`0 0 ${W} ${H + PAD_BOTTOM}`} className="h-44 w-full"
        onMouseLeave={() => setActive(null)}>
        <line x1="0" y1={zero} x2={W} y2={zero} stroke="currentColor" strokeOpacity="0.15" />
        {labels.map((label, i) => {
          const isActive = active === i;
          const dim = active !== null && !isActive;
          return (
            <g key={label} className="cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(isActive ? null : i)}>
              {/* Hela kolumnen är träffyta — staplarna är för smala för fingrar */}
              <rect x={i * SLOT} y={0} width={SLOT} height={H + PAD_BOTTOM} fill="transparent" />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const h = scale(v);
                return (
                  <rect key={s.label}
                    x={i * SLOT + 6 + si * barW}
                    y={v >= 0 ? zero - h : zero}
                    width={barW - 1.5}
                    height={Math.max(h, v !== 0 ? 1.5 : 0)}
                    rx={2.5}
                    className={cn("transition-opacity duration-150", FILL[s.color],
                      s.faded ? (dim ? "opacity-20" : "opacity-45") : dim ? "opacity-35" : "opacity-100")}
                  />
                );
              })}
              <text x={i * SLOT + SLOT / 2} y={H + 14} textAnchor="middle" fontSize="9"
                className={isActive ? "fill-foreground font-semibold" : "fill-muted-foreground"}>
                {label}
              </text>
            </g>
          );
        })}
        {line && (
          <polyline points={pointsFor(line.values)} fill="none" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"
            className={cn(STROKE[line.color], "pointer-events-none")} />
        )}
      </svg>
    </div>
  );
}

/**
 * Linjediagram för ett mått över tid, med nollinje.
 *
 * `null` betyder "inget att mäta den månaden" och bryter linjen i stället för
 * att dra den till noll — annars påstår bilden att marginalen kollapsade en
 * månad utan försäljning.
 */
export function LineChart({
  labels, values, unit = "sek", color = "chart-1",
}: {
  labels: string[];
  values: (number | null)[];
  unit?: ChartUnit;
  color?: ChartColor;
}) {
  const [active, setActive] = useState<number | null>(null);
  const format = (n: number) => formatValue(n, unit);
  const present = values.filter((v): v is number => v !== null);
  const max = Math.max(...present.map(Math.abs), 1);
  const SLOT = 46, H = 130, PAD_BOTTOM = 18;
  const W = labels.length * SLOT;
  const hasNegative = present.some((v) => v < 0);
  const zero = hasNegative ? H / 2 : H - 6;
  const span = hasNegative ? H / 2 - 6 : H - 12;
  const y = (v: number) => zero - (v / max) * span;

  // Linjen bryts vid null: varje obruten följd blir en egen polyline
  const runs: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push({ i, v });
    }
  });
  if (run.length) runs.push(run);

  return (
    <div className="relative">
      {active !== null && values[active] !== null && (
        <Tooltip leftPct={((active * SLOT + SLOT / 2) / W) * 100}>
          <span className="opacity-70">{labels[active]}</span>{" "}
          <span className="tabular-nums">{format(values[active]!)}</span>
        </Tooltip>
      )}
      <svg viewBox={`0 0 ${W} ${H + PAD_BOTTOM}`} className="h-40 w-full"
        onMouseLeave={() => setActive(null)}>
        <line x1="0" y1={zero} x2={W} y2={zero} stroke="currentColor" strokeOpacity="0.15" />
        {runs.filter((r) => r.length > 1).map((run) => (
          <polyline key={run[0].i} fill="none" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" className={STROKE[color]}
            points={run.map((p) => `${p.i * SLOT + SLOT / 2},${y(p.v)}`).join(" ")} />
        ))}
        {labels.map((label, i) => {
          const v = values[i];
          const isActive = active === i;
          return (
            <g key={label} className="cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(isActive ? null : i)}>
              <rect x={i * SLOT} y={0} width={SLOT} height={H + PAD_BOTTOM} fill="transparent" />
              {v !== null && (
                <circle cx={i * SLOT + SLOT / 2} cy={y(v)} r={isActive ? 4 : 2.5}
                  className={cn(FILL[color], "transition-all duration-150",
                    active !== null && !isActive ? "opacity-35" : "opacity-100")} />
              )}
              <text x={i * SLOT + SLOT / 2} y={H + 14} textAnchor="middle" fontSize="9"
                className={isActive ? "fill-foreground font-semibold" : "fill-muted-foreground"}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Pareto: staplar för de största posterna plus den ackumulerade andelen som
 * linje. Svarar på frågan "hur många kunder står för halva omsättningen?".
 */
export function ParetoChart({
  items, unit = "sek",
}: {
  items: { label: string; value: number; cumulative: number }[];
  unit?: ChartUnit;
}) {
  const [active, setActive] = useState<number | null>(null);
  const format = (n: number) => formatValue(n, unit);
  const max = Math.max(...items.map((i) => i.value), 1);
  const SLOT = 46, H = 140, PAD_BOTTOM = 26;
  const W = items.length * SLOT;
  const barTop = (v: number) => H - (v / max) * (H - 10);

  return (
    <div className="relative">
      {active !== null && (
        <Tooltip leftPct={((active * SLOT + SLOT / 2) / W) * 100}>
          <div className="opacity-70">{items[active].label}</div>
          <div className="whitespace-nowrap tabular-nums">
            {format(items[active].value)} · {Math.round(items[active].cumulative * 100)} % ackumulerat
          </div>
        </Tooltip>
      )}
      <svg viewBox={`0 0 ${W} ${H + PAD_BOTTOM}`} className="h-44 w-full"
        onMouseLeave={() => setActive(null)}>
        <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" strokeOpacity="0.15" />
        {/* 80 %-linjen: den klassiska tumregeln, utsatt så den går att sikta på */}
        <line x1="0" y1={H - 0.8 * (H - 10)} x2={W} y2={H - 0.8 * (H - 10)}
          stroke="currentColor" strokeOpacity="0.2" strokeDasharray="3 3" />
        {items.map((item, i) => {
          const isActive = active === i;
          const dim = active !== null && !isActive;
          return (
            <g key={item.label} className="cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(isActive ? null : i)}>
              <rect x={i * SLOT} y={0} width={SLOT} height={H + PAD_BOTTOM} fill="transparent" />
              <rect x={i * SLOT + 8} y={barTop(item.value)} width={SLOT - 16}
                height={Math.max(H - barTop(item.value), 1.5)} rx={3}
                className={cn("fill-chart-1 transition-opacity duration-150",
                  dim ? "opacity-35" : "opacity-100")} />
              <text x={i * SLOT + SLOT / 2} y={H + 12} textAnchor="middle" fontSize="9"
                className={isActive ? "fill-foreground font-semibold" : "fill-muted-foreground"}>
                {i + 1}
              </text>
            </g>
          );
        })}
        <polyline fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          className="stroke-chart-3 pointer-events-none"
          points={items.map((it, i) => `${i * SLOT + SLOT / 2},${H - it.cumulative * (H - 10)}`).join(" ")} />
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">
        Staplarna är de största posterna i storleksordning, linjen deras
        ackumulerade andel. Den streckade linjen är 80 %.
      </p>
    </div>
  );
}

/**
 * Vågräta staplar med etikett och belopp. För topplistor där namnet är minst
 * lika viktigt som storleken.
 */
export function HBarChart({
  items, unit = "sek", color = "chart-1", href,
}: {
  items: { label: string; value: number; muted?: boolean; href?: string }[];
  unit?: ChartUnit;
  color?: ChartColor;
  /** Gemensam länk för alla rader — enskilda rader kan ha en egen i `item.href` */
  href?: string;
}) {
  const format = (n: number) => formatValue(n, unit);
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-1.5">
      {items.map((item) => {
        const link = item.href ?? href;
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate" title={item.label}>{item.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {format(item.value)}
              </span>
            </div>
            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-[width] duration-500",
                item.muted ? "bg-muted-foreground/40" : BG[color])}
                style={{ width: `${Math.max((item.value / max) * 100, 1.5)}%` }} />
            </div>
          </>
        );
        return (
          <li key={item.label}>
            {link ? <a href={link} className="block rounded hover:opacity-80">{row}</a> : row}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * En enda stapel delad i andelar, med legend under. Visar fördelning bättre än
 * fyra staplar bredvid varandra när summan är det intressanta.
 */
export function ShareBar({
  segments, unit = "sek",
}: {
  segments: { label: string; value: number; share: number }[];
  unit?: ChartUnit;
}) {
  const format = (n: number) => formatValue(n, unit);
  const colors: ChartColor[] = ["chart-1", "chart-2", "chart-3", "destructive"];
  return (
    <div className="space-y-3">
      <div className="flex h-7 w-full overflow-hidden rounded-lg">
        {segments.map((s, i) => (
          <div key={s.label} className={cn(BG[colors[i % colors.length]], "transition-all duration-500")}
            style={{ width: `${Math.max(s.share * 100, 1)}%` }}
            title={`${s.label}: ${format(s.value)}`} />
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        {segments.map((s, i) => (
          <li key={s.label} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className={cn("h-2.5 w-2.5 shrink-0 translate-y-0.5 rounded-sm",
                BG[colors[i % colors.length]])} />
              <span className="truncate" title={s.label}>{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {Math.round(s.share * 100)} % · {format(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
