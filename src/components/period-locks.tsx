"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { toggleMonthLock } from "@/lib/actions/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

export function PeriodLocks({
  fiscalYears,
  locks,
}: {
  fiscalYears: { id: string; year: number; status: string }[];
  locks: { fiscalYearId: string; month: number; reason: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(fyId: string, month: number, currentlyLocked: boolean, reason?: string) {
    if (currentlyLocked && reason !== "manual") {
      toast.error("Perioden är låst av momsrapporten och kan inte låsas upp.");
      return;
    }
    setBusy(true);
    const res = await toggleMonthLock(fyId, month, !currentlyLocked);
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(currentlyLocked ? "Period upplåst" : "Period låst");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Periodlåsning</CardTitle>
        <CardDescription>
          Låst period tillåter inga nya eller ändrade verifikat. Momsrapporten låser sin period automatiskt (nedtonad = momslåst, klickbar = manuell).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fiscalYears.filter((fy) => fy.status === "open").map((fy) => (
          <div key={fy.id} className="space-y-1">
            <div className="text-sm font-medium">{fy.year}</div>
            <div className="flex gap-1 flex-wrap">
              {MONTHS.map((name, i) => {
                const month = i + 1;
                const lock = locks.find((l) => l.fiscalYearId === fy.id && l.month === month);
                const vatLocked = lock && lock.reason !== "manual";
                return (
                  <button
                    key={month}
                    disabled={busy}
                    onClick={() => toggle(fy.id, month, !!lock, lock?.reason)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-sm ${
                      vatLocked
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : lock
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                    }`}
                    title={vatLocked ? "Låst av momsrapporten" : lock ? "Klicka för att låsa upp" : "Klicka för att låsa"}
                  >
                    {name}{lock && <Lock className="h-3 w-3" aria-label="Låst" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
