"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { importCustomersCsv, importArticlesCsv } from "@/lib/actions/migration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft } from "lucide-react";

export function MigrationImport() {
  const [pending, startTransition] = useTransition();
  const customersRef = useRef<HTMLInputElement>(null);
  const articlesRef = useRef<HTMLInputElement>(null);

  const upload = (kind: "customers" | "articles", file: File | null) => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = kind === "customers" ? await importCustomersCsv(fd) : await importArticlesCsv(fd);
      if (res.error) { toast.error(res.error); return; }
      toast.success(
        `${res.imported} ${kind === "customers" ? "kunder" : "artiklar"} importerade` +
        (res.skipped ? `, ${res.skipped} hoppade över (fanns redan)` : "")
      );
      if (customersRef.current) customersRef.current.value = "";
      if (articlesRef.current) articlesRef.current.value = "";
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          Flytta in från Fortnox, Visma eller Bokio
        </CardTitle>
        <CardDescription>
          Bokföringen (konton, balanser, verifikat) flyttas med SIE-importen ovan.
          Här importerar du registren som CSV. I Fortnox: Register → Kunder/Artiklar →
          Exportera. Kolumnerna hittas automatiskt oavsett ordning.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Kundregister (CSV)</p>
          <input ref={customersRef} type="file" accept=".csv,text/csv" disabled={pending}
            className="text-sm w-full"
            onChange={(e) => upload("customers", e.target.files?.[0] ?? null)} />
          <p className="text-xs text-muted-foreground">
            Namn krävs; orgnr, adress, e-post och telefon följer med om de finns.
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Artikelregister (CSV)</p>
          <input ref={articlesRef} type="file" accept=".csv,text/csv" disabled={pending}
            className="text-sm w-full"
            onChange={(e) => upload("articles", e.target.files?.[0] ?? null)} />
          <p className="text-xs text-muted-foreground">
            Benämning krävs; pris, enhet och momssats följer med. Försäljningskonto
            sätts till 3011 (ändra per artikel efteråt vid behov).
          </p>
        </div>
        {pending && <p className="text-sm text-muted-foreground sm:col-span-2">Importerar…</p>}
      </CardContent>
    </Card>
  );
}
