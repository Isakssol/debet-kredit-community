"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveCompanyType } from "@/lib/actions/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Working } from "@/components/ui/working";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";

const COMPANY_TYPES = [
  { id: "enskild_firma", label: "Enskild firma" },
  { id: "aktiebolag", label: "Aktiebolag" },
  { id: "handelsbolag", label: "Handelsbolag" },
] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CompanySettings({ companyType }: { companyType: string }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(companyType);

  const save = () =>
    startTransition(async () => {
      const res = await saveCompanyType({ company_type: value });
      if (res.error) toast.error(res.error);
      else toast.success("Bolagstypen sparad");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Bolagstyp
        </CardTitle>
        <CardDescription>
          Bolagstypen styr momsuppgifterna, skatteberäkningen och vilket årsavslut
          programmet erbjuder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-sm">
          <Label htmlFor="company_type">Bolagstyp</Label>
          <select
            id="company_type"
            className={selectClass}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            {COMPANY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          {value !== "enskild_firma" && (
            <p className="text-xs text-muted-foreground">
              Löpande bokföring, moms och rapporter fungerar fullt ut. Årsavslutet
              (K1/NE-bilaga) gäller endast enskild firma än så länge.
            </p>
          )}
        </div>

        <Button onClick={save} disabled={pending}>
          {pending ? <Working inline label="Sparar…" /> : "Spara"}
        </Button>
      </CardContent>
    </Card>
  );
}
