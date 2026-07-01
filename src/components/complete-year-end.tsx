"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { completeYearEnd } from "@/lib/actions/yearend";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function CompleteYearEnd({
  year,
  ready,
  result,
}: {
  year: number;
  ready: boolean;
  result: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg" disabled={!ready}>
          {ready ? `Avsluta räkenskapsåret ${year}` : "Checklista måste vara grön först"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avsluta räkenskapsåret {year}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p>Detta gör följande — och kan inte ångras:</p>
              <ol className="list-decimal ml-5 space-y-1">
                <li>Årets resultat ({result.toLocaleString("sv-SE")} kr) bokförs 8999 → 2019</li>
                <li>Räkenskapsår {year + 1} skapas med verifikationsserier</li>
                <li>Ingående balanser bokförs i {year + 1} — eget kapital-underkontona
                    (2011–2019) nollställs mot 2010</li>
                <li>Året {year} låses permanent</li>
              </ol>
              <p>Se till att du exporterat SIE + arkiv först (Rapporter & export).</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            const res = await completeYearEnd(year);
            setBusy(false);
            if (res.error) toast.error(res.error);
            else {
              toast.success(`Räkenskapsåret ${year} avslutat — ${res.nextYear} är öppnat`);
              router.refresh();
            }
          }}>
            {busy ? "Avslutar…" : "Avsluta året"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
