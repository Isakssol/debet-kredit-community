import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAccountLines } from "@/lib/reports/data";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SECTIONS = [
  { title: "Rörelsens intäkter", from: 3000, to: 3999 },
  { title: "Rörelsens kostnader", from: 4000, to: 7699 },
  { title: "Avskrivningar", from: 7700, to: 7899 },
  { title: "Övriga rörelseposter", from: 7900, to: 8299 },
  { title: "Finansiella poster", from: 8300, to: 8899 },
];

export default async function ResultReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const supabase = await createClient();
  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .eq("status", "open").order("year", { ascending: false }).limit(1).single();

  const periodStart = from ?? fy?.start_date;
  const periodEnd = to ?? fy?.end_date;
  const lines = fy ? await getAccountLines(fy.id, periodStart, periodEnd) : [];
  const resultLines = lines.filter((l) => l.class >= 3 && l.account !== 8999);

  const year = fy?.year ?? 2026;
  const quarters = [1, 2, 3, 4].map((q) => ({
    label: `Q${q}`,
    from: `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`,
    to: `${year}-${String(q * 3).padStart(2, "0")}-${q === 1 ? 31 : q === 2 ? 30 : q === 3 ? 30 : 31}`,
  }));

  let totalPeriod = 0;
  let totalAcc = 0;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Resultatrapport</h1>
          <p className="text-sm text-muted-foreground">
            Räkenskapsår {fy?.year} · Period {periodStart} – {periodEnd}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" asChild>
            <a href={`/rapporter/pdf?typ=resultat${from ? `&from=${from}&to=${to}` : ""}`} target="_blank">PDF</a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/rapporter/csv?typ=resultat">CSV</a>
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5">
        <Link href="/rapporter/resultat"
          className={`px-2.5 py-1 rounded border text-sm ${!from ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
          Helår
        </Link>
        {quarters.map((q) => (
          <Link key={q.label} href={`/rapporter/resultat?from=${q.from}&to=${q.to}`}
            className={`px-2.5 py-1 rounded border text-sm ${from === q.from ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
            {q.label}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Konto</TableHead>
            <TableHead>Benämning</TableHead>
            <TableHead className="text-right w-32">Period</TableHead>
            <TableHead className="text-right w-32">Ackumulerat</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SECTIONS.map((section) => {
            const sectionLines = resultLines.filter(
              (l) => l.account >= section.from && l.account <= section.to
                && (Math.abs(l.period) >= 0.005 || Math.abs(l.closing) >= 0.005)
            );
            if (!sectionLines.length) return null;
            const sumPeriod = sectionLines.reduce((s, l) => s - l.period, 0);
            const sumAcc = sectionLines.reduce((s, l) => s - l.closing, 0);
            totalPeriod += sumPeriod;
            totalAcc += sumAcc;
            return [
              <TableRow key={section.title} className="bg-muted/50">
                <TableCell colSpan={4} className="font-medium">{section.title}</TableCell>
              </TableRow>,
              ...sectionLines.map((l) => (
                <TableRow key={l.account}>
                  <TableCell className="font-mono">{l.account}</TableCell>
                  <TableCell>
                    <Link href={`/rapporter/huvudbok?konto=${l.account}`} className="hover:underline">
                      {l.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(-l.period)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(-l.closing)}</TableCell>
                </TableRow>
              )),
              <TableRow key={section.title + "-sum"} className="font-medium border-t">
                <TableCell />
                <TableCell>Summa {section.title.toLowerCase()}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(sumPeriod)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(sumAcc)}</TableCell>
              </TableRow>,
            ];
          })}
          <TableRow className="border-t-2 font-semibold text-base">
            <TableCell />
            <TableCell>BERÄKNAT RESULTAT</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(totalPeriod)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(totalAcc)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
