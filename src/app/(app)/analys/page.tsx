import Link from "next/link";
import { Megaphone, FileCode2, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSEK, kronorToOre } from "@/lib/money";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const AD_PARTIES = /google|meta|socialwick/i;
const FILE_PARTIES = /koelewijn|ecufiles|vitali|olsx|evc/i;

/** Kategorisera en affär utifrån verifikatets text (primär tjänst per verifikat) */
function serviceCategory(text: string): string {
  const t = text.toLowerCase();
  if (/dongel|obd.?flasher|at.?one/.test(t)) return "OBD-dongel";
  if (/steg ?1|motoroptimering/.test(t)) return "Steg 1 (+ ev. tillval)";
  if (/dpf/.test(t)) return "DPF OFF";
  if (/adblue|def removal/.test(t)) return "AdBlue OFF";
  if (/egr/.test(t)) return "EGR OFF";
  if (/cold ?start/.test(t)) return "Cold Start OFF";
  return "Övrigt";
}

type Row = {
  account: number; debit: number; credit: number; note: string | null;
  verifications: {
    id: string; number: number; verification_date: string;
    description: string; counterparty: string | null; source: string;
  };
};

export default async function AnalysPage() {
  const supabase = await createClient();

  const [{ data: rowsRaw }, { data: allVers }] = await Promise.all([
    supabase
      .from("verification_rows")
      .select("account, debit, credit, note, verifications!inner(id, number, verification_date, description, counterparty, source)")
      .gte("account", 3000).lte("account", 7999),
    supabase
      .from("verifications")
      .select("id, number, verification_date, description, source, attachments(id), verification_series(code)")
      .neq("source", "correction")
      .order("verification_date", { ascending: false }),
  ]);

  const rows = (rowsRaw ?? []) as unknown as Row[];

  // ---------- Kostnader per motpart × månad ----------
  const costByParty = new Map<string, { months: number[]; total: number }>();
  const monthsWithData = new Set<number>();
  for (const r of rows) {
    if (r.account < 4000) continue;
    const amount = Number(r.debit) - Number(r.credit);
    if (amount === 0) continue;
    const party = r.verifications.counterparty ?? "(utan motpart)";
    const m = parseInt(r.verifications.verification_date.slice(5, 7)) - 1;
    monthsWithData.add(m);
    const e = costByParty.get(party) ?? { months: Array(12).fill(0), total: 0 };
    e.months[m] += amount; e.total += amount;
    costByParty.set(party, e);
  }
  const months = [...monthsWithData].sort((a, b) => a - b);
  const costRows = [...costByParty.entries()].sort((a, b) => b[1].total - a[1].total);
  const costTotal = costRows.reduce((s, [, e]) => s + e.total, 0);

  // ---------- Försäljning per kund & tjänst ----------
  const byCustomer = new Map<string, { total: number; count: Set<string> }>();
  const byService = new Map<string, { total: number; count: Set<string> }>();
  const adCost = { total: 0 };
  const fileCost = { total: 0 };
  let revenueTotal = 0;
  const salesVerIds = new Set<string>();

  for (const r of rows) {
    const v = r.verifications;
    if (r.account >= 3000 && r.account <= 3799) {
      const amount = Number(r.credit) - Number(r.debit);
      revenueTotal += amount;
      if (v.source !== "correction") salesVerIds.add(v.id);
      const cust = v.counterparty ?? "(okänd kund)";
      const c = byCustomer.get(cust) ?? { total: 0, count: new Set() };
      c.total += amount; c.count.add(v.id); byCustomer.set(cust, c);
      const cat = serviceCategory(`${v.description} ${r.note ?? ""}`);
      const sv = byService.get(cat) ?? { total: 0, count: new Set() };
      sv.total += amount; sv.count.add(v.id); byService.set(cat, sv);
    } else if (r.account >= 4000) {
      const amount = Number(r.debit) - Number(r.credit);
      const party = v.counterparty ?? "";
      if (AD_PARTIES.test(party)) adCost.total += amount;
      if (FILE_PARTIES.test(party)) fileCost.total += amount;
    }
  }
  const salesCount = salesVerIds.size;
  const custRows = [...byCustomer.entries()].sort((a, b) => b[1].total - a[1].total);
  const svcRows = [...byService.entries()].sort((a, b) => b[1].total - a[1].total);

  // ---------- Underlagsjakt ----------
  const missing = (allVers ?? []).filter((v) => (v.attachments as { id: string }[]).length === 0);

  const kpis = [
    {
      title: "Marknadsföring i år", icon: Megaphone,
      value: kronorToOre(adCost.total),
      sub: salesCount > 0 ? `${formatSEK(kronorToOre(adCost.total / salesCount))} per affär (CAC)` : "inga affärer ännu",
    },
    {
      title: "Filer & tuningmjukvara i år", icon: FileCode2,
      value: kronorToOre(fileCost.total),
      sub: salesCount > 0 ? `${formatSEK(kronorToOre(fileCost.total / salesCount))} per affär (inkl. credits-lager & licenser)` : "",
    },
    {
      title: "Verifikat utan underlag", icon: Paperclip,
      value: null as number | null,
      raw: `${missing.length} st`,
      sub: missing.length ? "arkiveringsplikt 7 år — komplettera nedan" : "allt komplett 🎉",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Analys</h1>
        <p className="text-sm text-muted-foreground">
          Kostnader per leverantör, försäljning per kund och tjänst — allt exkl. moms.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {kpis.map((k) => (
          <Card key={k.title}>
            <CardContent className="pt-4 flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{k.title}</div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {k.value !== null ? formatSEK(k.value) : k.raw}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{k.sub}</div>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <k.icon className="h-4.5 w-4.5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Kostnader per leverantör och månad</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1.5 font-medium">Leverantör/motpart</th>
                  {months.map((m) => (
                    <th key={m} className="text-right py-1.5 font-medium">{MONTH_LABELS[m]}</th>
                  ))}
                  <th className="text-right py-1.5 font-medium">Totalt</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {costRows.map(([party, e]) => (
                  <tr key={party}>
                    <td className="py-1.5 pr-2 truncate max-w-52">{party}</td>
                    {months.map((m) => (
                      <td key={m} className="text-right py-1.5 tabular-nums text-muted-foreground">
                        {e.months[m] !== 0 ? formatSEK(kronorToOre(e.months[m])) : "—"}
                      </td>
                    ))}
                    <td className="text-right py-1.5 tabular-nums font-medium">{formatSEK(kronorToOre(e.total))}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1.5">Totalt</td>
                  {months.map((m) => (
                    <td key={m} className="text-right py-1.5 tabular-nums">
                      {formatSEK(kronorToOre(costRows.reduce((s, [, e]) => s + e.months[m], 0)))}
                    </td>
                  ))}
                  <td className="text-right py-1.5 tabular-nums">{formatSEK(kronorToOre(costTotal))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Försäljning per kund</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1.5 font-medium">Kund</th>
                  <th className="text-right py-1.5 font-medium">Affärer</th>
                  <th className="text-right py-1.5 font-medium">Exkl. moms</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {custRows.map(([name, c]) => (
                  <tr key={name}>
                    <td className="py-1.5 truncate max-w-44">{name}</td>
                    <td className="text-right py-1.5 tabular-nums">{c.count.size}</td>
                    <td className="text-right py-1.5 tabular-nums">{formatSEK(kronorToOre(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Försäljning per tjänst</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1.5 font-medium">Tjänst</th>
                  <th className="text-right py-1.5 font-medium">Affärer</th>
                  <th className="text-right py-1.5 font-medium">Exkl. moms</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {svcRows.map(([cat, c]) => (
                  <tr key={cat}>
                    <td className="py-1.5">{cat}</td>
                    <td className="text-right py-1.5 tabular-nums">{c.count.size}</td>
                    <td className="text-right py-1.5 tabular-nums">{formatSEK(kronorToOre(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">
              Total omsättning: {formatSEK(kronorToOre(revenueTotal))} · {salesCount} affärer
            </p>
          </CardContent>
        </Card>
      </div>

      {missing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📎 Verifikat som saknar underlag ({missing.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {missing.slice(0, 12).map((v) => (
                <li key={v.id} className="py-1.5 flex justify-between gap-2">
                  <Link href={`/verifikat/${v.id}`} className="hover:underline truncate">
                    <span className="font-mono text-muted-foreground mr-2">
                      {(v.verification_series as unknown as { code: string })?.code}{v.number}
                    </span>
                    {v.description}
                  </Link>
                  <span className="text-muted-foreground shrink-0">{v.verification_date}</span>
                </li>
              ))}
            </ul>
            {missing.length > 12 && (
              <p className="text-xs text-muted-foreground mt-2">…och {missing.length - 12} till.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
