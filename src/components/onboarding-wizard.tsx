"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeOnboarding } from "@/lib/actions/settings";
import { fTaxFromChoice } from "@/components/settings-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type StartMode = "fresh" | "sie" | "ib";

const STEPS = ["Företaget", "Moms & F-skatt", "Startläge"];

export function OnboardingWizard({
  defaults,
}: {
  defaults: {
    company_name: string; org_number: string; address: string;
    postal_code: string; city: string; email: string; phone: string;
    bankgiro: string; vat_period: string;
  };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // pays_f_tax hålls som "okant" tills användaren svarar — tomt svar är ett
  // giltigt svar här, och bättre än att programmet antar F-skatt åt någon.
  const [f, setF] = useState({
    ...defaults, eu_trade: false, company_type: "enskild_firma",
    pays_f_tax: "okant" as "okant" | "ja" | "nej",
  });
  const [startMode, setStartMode] = useState<StartMode>("fresh");
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const isEf = f.company_type === "enskild_firma";
  const step1Valid = f.company_name.trim() && f.org_number.trim()
    && f.address.trim() && f.city.trim();

  async function finish() {
    setBusy(true);
    const res = await completeOnboarding({
      ...f,
      vat_number: "",
      plusgiro: "", iban: "", bic: "",
      vat_period: f.vat_period as "manad" | "kvartal" | "helar",
      pays_f_tax: fTaxFromChoice(f.pays_f_tax),
      default_payment_terms: 30,
      reminder_fee: 60,
      late_interest_rate: null,
      municipal_tax_rate: 32,
    });
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success("Klart — välkommen!");
    // Korten lovar var man hamnar: SIE-importen och rutan för ingående
    // balanser ligger båda långt ned på inställningssidan, så vi länkar till
    // rätt avsnitt i stället för till sidans topp. Den som byter program ska
    // inte behöva leta efter importen.
    router.push(
      startMode === "fresh" ? "/"
        : startMode === "sie" ? "/installningar#sie-import"
        : "/installningar#ingaende-balanser",
    );
    router.refresh();
  }

  return (
    <Card className="w-full max-w-xl shadow-lg">
      <CardContent className="pt-6 space-y-6">
        {/* Stegindikator */}
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
            &amp;
          </span>
          <div className="flex-1">
            <div className="font-semibold">Välkommen till Debet & Kredit</div>
            <div className="text-xs text-muted-foreground">
              Tre snabba steg så är du igång.
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={cn("h-1.5 rounded-full",
                i <= step ? "bg-primary" : "bg-muted")} />
              <div className={cn("mt-1 text-[11px]",
                i === step ? "text-foreground font-medium" : "text-muted-foreground")}>
                {i + 1}. {label}
              </div>
            </div>
          ))}
        </div>

        {/* Steg 1: Företaget */}
        {step === 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label>Bolagstyp *</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "enskild_firma", label: "Enskild firma" },
                  { value: "aktiebolag", label: "Aktiebolag" },
                  { value: "handelsbolag", label: "Handelsbolag" },
                ].map((opt) => (
                  <button key={opt.value} type="button"
                    onClick={() => set("company_type", opt.value)}
                    className={cn("rounded-lg border p-2 text-sm transition-colors",
                      f.company_type === opt.value
                        ? "border-primary bg-accent ring-1 ring-primary font-medium"
                        : "hover:bg-accent/50")}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {!isEf && (
                <p className="text-[11px] text-muted-foreground">
                  Årsavslutet följer formen: K2-årsredovisning och INK2 för aktiebolag,
                  N3A-bilaga per delägare för handelsbolag.
                </p>
              )}
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Företagsnamn *</Label>
              <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{isEf ? "Personnummer *" : "Organisationsnummer *"}</Label>
              <Input value={f.org_number} placeholder={isEf ? "ÅÅÅÅMMDD-XXXX" : "XXXXXX-XXXX"}
                onChange={(e) => set("org_number", e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                VAT-nummer (SE…01) skapas automatiskt.
              </p>
            </div>
            <div className="space-y-1">
              <Label>E-post</Label>
              <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Adress *</Label>
              <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Postnummer</Label>
              <Input value={f.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Ort *</Label>
              <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bankgiro</Label>
              <Input value={f.bankgiro} placeholder="123-4567"
                onChange={(e) => set("bankgiro", e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Visas på fakturorna. Kan fyllas i senare.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Telefon</Label>
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
        )}

        {/* Steg 2: Moms */}
        {step === 1 && (
          <div className="space-y-3">
            <Label>Hur ofta redovisar du moms till Skatteverket?</Label>
            {[
              { value: "kvartal", title: "Kvartal", desc: "Vanligast för småföretag — deklaration den 12:e i andra månaden efter kvartalet. Välj denna om du är osäker." },
              { value: "helar", title: "Helår", desc: "Tillåtet under 1 mkr i omsättning. En deklaration per år (12 maj)." },
              { value: "manad", title: "Månad", desc: "Frivilligt (krav först över 40 mkr). Mest administration." },
            ].map((opt) => (
              <button key={opt.value} type="button"
                onClick={() => set("vat_period", opt.value)}
                className={cn("w-full text-left rounded-lg border p-3 transition-colors",
                  f.vat_period === opt.value
                    ? "border-primary bg-accent ring-1 ring-primary"
                    : "hover:bg-accent/50")}>
                <div className="font-medium text-sm">{opt.title}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm pt-1">
              <input type="checkbox" checked={f.eu_trade}
                onChange={(e) => set("eu_trade", e.target.checked)} />
              Jag säljer till företag i andra EU-länder (styr deadlines + periodisk sammanställning)
            </label>
            <p className="text-xs text-muted-foreground">
              Ditt val ska matcha vad som står i ditt registerutdrag från Skatteverket.
              Går att ändra under Inställningar.
            </p>

            {/* F-skatt frågas här i stället för att antas. Utan svar visar
                skattekalendern inga betalningsdatum — bara en påminnelse om
                att svara. "Vet inte" är ett fullgott val. */}
            <div className="space-y-2 border-t pt-4">
              <Label>Har företaget beslut om debiterad preliminärskatt från Skatteverket?</Label>
              <p className="text-xs text-muted-foreground">
                Kallas F-skatt och betalas varje månad med ett belopp Skatteverket
                beslutat i förväg. Alla har det inte — den som är godkänd för
                F-skatt men saknar debiterad preliminärskatt betalar ingenting
                månadsvis. Står i ditt registerutdrag.
              </p>
              {[
                { value: "ja" as const, title: "Ja", desc: "Skattekalendern lägger in betalningsdatumen (12:e varje månad, 17:e i januari och augusti) i Att göra." },
                { value: "nej" as const, title: "Nej", desc: "Inga F-skattedatum visas. Byt när Skatteverket beslutar om debiterad preliminärskatt." },
                { value: "okant" as const, title: "Vet inte", desc: "Helt okej — inga datum visas, och översikten påminner dig om att svara när du kollat registerutdraget." },
              ].map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => set("pays_f_tax", opt.value)}
                  className={cn("w-full text-left rounded-lg border p-3 transition-colors",
                    f.pays_f_tax === opt.value
                      ? "border-primary bg-accent ring-1 ring-primary"
                      : "hover:bg-accent/50")}>
                  <div className="font-medium text-sm">{opt.title}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Steg 3: Startläge */}
        {step === 2 && (
          <div className="space-y-3">
            <Label>Hur ser din bokföring för 2026 ut hittills?</Label>
            {[
              { value: "fresh" as const, title: "Jag börjar från noll här", desc: "Perfekt — du landar direkt på översikten och kan skapa din första faktura." },
              { value: "sie" as const, title: "Jag byter från ett annat program", desc: "Exportera en SIE-fil från Fortnox/Visma/Bokio — konton, ingående balanser och verifikat följer med. Du hamnar på importsidan." },
              { value: "ib" as const, title: "Jag har bokfört på annat sätt", desc: "Ange ingående balanser manuellt (kontosaldon från t.ex. Excel). Du hamnar på inställningssidan." },
            ].map((opt) => (
              <button key={opt.value} type="button"
                onClick={() => setStartMode(opt.value)}
                className={cn("w-full text-left rounded-lg border p-3 transition-colors",
                  startMode === opt.value
                    ? "border-primary bg-accent ring-1 ring-primary"
                    : "hover:bg-accent/50")}>
                <div className="font-medium text-sm">{opt.title}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </button>
            ))}
          </div>
        )}

        {/* Navigering */}
        <div className="flex justify-between pt-2">
          <Button variant="ghost" disabled={step === 0 || busy}
            onClick={() => setStep((s) => s - 1)}>
            Tillbaka
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !step1Valid}>
              Fortsätt
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy}>
              {busy ? "Sparar…" : "Kom igång"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
