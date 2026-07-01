"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
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
  default_payment_terms: number;
  reminder_fee: number;
  late_interest_rate: number | null;
  municipal_tax_rate: number;
};

export function SettingsForm({ settings }: { settings: Settings }) {
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
              ⚠ Personnummer, adress och betalsätt krävs innan fakturor uppfyller fakturakraven.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
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
        <div className="grid grid-cols-2 gap-2">
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
        <div className="space-y-1">
          <Label>Bankgiro</Label>
          <Input value={f.bankgiro} onChange={(e) => set("bankgiro", e.target.value)}
            placeholder="123-4567" />
        </div>
        <div className="space-y-1">
          <Label>IBAN (utlandsfakturor)</Label>
          <Input value={f.iban} onChange={(e) => set("iban", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>BIC</Label>
          <Input value={f.bic} onChange={(e) => set("bic", e.target.value)} />
        </div>

        <div className="col-span-2 border-t pt-3 grid grid-cols-3 gap-3">
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
          </div>
          <div className="space-y-1">
            <Label>Betalningsvillkor (dagar)</Label>
            <Input type="number" value={f.default_payment_terms}
              onChange={(e) => set("default_payment_terms", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Påminnelseavgift (kr)</Label>
            <Input type="number" value={f.reminder_fee}
              onChange={(e) => set("reminder_fee", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Dröjsmålsränta % (tom = referensränta + 8)</Label>
            <Input type="number" step="0.1" value={f.late_interest_rate}
              onChange={(e) => set("late_interest_rate", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Kommunalskatt % (uttagssimulatorn)</Label>
            <Input type="number" step="0.01" value={f.municipal_tax_rate}
              onChange={(e) => set("municipal_tax_rate", e.target.value)} />
          </div>
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
          {busy ? "Sparar…" : "Spara inställningar"}
        </Button>
      </CardContent>
    </Card>
  );
}
