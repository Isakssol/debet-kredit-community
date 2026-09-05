import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccountLines } from "@/lib/reports/data";
import { Button } from "@/components/ui/button";
import { DownloadButton } from "@/components/download-button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SECTIONS = [
  {
    title: "TILLGÅNGAR", flip: false,
    sub: [
      { title: "Anläggningstillgångar", from: 1000, to: 1399 },
      { title: "Omsättningstillgångar", from: 1400, to: 1999 },
    ],
  },
  {
    title: "EGET KAPITAL OCH SKULDER", flip: true,
    sub: [
      { title: "Eget kapital", from: 2000, to: 2099 },
      { title: "Kortfristiga skulder", from: 2100, to: 2999 },
    ],
  },
];

export default async function BalanceReportPage() {
  const supabase = await createClient();
  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .eq("status", "open").order("year", { ascending: false }).limit(1).single();

  const lines = fy ? await getAccountLines(fy.id) : [];
  const balanceLines = lines.filter((l) => l.class <= 2);
  const computedResult = lines.filter((l) => l.class >= 3)
    .reduce((s, l) => s - l.closing, 0);

  const sums: Record<string, { open: number; period: number; close: number }> = {};

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Balansrapport</h1>
          <p className="text-sm text-muted-foreground">
            Räkenskapsår {fy?.year} · {fy?.start_date} – {fy?.end_date}
          </p>
        </div>
        <div className="flex gap-1">
          <DownloadButton size="sm" newTab workingLabel="Bygger PDF:en…"
            href="/rapporter/pdf?typ=balans">PDF</DownloadButton>
          <DownloadButton variant="ghost" size="sm" workingLabel="Bygger CSV:n…"
            href="/rapporter/csv?typ=balans">CSV</DownloadButton>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Konto</TableHead>
            <TableHead>Benämning</TableHead>
            <TableHead className="text-right w-28">Ing balans</TableHead>
            <TableHead className="text-right w-28">Period</TableHead>
            <TableHead className="text-right w-28">Utg balans</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SECTIONS.map((section) => {
            const f = section.flip ? -1 : 1;
            sums[section.title] = { open: 0, period: 0, close: 0 };
            const rows = section.sub.flatMap((sub) => {
              const subLines = balanceLines.filter(
                (l) => l.account >= sub.from && l.account <= sub.to
                  && (Math.abs(l.opening) >= 0.005 || Math.abs(l.closing) >= 0.005 || Math.abs(l.period) >= 0.005)
              );
              if (!subLines.length) return [];
              const so = subLines.reduce((s, l) => s + f * l.opening, 0);
              const sp = subLines.reduce((s, l) => s + f * l.period, 0);
              const sc = subLines.reduce((s, l) => s + f * l.closing, 0);
              sums[section.title].open += so;
              sums[section.title].period += sp;
              sums[section.title].close += sc;
              return [
                <TableRow key={sub.title} className="bg-muted/50">
                  <TableCell colSpan={5} className="font-medium">{sub.title}</TableCell>
                </TableRow>,
                ...subLines.map((l) => (
                  <TableRow key={l.account}>
                    <TableCell className="font-mono">{l.account}</TableCell>
                    <TableCell>
                      <Link href={`/rapporter/huvudbok?konto=${l.account}`} className="hover:underline">
                        {l.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(f * l.opening)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(f * l.period)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(f * l.closing)}</TableCell>
                  </TableRow>
                )),
                <TableRow key={sub.title + "-sum"} className="font-medium border-t">
                  <TableCell />
                  <TableCell>Summa {sub.title.toLowerCase()}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(so)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(sp)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(sc)}</TableCell>
                </TableRow>,
              ];
            });

            const isEk = section.flip;
            return [
              <TableRow key={section.title}>
                <TableCell colSpan={5} className="font-semibold pt-4">{section.title}</TableCell>
              </TableRow>,
              ...rows,
              ...(isEk && Math.abs(computedResult) >= 0.005 ? [
                <TableRow key="result">
                  <TableCell />
                  <TableCell className="text-muted-foreground">Beräknat resultat</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(computedResult)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(computedResult)}</TableCell>
                </TableRow>,
              ] : []),
              <TableRow key={section.title + "-total"} className="font-semibold border-t-2">
                <TableCell />
                <TableCell>SUMMA {section.title}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(sums[section.title].open)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(sums[section.title].period + (isEk ? computedResult : 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(sums[section.title].close + (isEk ? computedResult : 0))}
                </TableCell>
              </TableRow>,
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}
