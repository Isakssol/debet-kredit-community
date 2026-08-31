"use client";

import { useState } from "react";

/**
 * Månadsdiagram med interaktiva staplar: hovra eller klicka på en stapel
 * så visas månadens belopp i en bubbla ovanför. Inga beroenden — ren SVG.
 */
export function MonthlyChart({ months }: { months: { label: string; value: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...months.map((m) => Math.abs(m.value)), 1);
  const H = 120;
  const zero = H / 2;
  const W = months.length * 40;

  const fmt = (n: number) => Math.round(n).toLocaleString("sv-SE") + " kr";

  return (
    <div className="relative">
      {active !== null && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-xl bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg whitespace-nowrap transition-all duration-150"
          style={{ left: `${((active * 40 + 20) / W) * 100}%` }}
        >
          <span className="opacity-70">{months[active].label}</span>{" "}
          <span className="tabular-nums">{fmt(months[active].value)}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="w-full h-36"
        onMouseLeave={() => setActive(null)}
      >
        <line x1="0" y1={zero} x2={W} y2={zero} stroke="currentColor" strokeOpacity="0.15" />
        {months.map((m, i) => {
          const h = Math.abs(m.value) / max * (H / 2 - 6);
          const y = m.value >= 0 ? zero - h : zero;
          const isActive = active === i;
          return (
            <g
              key={m.label}
              className="cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(isActive ? null : i)}
            >
              {/* Osynlig träffyta över hela kolumnen — lätt att träffa även på mobil */}
              <rect x={i * 40} y={0} width={40} height={H + 18} fill="transparent" />
              <rect
                x={i * 40 + 8}
                y={y}
                width={24}
                height={Math.max(h, m.value !== 0 ? 2 : 0)}
                rx={4}
                className={`transition-opacity duration-150 ${
                  m.value >= 0 ? "fill-primary" : "fill-destructive/70"
                } ${active === null || isActive ? "opacity-100" : "opacity-35"}`}
              />
              <text
                x={i * 40 + 20}
                y={H + 14}
                textAnchor="middle"
                fontSize="9"
                className={isActive ? "fill-foreground font-semibold" : "fill-muted-foreground"}
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
