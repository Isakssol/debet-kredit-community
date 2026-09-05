"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSettings } from "@/lib/actions/settings";
import { LogoSettings } from "@/components/logo-settings";
import { Button } from "@/components/ui/button";
import { Working } from "@/components/ui/working";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Settings = {
  company_name: string;
  org_number: string | null;
  vat_number: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  bankgiro: string | null;
  plusgiro: string | null;
  iban: string | null;
  bic: string | null;
  vat_period: string;
  eu_trade: boolean;
  /** Beslut om debiterad preliminärskatt: true = ja, false = nej, null = obesvarad */
  pays_f_tax: boolean | null;
  default_payment_terms: number;
  reminder_fee: number;
  late_interest_rate: number | null;
  municipal_tax_rate: number;
};

/**
 * F-skattesvaret är tre lägen men formulärstate bär strängar. "okant" = frågan
 * obesvarad; Radix Select tar inte tomma värden, så läget behöver ett eget ord.
 */
export const F_TAX_CHOICES = ["okant", "ja", "nej"] as const;
export function fTaxToChoice(value: boolean | null | undefined): "okant" | "ja" | "nej" {
  return value === true ? "ja" : value === false ? "nej" : "okant";
}
export function fTaxFromChoice(choice: string): boolean | null {
  return choice === "ja" ? true : choice === "nej" ? false : null;
}

