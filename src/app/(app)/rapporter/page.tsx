import { createClient } from "@/lib/supabase/server";
import { vatPeriods } from "@/lib/vat/report";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ReportsPage() {
  const supabase = await createClient();
  const [{ data: fy }, { data: settings }] = await Promise.all([
    supabase.from("fiscal_years").select("*").order("year", { ascending: false }),
    supabase.from("settings").select("vat_period, eu_trade").eq("id", 1).single(),
  ]);
  const currentYear = fy?.find((f) => f.status === "open")?.year ?? 2026;
  const periods = vatPeriods(
    currentYear,
    (settings?.vat_period ?? "kvartal") as "manad" | "kvartal" | "helar",
    settings?.eu_trade ?? false
  );
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = periods.filter((p) => p.start <= today).pop() ?? periods[0];

  const pdfReports = [
    { typ: "resultat", label: "Resultatrapport", desc: "Standarduppställning med period + ackumulerat" },
    { typ: "balans", label: "Balansrapport", desc: "IB / period / UB per konto" },
    { typ: "huvudbok", label: "Huvudbok", desc: "Alla transaktioner per konto med löpande saldo" },
    { typ: "verifikationslista", label: "Verifikationslista", desc: "Alla verifikat i datumordning (grundbok)" },
    { typ: "kundreskontra", label: "Kundreskontra", desc: "Öppna kundfordringar" },
    { typ: "leverantorsreskontra", label: "Leverantörsreskontra", desc: "Öppna leverantörsskulder" },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rapporter & export</h1>
        <p className="text-sm text-muted-foreground">
          Alla utskrifter följer branschstandardens uppställning — redo att lämnas till
          revisor, bank eller Skatteverket.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapporter (PDF) — räkenskapsår {currentYear}</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          {pdfReports.map((r) => (
            <div key={r.typ} className="flex items-center justify-between border rounded p-3">
              <div>
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.desc}</div>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/rapporter/pdf?typ=${r.typ}&year=${currentYear}`} target="_blank">PDF</a>
                </Button>
                {["resultat", "balans", "huvudbok"].includes(r.typ) && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={`/rapporter/csv?typ=${r.typ}&year=${currentYear}`}>CSV</a>
                  </Button>
                )}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="text-sm font-medium">Momsrapport</div>
              <div className="text-xs text-muted-foreground">
                Aktuell period: {currentPeriod.label}
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`/rapporter/pdf?typ=moms&from=${currentPeriod.start}&to=${currentPeriod.end}`}
                target="_blank">PDF</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SIE-export (till revisor / annat program)</CardTitle>
          <CardDescription>
            SIE 4E — branschstandarden som alla svenska bokförings- och skatteprogram läser.
            Innehåller kontoplan, ingående/utgående balanser, resultat och samtliga verifikat.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {fy?.map((f) => (
            <Button key={f.id} variant="outline" asChild>
              <a href={`/export/sie?year=${f.year}`} download>SIE {f.year}</a>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arkivexport (7 års arkiveringsplikt)</CardTitle>
          <CardDescription>
            Komplett zip per räkenskapsår: SIE-fil, verifikationslista, resultat- och balansrapport
            samt alla uppladdade underlag. Spara på egen disk/molnlagring.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {fy?.map((f) => (
            <Button key={f.id} variant="outline" asChild>
              <a href={`/export/arkiv?year=${f.year}`} download>Arkiv {f.year} (zip)</a>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
