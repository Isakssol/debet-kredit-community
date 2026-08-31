"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { runPayroll } from "@/lib/actions/payroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote } from "lucide-react";

const thisPeriod = () => new Date().toISOString().slice(0, 7).replace("-", "");

export function PayrollForm({ hasOrgNumber }: { hasOrgNumber: boolean }) {
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({
    period: thisPeriod(), employee_name: "", employee_personal_number: "",
    gross_salary: "", tax_deduction: "", workplace_address: "", workplace_city: "",
  });

  const gross = parseFloat(f.gross_salary) || 0;
  const tax = parseFloat(f.tax_deduction) || 0;
  const fee = Math.round(gross * 0.3142 * 100) / 100;

  const submit = () =>
    startTransition(async () => {
      const res = await runPayroll({
        ...f,
        gross_salary: gross,
        tax_deduction: tax,
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Lön bokförd som ${res.label} — netto ${res.net?.toLocaleString("sv-SE")} kr. Ladda ner AGI-filen nedan.`);
      setF((p) => ({ ...p, gross_salary: "", tax_deduction: "" }));
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" />
          Kör lön
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasOrgNumber && (
          <p className="text-sm text-amber-600">
            Ange organisationsnummer under Inställningar innan du kör lön — det krävs i AGI-filen.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Period (ÅÅÅÅMM)</Label>
            <Input value={f.period} onChange={(e) => setF((p) => ({ ...p, period: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Anställd (namn)</Label>
            <Input value={f.employee_name}
              onChange={(e) => setF((p) => ({ ...p, employee_name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Personnummer</Label>
            <Input value={f.employee_personal_number} placeholder="ÅÅÅÅMMDD-XXXX"
              onChange={(e) => setF((p) => ({ ...p, employee_personal_number: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bruttolön (kr)</Label>
            <Input type="number" value={f.gross_salary}
              onChange={(e) => setF((p) => ({ ...p, gross_salary: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Skatteavdrag enligt tabell (kr)</Label>
            <Input type="number" value={f.tax_deduction}
              onChange={(e) => setF((p) => ({ ...p, tax_deduction: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground">
              Slå upp i din skattetabell: skatteverket.se → "Räkna ut din skatt"
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Arbetsplatsens adress (AGI)</Label>
            <Input value={f.workplace_address}
              onChange={(e) => setF((p) => ({ ...p, workplace_address: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Arbetsplatsens ort (AGI)</Label>
            <Input value={f.workplace_city}
              onChange={(e) => setF((p) => ({ ...p, workplace_city: e.target.value }))} />
          </div>
        </div>

        {gross > 0 && (
          <div className="rounded-lg bg-muted p-3 text-sm space-y-0.5">
            <div>Nettolön att betala ut: <b>{(gross - tax).toLocaleString("sv-SE")} kr</b></div>
            <div>Arbetsgivaravgift (31,42 %): <b>{fee.toLocaleString("sv-SE")} kr</b></div>
            <div className="text-muted-foreground text-xs">
              Till Skatteverket den 12:e nästa månad: skatt {tax.toLocaleString("sv-SE")} kr +
              avgifter {fee.toLocaleString("sv-SE")} kr = {(tax + fee).toLocaleString("sv-SE")} kr
            </div>
          </div>
        )}

        <Button onClick={submit}
          disabled={pending || !f.employee_name || !f.employee_personal_number || gross <= 0}>
          {pending ? "Bokför…" : "Bokför lön + skapa AGI"}
        </Button>
      </CardContent>
    </Card>
  );
}
