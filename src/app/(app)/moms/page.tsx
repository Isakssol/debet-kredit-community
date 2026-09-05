import { createClient } from "@/lib/supabase/server";
import { getVatEntries } from "@/lib/actions/vat";
import { computeVatBoxes, computeVatChecks, vatPeriods, BOX_LABELS, BOX_ORDER } from "@/lib/vat/report";
import { VatPeriodActions } from "@/components/vat-period-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { todayISO } from "@/lib/dates";

export default async function VatPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: selectedStart } = await searchParams;
  const supabase = await createClient();

  const [{ data: settings }, { data: fy }, { data: reports }] = await Promise.all([
    supabase.from("settings").select("vat_period, eu_trade, org_number").eq("id", 1).single(),
    supabase.from("fiscal_years").select("*").eq("status", "open")
      .order("year", { ascending: false }).limit(1).single(),
    supabase.from("vat_reports").select("*"),
  ]);

  const periods = vatPeriods(
    fy?.year ?? 2026,
    (settings?.vat_period ?? "kvartal") as "manad" | "kvartal" | "helar",
    settings?.eu_trade ?? false
  );
  const today = todayISO();
  const selected = periods.find((p) => p.start === selectedStart)
    ?? periods.filter((p) => p.start <= today).pop()
    ?? periods[0];

  const report = (reports ?? []).find((r) => r.period_start === selected.start);
  const entries = await getVatEntries(selected.start, selected.end);
  const { boxes } = report?.status === "approved"
    ? { boxes: report.boxes as Record<string, number> }
    : computeVatBoxes(entries);

  const isApproved = report?.status === "approved";
  const payable = boxes["49"] ?? 0;
  const checks = computeVatChecks(entries);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Moms</h1>
        <p className="text-sm text-muted-foreground">
          Redovisningsperiod: {settings?.vat_period === "manad" ? "månad" : settings?.vat_period === "helar" ? "helår" : "kvartal"} · ändras under Inställningar
        </p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {periods.map((p) => {
          const r = (reports ?? []).find((x) => x.period_start === p.start);
          return (
            <a key={p.start} href={`/moms?period=${p.start}`}
              className={`px-3 py-1.5 rounded border text-sm ${
                p.start === selected.start ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}>
              {p.label} {r?.status === "approved" ? "✓" : ""}
            </a>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Momsdeklaration {selected.label}
              </CardTitle>
              <CardDescription>
                {selected.start} – {selected.end} · Deklareras senast {selected.dueDate}
              </CardDescription>
            </div>
            <Badge variant={isApproved ? "default" : "secondary"}>
              {isApproved ? "Redovisad" : "Preliminär"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ruta</TableHead>
                <TableHead>Beskrivning</TableHead>
                <TableHead className="text-right">Belopp (kr)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BOX_ORDER.filter((b) => (boxes[b] ?? 0) !== 0 || b === "49").map((box) => (
                <TableRow key={box} className={box === "49" ? "font-semibold border-t-2" : ""}>
                  <TableCell className="font-mono">{box}</TableCell>
                  <TableCell>{BOX_LABELS[box]}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(boxes[box] ?? 0).toLocaleString("sv-SE")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="text-sm text-muted-foreground">
            {payable > 0
              ? `${payable.toLocaleString("sv-SE")} kr att betala — ska finnas på skattekontot senast ${selected.dueDate}.`
              : payable < 0
                ? `${(-payable).toLocaleString("sv-SE")} kr att få tillbaka.`
                : "Ingen moms att redovisa för perioden."}
          </div>

          {checks.length > 0 && (
            <div className="rounded border bg-muted/30 p-3 space-y-1">
              <div className="text-sm font-medium">Momskontroller</div>
              {checks.map((c) => (
                <div key={c.label} className="text-sm flex gap-2">
                  <span>{c.ok ? "✅" : "⚠️"}</span>
                  <span>
                    {c.label}
                    <span className="block text-xs text-muted-foreground">{c.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <VatPeriodActions
            periodStart={selected.start}
            periodEnd={selected.end}
            isApproved={isApproved}
            payable={payable}
            hasEskd={!!report?.eskd_xml}
            verificationId={report?.verification_id ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
