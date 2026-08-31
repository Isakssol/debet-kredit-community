import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getYearEndChecklist } from "@/lib/actions/yearend";
import { getAccountLines } from "@/lib/reports/data";
import { computeNeFields } from "@/lib/tax/calc";
import { CompleteYearEnd } from "@/components/complete-year-end";
import { K2AnnualReport } from "@/components/k2-annual-report";
import { buildK2Report } from "@/lib/k2/report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const fmt = (n: number) => Math.round(n).toLocaleString("sv-SE");

const NE_B_LABELS: Record<string, string> = {
  B4: "Maskiner och inventarier",
  B7: "Kundfordringar",
  B8: "Övriga fordringar",
  B9: "Kassa och bank",
  B10: "Eget kapital",
  B14: "Skatteskulder",
  B15: "Leverantörsskulder",
  B16: "Övriga skulder",
};
const NE_R_LABELS: Record<string, string> = {
  R1: "Försäljning och utfört arbete m.m. (momspliktig)",
  R2: "Momsfria intäkter",
  R4: "Ränteintäkter m.m.",
  R5: "Varor, material och tjänster",
  R6: "Övriga externa kostnader",
  R8: "Räntekostnader m.m.",
  R9: "Avskrivningar maskiner och inventarier",
};

export default async function YearEndPage() {
  const supabase = await createClient();
  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .eq("status", "open").order("year").limit(1).single();

  if (!fy) {
    return <p className="text-muted-foreground">Inget öppet räkenskapsår.</p>;
  }

  const { data: companySettings } = await supabase.from("settings")
    .select("company_type, company_name, org_number, city").eq("id", 1).single();
  if (companySettings && companySettings.company_type === "aktiebolag") {
    const [k2Lines, { data: payroll }] = await Promise.all([
      getAccountLines(fy.id),
      supabase.from("payroll_runs").select("employee_personal_number"),
    ]);
    const k2 = buildK2Report(k2Lines.map((l) => ({ account: l.account, closing: l.closing })));
    const employees = new Set((payroll ?? []).map((p) => p.employee_personal_number)).size;
    return (
      <K2AnnualReport
        year={fy.year}
        companyName={companySettings.company_name ?? "Bolaget"}
        orgNumber={companySettings.org_number ?? ""}
        city={companySettings.city ?? ""}
        report={k2}
        employees={employees}
      />
    );
  }
  if (companySettings && companySettings.company_type === "handelsbolag") {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Årsavslut {fy.year}</h1>
        <Card>
          <CardContent className="py-6 text-sm space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">
              Årsavslut för handelsbolag (N3A-bilagor) stöds inte ännu.
            </p>
            <p>
              Den löpande bokföringen, momsen och rapporterna fungerar fullt ut —
              exportera SIE 4 under Rapporter &amp; export till din redovisningskonsult.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [checklist, lines, { data: neAccounts }, { data: reserves }] = await Promise.all([
    getYearEndChecklist(fy.id, fy.year),
    getAccountLines(fy.id),
    supabase.from("accounts").select("number, name, ne_field"),
    supabase.from("tax_allocation_reserves").select("*").order("tax_year"),
  ]);

  const neFieldByAccount = new Map((neAccounts ?? []).map((a) => [a.number, a.ne_field]));
  const neLines = lines.map((l) => ({
    account: l.account, name: l.name,
    ne_field: neFieldByAccount.get(l.account) ?? null,
    closing: l.closing,
  }));
  const ne = computeNeFields(neLines);
  const bookedResult = lines.filter((l) => l.class >= 3 && l.account !== 8999)
    .reduce((s, l) => s - l.closing, 0);

  const checks: { label: string; ok: boolean; href: string; detail?: string }[] = [
    { label: "Alla 12 månader låsta", ok: checklist.allMonthsLocked, href: "/installningar" },
    { label: "Alla momsperioder redovisade", ok: checklist.vatApproved, href: "/moms" },
    { label: "Kundreskontran stämmer mot konto 1510", ok: checklist.arMatches, href: "/fakturor" },
    { label: "Leverantörsreskontran stämmer mot konto 2440", ok: checklist.apMatches, href: "/leverantorer" },
    {
      label: "Underlag på alla verifikat",
      ok: checklist.missingAttachments === 0,
      href: "/verifikat",
      detail: checklist.missingAttachments > 0 ? `${checklist.missingAttachments} verifikat saknar underlag` : undefined,
    },
    { label: "Årets avskrivningar bokförda", ok: checklist.depreciationDone, href: "/anlaggningar" },
  ];
  const allOk = checks.every((c) => c.ok);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Årsavslut {fy.year}</h1>
          <p className="text-sm text-muted-foreground">
            Förenklat årsbokslut (K1) — bokfört resultat: <strong>{fmt(bookedResult)} kr</strong>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/export/sru?year=${fy.year}`} title="INFO.SRU + BLANKETTER.SRU (NE + INK1-utkast) för Skatteverkets filöverföring">
            SRU-filer (NE + INK1)
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklista</CardTitle>
          <CardDescription>Allt ska vara grönt innan året kan avslutas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {checks.map((c) => (
            <Link key={c.label} href={c.href}
              className="flex items-center justify-between text-sm hover:underline">
              <span>{c.ok ? "✅" : "⬜"} {c.label}</span>
              {c.detail && <Badge variant="destructive">{c.detail}</Badge>}
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Förenklat årsbokslut & NE-bilaga (preliminär)</CardTitle>
              <CardDescription>
                Autofylld från bokföringen via kontonas NE-mappning. Skattemässiga justeringar
                (periodiseringsfond, räntefördelning) planerar du under Skatt & eget uttag.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`/rapporter/pdf?typ=ne&year=${fy.year}`} target="_blank">NE-underlag PDF</a>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-medium mb-1">Balansräkning (B)</h3>
            <table className="w-full">
              <tbody className="[&_td]:py-0.5">
                {Object.entries(NE_B_LABELS).map(([field, label]) => (
                  <tr key={field}>
                    <td className="font-mono text-muted-foreground w-10">{field}</td>
                    <td>{label}</td>
                    <td className="text-right tabular-nums">{fmt(ne.get(field) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-medium mb-1">Resultaträkning (R)</h3>
            <table className="w-full">
              <tbody className="[&_td]:py-0.5">
                {Object.entries(NE_R_LABELS).map(([field, label]) => (
                  <tr key={field}>
                    <td className="font-mono text-muted-foreground w-10">{field}</td>
                    <td>{label}</td>
                    <td className="text-right tabular-nums">{fmt(ne.get(field) ?? 0)}</td>
                  </tr>
                ))}
                <tr className="border-t font-medium">
                  <td className="font-mono">R11</td>
                  <td>Bokfört resultat</td>
                  <td className="text-right tabular-nums">{fmt(bookedResult)}</td>
                </tr>
                <tr className="text-muted-foreground">
                  <td className="font-mono">R43</td>
                  <td>Schablonavdrag egenavgifter 25 %</td>
                  <td className="text-right tabular-nums">beräknas i deklarationen</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {(reserves ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Periodiseringsfonder</CardTitle>
            <CardDescription>Återförs senast sjätte året efter avsättningsåret.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="text-sm w-full max-w-md">
              <thead><tr className="text-left text-muted-foreground">
                <th>Avsättningsår</th><th className="text-right">Belopp</th>
                <th className="text-right">Återfört</th><th>Senast återförd</th>
              </tr></thead>
              <tbody>
                {(reserves ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.tax_year}</td>
                    <td className="text-right tabular-nums">{fmt(Number(r.amount))}</td>
                    <td className="text-right tabular-nums">{fmt(Number(r.reversed_amount))}</td>
                    <td>{r.tax_year + 6}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <CompleteYearEnd year={fy.year} ready={allOk} result={Math.round(bookedResult)} />
    </div>
  );
}