export function SettingsForm({ settings, companyType = "enskild_firma", logoUrl = null, demo = false }: {
  settings: Settings;
  /** Styr vilka fält som visas — kommunalskatten läses bara för enskild firma */
  companyType?: string;
  /** Signerad länk till företagets logotyp, null när ingen är uppladdad */
  logoUrl?: string | null;
  /** Delad demoinstans: logotypen är låst (spärren sitter i server-actionen) */
  demo?: boolean;
}) {
  const isEf = companyType === "enskild_firma";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    company_name: settings.company_name ?? "",
    org_number: settings.org_number ?? "",
    vat_number: settings.vat_number ?? "",
    address: settings.address ?? "",
    postal_code: settings.postal_code ?? "",
    city: settings.city ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    bankgiro: settings.bankgiro ?? "",
    plusgiro: settings.plusgiro ?? "",
    iban: settings.iban ?? "",
    bic: settings.bic ?? "",
    vat_period: settings.vat_period,
    eu_trade: settings.eu_trade,
    pays_f_tax: fTaxToChoice(settings.pays_f_tax),
    default_payment_terms: String(settings.default_payment_terms),
    reminder_fee: String(settings.reminder_fee),
    late_interest_rate: settings.late_interest_rate != null ? String(settings.late_interest_rate) : "",
    municipal_tax_rate: String(settings.municipal_tax_rate),
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const invoiceReady = f.org_number && f.address && f.city && (f.bankgiro || f.plusgiro || f.iban);

  async function submit() {
    setBusy(true);
    const res = await saveSettings({
      ...f,
      default_payment_terms: parseInt(f.default_payment_terms) || 30,
      reminder_fee: parseFloat(f.reminder_fee) || 0,
      late_interest_rate: f.late_interest_rate ? parseFloat(f.late_interest_rate) : null,
      municipal_tax_rate: parseFloat(f.municipal_tax_rate) || 32,
      vat_period: f.vat_period as "manad" | "kvartal" | "helar",
      pays_f_tax: fTaxFromChoice(f.pays_f_tax),
    });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Inställningar sparade");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Företagsuppgifter</CardTitle>
        <CardDescription>
          Uppgifterna hamnar på fakturor och rapporter (momslagens fakturakrav).
          {!invoiceReady && (
            <span className="block text-destructive mt-1">
              Obs: Personnummer, adress och betalsätt krävs innan fakturor uppfyller fakturakraven.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <LogoSettings logoUrl={logoUrl} demo={demo} />
        </div>
        <div className="space-y-1">
          <Label>Företagsnamn</Label>
          <Input value={f.company_name} onChange={(e) => set("company_name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Personnummer (ÅÅÅÅMMDD-XXXX)</Label>
          <Input value={f.org_number} onChange={(e) => set("org_number", e.target.value)}
            placeholder="19900101-1234" />
        </div>
        <div className="space-y-1">
          <Label>VAT-nummer (härleds ur personnr om tomt)</Label>
          <Input value={f.vat_number} onChange={(e) => set("vat_number", e.target.value)}
            placeholder="SE19900101123401" />
        </div>
        <div className="space-y-1">
          <Label>E-post</Label>
          <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Adress</Label>
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Postnummer</Label>
            <Input value={f.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Ort</Label>
            <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Telefon</Label>
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Minst ett betalsätt krävs för att fakturan ska duga enligt fakturakraven.
            Bankgiro och plusgiro skrivs ut på svenska fakturor, IBAN och BIC på
            utlandsfakturor.
          </p>
          <div className="space-y-1">
            <Label>Bankgiro</Label>
            <Input value={f.bankgiro} onChange={(e) => set("bankgiro", e.target.value)}
              placeholder="123-4567" />
          </div>
          <div className="space-y-1">
            <Label>Plusgiro</Label>
            <Input value={f.plusgiro} onChange={(e) => set("plusgiro", e.target.value)}
              placeholder="12 34 56-7" />
          </div>
          <div className="space-y-1">
            <Label>IBAN (utlandsfakturor)</Label>
            <Input value={f.iban} onChange={(e) => set("iban", e.target.value)}
              placeholder="SE45 5000 0000 0583 9825 7466" />
          </div>
          <div className="space-y-1">
            <Label>BIC (bankens SWIFT-kod)</Label>
            <Input value={f.bic} onChange={(e) => set("bic", e.target.value)}
              placeholder="ESSESESS" />
          </div>
        </div>

        <div className="sm:col-span-2 border-t pt-3 grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Momsredovisningsperiod</Label>
            <Select value={f.vat_period} onValueChange={(v) => set("vat_period", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manad">Månad</SelectItem>
                <SelectItem value="kvartal">Kvartal</SelectItem>
                <SelectItem value="helar">Helår</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Måste stämma med Skatteverkets beslut för ditt företag — den väljs
              inte fritt här. Styr deadlines i Att göra och periodindelningen i
              momsrapporten.
            </p>
          </div>
          <div id="f-skatt" className="space-y-1 scroll-mt-20">
            <Label>Debiterad preliminärskatt (F-skatt)</Label>
            <Select value={f.pays_f_tax} onValueChange={(v) => set("pays_f_tax", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="okant">Vet inte ännu</SelectItem>
                <SelectItem value="ja">Ja — vi har beslut från Skatteverket</SelectItem>
                <SelectItem value="nej">Nej</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Står i ditt registerutdrag från Skatteverket. Vid ja lägger
              skattekalendern in betalningsdatumen (12:e varje månad, 17:e i
              januari och augusti) i Att göra.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Betalningsvillkor (dagar)</Label>
            <Input type="number" value={f.default_payment_terms}
              onChange={(e) => set("default_payment_terms", e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Förval på nya fakturor. Går att ändra per kund och per faktura.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Påminnelseavgift (kr)</Label>
            <Input type="number" value={f.reminder_fee}
              onChange={(e) => set("reminder_fee", e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Beloppet som föreslås när du skapar en påminnelse på en faktura.
              Högst 60 kr enligt lag (1981:739), och bara om avgiften avtalats
              senast när skulden uppkom.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Dröjsmålsränta % (tom = referensränta + 8)</Label>
            <Input type="number" step="0.1" value={f.late_interest_rate}
              onChange={(e) => set("late_interest_rate", e.target.value)} />
          </div>
          {/* Läses bara av /skatt för enskild firma — för AB och HB fanns
              fältet men styrde ingenting, vilket såg ut som en glömd inställning. */}
          {isEf && (
            <div className="space-y-1">
              <Label>Kommunalskatt %</Label>
              <Input type="number" step="0.01" value={f.municipal_tax_rate}
                onChange={(e) => set("municipal_tax_rate", e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Din hemkommuns skattesats. Används av uttagssimulatorn på Skatt
                för att räkna fram vad ett eget uttag kostar.
              </p>
            </div>
          )}
          <div className="space-y-1">
            <Label>EU-handel</Label>
            <Select value={f.eu_trade ? "ja" : "nej"} onValueChange={(v) => set("eu_trade", v === "ja")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nej">Nej</SelectItem>
                <SelectItem value="ja">Ja (styr deadlines + periodisk sammanställning)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
      <CardContent className="pt-0">
        <Button onClick={submit} disabled={busy}>
          {busy ? <Working inline label="Sparar…" /> : "Spara inställningar"}
        </Button>
      </CardContent>
    </Card>
  );
}
