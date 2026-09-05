"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { importSieFile } from "@/lib/actions/sie-import";
import { Button } from "@/components/ui/button";
import { Working } from "@/components/ui/working";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SieImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"ib" | "allt">("allt");
  const [result, setResult] = useState<string[] | null>(null);

  async function run() {
    const file = inputRef.current?.files?.[0];
    if (!file) return toast.error("Välj en SIE-fil (.se/.si/.sie).");
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    // Utan try/catch fastnade knappen i "Importerar…" för alltid om anropet
    // kastade — en stor fil eller en bruten anslutning låste kortet tills
    // sidan laddades om.
    let res: Awaited<ReturnType<typeof importSieFile>>;
    try {
      res = await importSieFile(fd);
    } catch {
      return toast.error("Importen avbröts — filen är för stor för en omgång eller anslutningen bröts. Dela upp filen per år och försök igen.");
    } finally {
      setBusy(false);
    }
    if (res.error) return toast.error(res.error);
    const s = res.summary!;
    const lines = [
      `Importerad: ${res.company ?? file.name}`,
      `${s.accountsCreated} nya konton skapade`,
      s.ibBooked ? "Ingående balanser bokförda" : "Inga nya ingående balanser",
      `${s.versImported} verifikat importerade${s.skipped ? `, ${s.skipped} överhoppade` : ""}`,
      ...(res.warnings ?? []),
    ];
    setResult(lines);
    toast.success("SIE-import klar");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SIE-import (byte från annat program)</CardTitle>
        <CardDescription>
          Läser SIE 4-filer från Fortnox, Visma, Bokio m.fl. Okända konton skapas,
          ingående balanser bokförs och verifikat importeras i egna serier (IA, IB…)
          med full spårbarhet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <Input ref={inputRef} type="file" accept=".se,.si,.sie,.txt" className="max-w-xs" />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={mode === "allt"} onChange={() => setMode("allt")} />
            Allt (IB + verifikat)
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="radio" checked={mode === "ib"} onChange={() => setMode("ib")} />
            Endast ingående balanser
          </label>
          <Button onClick={run} disabled={busy}>
            {busy ? <Working inline label="Importerar…" /> : "Importera"}
          </Button>
        </div>
        {/* En SIE-fil för ett helt år kan ta minuter. Utan väntläge ser sidan
            hängd ut och användaren laddar om mitt i importen. */}
        {busy && (
          <Working
            label="Läser SIE-filen…"
            steps={["Läser filen", "Skapar konton som saknas", "Bokför ingående balanser och verifikat"]}
            activeStep={1}
            hint="Ett helt räkenskapsår kan ta flera minuter. Lämna fliken öppen — importen fortsätter på servern."
          />
        )}
        {result && (
          <ul className="text-sm rounded border bg-muted/40 p-3 space-y-0.5">
            {result.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
