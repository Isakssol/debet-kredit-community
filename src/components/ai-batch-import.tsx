"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { analyzePurchaseCsv, bookAiBatch } from "@/lib/actions/ai";
import type { AiSuggestion } from "@/lib/ai/bookkeeper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AiBatchImport({ configured }: { configured: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[] | null>(null);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [results, setResults] = useState<{ beskrivning: string; label?: string; error?: string }[] | null>(null);

  if (!configured) return null;

  async function analyze() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Välj en CSV-fil med inköp.");
    setAnalyzing(true);
    setSuggestions(null);
    setResults(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await analyzePurchaseCsv(fd);
    setAnalyzing(false);
    if ("error" in res) return toast.error(res.error);
    setSuggestions(res.suggestions);
    setIncluded(res.suggestions.map(() => true));
    setRejected(res.rejected);
    toast.success(`${res.suggestions.length} inköp analyserade av ${res.provider}`);
  }

  async function bookAll() {
    if (!suggestions) return;
    const toBook = suggestions.filter((_, i) => included[i]);
    if (!toBook.length) return toast.error("Inga inköp valda.");
    setBooking(true);
    const res = await bookAiBatch(JSON.stringify(toBook));
    setBooking(false);
    if (res.error) return toast.error(res.error);
    setResults(res.results ?? []);
    setSuggestions(null);
    const okCount = (res.results ?? []).filter((r) => r.label).length;
    toast.success(`${okCount} verifikat bokförda`);
    router.refresh();
  }

  const totalIncluded = suggestions
    ?.filter((_, i) => included[i])
    .reduce((s, x) => s + x.total_inkl_moms, 0) ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Inköpslista (CSV) — bokför flera på en gång
        </CardTitle>
        <CardDescription>
          Ladda upp en lista med inköp (t.ex. export från Excel) — AI:n analyserar varje
          rad, hanterar omvänd moms, inventariegränsen och ej avdragsgill moms, och du
          bokför alla godkända med ett klick.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-center">
          <Input ref={fileRef} type="file" accept=".csv,.txt" className="max-w-xs" />
          <Button variant="outline" onClick={analyze} disabled={analyzing}>
            {analyzing ? "Analyserar listan…" : "Analysera listan"}
          </Button>
        </div>

        {rejected.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-sm space-y-0.5">
            {rejected.map((r, i) => <div key={i}>⚠️ Underkänd: {r}</div>)}
          </div>
        )}

        {suggestions && (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className={`rounded border p-3 text-sm space-y-1.5 ${included[i] ? "" : "opacity-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={included[i]}
                      onChange={(e) => setIncluded((prev) =>
                        prev.map((x, j) => (j === i ? e.target.checked : x)))} />
                    <span>
                      <span className="font-medium">{s.beskrivning}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.motpart} · {s.datum} · {fmt(s.total_inkl_moms)} kr
                        {s.moms_belopp > 0 && ` varav moms ${fmt(s.moms_belopp)}`}
                      </span>
                    </span>
                  </label>
                  <Badge variant={s.confidence === "hog" ? "default" : s.confidence === "medel" ? "secondary" : "destructive"}>
                    {s.confidence === "hog" ? "Hög" : s.confidence === "medel" ? "Medel" : "Låg"}
                  </Badge>
                </div>
                <div className="ml-6 font-mono text-xs text-muted-foreground">
                  {s.rader.map((r, j) => (
                    <div key={j} className="grid grid-cols-[60px_1fr_90px_90px]">
                      <span>{r.account}</span>
                      <span className="font-sans truncate">{r.motivering ?? ""}</span>
                      <span className="text-right">{r.debit > 0 ? fmt(r.debit) : ""}</span>
                      <span className="text-right">{r.credit > 0 ? fmt(r.credit) : ""}</span>
                    </div>
                  ))}
                </div>
                {(s.varningar.length > 0 || s.fraga) && (
                  <div className="ml-6 text-xs space-y-0.5">
                    {s.varningar.map((v, j) => <div key={j}>⚠️ {v}</div>)}
                    {s.fraga && <div>❓ {s.fraga}</div>}
                  </div>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-muted-foreground">
                {included.filter(Boolean).length} av {suggestions.length} valda ·
                totalt {fmt(totalIncluded)} kr
              </span>
              <Button onClick={bookAll} disabled={booking}>
                {booking ? "Bokför…" : `Bokför ${included.filter(Boolean).length} verifikat`}
              </Button>
            </div>
          </div>
        )}

        {results && (
          <div className="rounded border bg-accent/40 p-3 text-sm space-y-1">
            <div className="font-medium">Resultat:</div>
            {results.map((r, i) => (
              <div key={i}>
                {r.label ? `✅ ${r.label} — ${r.beskrivning}` : `❌ ${r.beskrivning}: ${r.error}`}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
