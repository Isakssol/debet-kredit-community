/** Månatligt resultat som lätt SVG-stapeldiagram (inga beroenden) */
export function MonthlyChart({ months }: { months: { label: string; value: number }[] }) {
  const max = Math.max(...months.map((m) => Math.abs(m.value)), 1);
  const H = 120;
  const zero = H / 2;

  return (
    <div>
      <svg viewBox={`0 0 ${months.length * 40} ${H + 18}`} className="w-full h-36">
        <line x1="0" y1={zero} x2={months.length * 40} y2={zero}
          stroke="currentColor" strokeOpacity="0.15" />
        {months.map((m, i) => {
          const h = Math.abs(m.value) / max * (H / 2 - 6);
          const y = m.value >= 0 ? zero - h : zero;
          return (
            <g key={m.label}>
              <rect
                x={i * 40 + 8} y={y} width={24} height={Math.max(h, m.value !== 0 ? 2 : 0)}
                rx={3}
                className={m.value >= 0 ? "fill-primary" : "fill-destructive/70"}
              >
                <title>{m.label}: {Math.round(m.value).toLocaleString("sv-SE")} kr</title>
              </rect>
              <text x={i * 40 + 20} y={H + 14} textAnchor="middle"
                className="fill-muted-foreground" fontSize="9">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
