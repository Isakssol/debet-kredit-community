"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  generateBankSuggestions, generateInboxSuggestions,
  approveSuggestion, dismissSuggestion,
} from "@/lib/actions/queue";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Sparkles, Landmark, Inbox } from "lucide-react";

type QueueItem = {
  id: string;
  source: "bank_tx" | "inbox_attachment";
  sourceLabel: string;
  suggestion: {
    datum: string; motpart: string; beskrivning: string;
    total_inkl_moms: number; confidence: "hog" | "medel" | "lag";
    varningar: string[];
    rader: { account: number; debit: number; credit: number; motivering?: string }[];
  };
};

const fmt = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2 });

export function ApprovalQueue({
  items, aiReady, unmatchedTx, inboxFiles,
}: {
  items: QueueItem[];
  aiReady: boolean;
  unmatchedTx: number;
  inboxFiles: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const generate = (kind: "bank" | "inbox") =>
    startTransition(async () => {
      const res = kind === "bank" ? await generateBankSuggestions() : await generateInboxSuggestions();
      if (res.error) { toast.error(res.error); return; }
      toast.success(`${res.created} förslag skapade${res.skipped ? `, ${res.skipped} hoppade över` : ""}`);
      router.refresh();
    });

  const approve = (id: string) =>
    startTransition(async () => {
      setBusyId(id);
      const res = await approveSuggestion(id);
      setBusyId(null);
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Bokförd som ${res.label}`);
      router.refresh();
    });

  const dismiss = (id: string) =>
    startTransition(async () => {
      setBusyId(id);
      const res = await dismissSuggestion(id);
      setBusyId(null);
      if (res.error) { toast.error(res.error); return; }
      router.refresh();
    });

  const approveAllHigh = () =>
    startTransition(async () => {
      const high = items.filter((i) => i.suggestion.confidence === "hog" && !i.suggestion.varningar.length);
      let ok = 0;
      for (const item of high) {
        const res = await approveSuggestion(item.id);
        if (res.ok) ok++;
      }
      toast.success(`${ok} förslag bokförda`);
      router.refresh();
    });

  const highCount = items.filter((i) => i.suggestion.confidence === "hog" && !i.suggestion.varningar.length).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending || !aiReady || unmatchedTx === 0}
          onClick={() => generate("bank")}>
          <Landmark className="h-3.5 w-3.5 mr-1.5" />
          Föreslå för bankhändelser ({unmatchedTx})
        </Button>
        <Button size="sm" variant="outline" disabled={pending || !aiReady || inboxFiles === 0}
          onClick={() => generate("inbox")}>
          <Inbox className="h-3.5 w-3.5 mr-1.5" />
          Föreslå för underlagsinkorgen ({inboxFiles})
        </Button>
        {highCount > 1 && (
          <Button size="sm" disabled={pending} onClick={approveAllHigh}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Godkänn alla säkra ({highCount})
          </Button>
        )}
      </div>

      {!aiReady && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">
          Lägg in en AI-nyckel under Inställningar → AI-bokföraren för att aktivera förslagskön.
        </CardContent></Card>
      )}

      {items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Kön är tom. 🎉 {unmatchedTx + inboxFiles > 0
            ? "Klicka på en föreslå-knapp ovan för att låta AI:n arbeta."
            : "Allt är hanterat."}
        </CardContent></Card>
      ) : (
        items.map((item) => {
          const s = item.suggestion;
          return (
            <Card key={item.id} className={busyId === item.id ? "opacity-60" : ""}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{s.beskrivning}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.datum} · {s.motpart || "okänd motpart"} · {fmt(s.total_inkl_moms)} kr · {item.sourceLabel}
                    </div>
                  </div>
                  <Badge variant={s.confidence === "hog" ? "outline" : "secondary"}
                    className={s.confidence === "hog" ? "text-emerald-600 shrink-0" : "shrink-0"}>
                    {s.confidence === "hog" ? "Säker" : s.confidence === "medel" ? "Osäker" : "Mycket osäker"}
                  </Badge>
                </div>

                <table className="text-xs w-full">
                  <tbody>
                    {s.rader.map((r, i) => (
                      <tr key={i} className="text-muted-foreground">
                        <td className="py-0.5 font-mono">{r.account}</td>
                        <td className="py-0.5">{r.motivering ?? ""}</td>
                        <td className="py-0.5 text-right tabular-nums">{r.debit > 0 ? fmt(r.debit) : ""}</td>
                        <td className="py-0.5 text-right tabular-nums w-20">{r.credit > 0 ? fmt(r.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {s.varningar.length > 0 && (
                  <div className="text-xs text-amber-600">⚠️ {s.varningar.join(" · ")}</div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={pending} onClick={() => approve(item.id)}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Godkänn & bokför
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => dismiss(item.id)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Avvisa
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
