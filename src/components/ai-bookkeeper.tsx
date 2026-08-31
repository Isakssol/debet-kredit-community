"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { analyzePurchase, bookAiSuggestion } from "@/lib/actions/ai";
import type { AiSuggestion } from "@/lib/ai/bookkeeper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CONFIDENCE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  hog: { label: "Hög säkerhet", variant: "default" },
  medel: { label: "Medel säkerhet — granska", variant: "secondary" },
  lag: { label: "Låg säkerhet — kontrollera noga", variant: "destructive" },
};

/** Skala ner stora kvittofoton innan uppladdning: mobilfoton på 5–15 MB blir
 *  en JPEG under ~1 MB. Håller oss under server actions body-gräns och
 *  AI-leverantörens bildgräns. PDF:er och små bilder skickas orörda. */
async function prepareFile(file: File): Promise<File> {
  const MAX_EDGE = 2000;
  const COMPRESS_OVER_BYTES = 1.5 * 1024 * 1024;
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= COMPRESS_OVER_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // kan inte avkodas (t.ex. HEIC i vissa webbläsare) — låt servern validera
  }
}

export function AiBookkeeper({
  configured,
  providerName,
  accounts,
  inboxAttachmentId,
  inboxFileName,
}: {
  configured: boolean;
  providerName: string | null;
  accounts: { number: number; name: string }[];
  inboxAttachmentId: string | null;
  inboxFileName: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [fileName, setFileName] = useState<string | null>(inboxFileName);

  async function analyze() {
    const file = fileRef.current?.files?.[0];
    if (!file && !text.trim() && !inboxAttachmentId) {
      return toast.error("Ladda upp ett kvitto eller beskriv inköpet.");
    }
    setAnalyzing(true);
    setSuggestion(null);
    try {
      const fd = new FormData();
      if (file) fd.set("file", await prepareFile(file));
      if (text.trim()) fd.set("text", text.trim());
      if (inboxAttachmentId) fd.set("inboxAttachmentId", inboxAttachmentId);
      const res = await analyzePurchase(fd);
      if ("error" in res) return toast.error(res.error);
      setSuggestion(res.suggestion);
      if (file) setFileName(file.name);
    } catch (e) {
      toast.error(
        `Analysen misslyckades: ${(e as Error).message || "okänt fel"}. ` +
        "Prova igen — eller med en mindre bild."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function book() {
    if (!suggestion) return;
    setBooking(true);
    try {
      const fd = new FormData();
      fd.set("suggestion", JSON.stringify(suggestion));
      const file = fileRef.current?.files?.[0];
      if (file) fd.set("file", await prepareFile(file));
      if (inboxAttachmentId) fd.set("inboxAttachmentId", inboxAttachmentId);
      const res = await bookAiSuggestion(fd);
      if (res.error) return toast.error(res.error);
      toast.success(`Verifikat ${res.label} bokfört med underlag`);
      router.push(`/verifikat/${res.verificationId}`);
    } catch (e) {
      toast.error(`Bokföringen misslyckades: ${(e as Error).message || "okänt fel"}.`);
    } finally {
      setBooking(false);
    }
  }

  const updateRow = (i: number, field: "account" | "debit" | "credit", value: string) => {
    setSuggestion((prev) => {
      if (!prev) return prev;
      const rader = prev.rader.map((r, j) => j === i
        ? { ...r, [field]: field === "account" ? parseInt(value) : parseFloat(value) || 0 }
        : r);
      return { ...prev, rader };
    });
  };

  const totalDebit = suggestion?.rader.reduce((s, r) => s + r.debit, 0) ?? 0;
  const totalCredit = suggestion?.rader.reduce((s, r) => s + r.credit, 0) ?? 0;
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  if (!configured) {
    return (
      <Card>
        <CardContent className="py-6 text-sm space-y-2">
          <p className="font-medium">AI-nyckel saknas — så aktiverar du (2 min):</p>
          <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
            <li>Hämta en API-nyckel: <strong>console.anthropic.com</strong> (Claude,
              rekommenderas — läser även PDF) eller <strong>platform.openai.com</strong></li>
            <li>Klistra in den under <strong>Inställningar → AI-bokföraren</strong> —
              där väljer du också modell och kan lägga in egna konteringsregler</li>
          </ol>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Skicka in ett inköp
          </CardTitle>
          <CardDescription>
            Kvitto/faktura som foto eller PDF, en textbeskrivning — eller båda.
            Drivs av {providerName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {inboxAttachmentId ? (
            <div className="rounded border bg-accent/50 p-2.5 text-sm">
              📎 Från underlagsinkorgen: <strong>{inboxFileName}</strong>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Kvitto eller faktura</Label>
              <Input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" />
            </div>
          )}
          <div className="space-y-1">
            <Label>Beskrivning (hjälper AI:n — t.ex. syfte, deltagare, betalsätt)</Label>
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder='T.ex. "Lunch med kund från Haus Media, 2 personer, betalt med privat kort" eller "Skärm till kontoret från Dustin, 4 990 kr inkl moms"' />
          </div>
          <Button onClick={analyze} disabled={analyzing}>
            {analyzing ? (
              <>Analyserar<span className="animate-pulse">…</span></>
            ) : (
              <><Upload className="h-4 w-4 mr-1" /> Analysera med AI</>
            )}
          </Button>
        </CardContent>
      </Card>

      {suggestion && (
        <Card className="border-primary/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Förslag: {suggestion.beskrivning}</CardTitle>
              <Badge variant={CONFIDENCE[suggestion.confidence].variant}>
                {CONFIDENCE[suggestion.confidence].label}
              </Badge>
            </div>
            <CardDescription>
              {suggestion.motpart && <>{suggestion.motpart} · </>}
              {suggestion.datum} · {fmt(suggestion.total_inkl_moms)} kr
              {suggestion.moms_belopp > 0 && <> varav moms {fmt(suggestion.moms_belopp)} kr ({suggestion.moms_sats} %)</>}
              {suggestion.betalsatt === "privat" && <> · betalt privat</>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestion.fraga && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-sm">
                ❓ AI:n undrar: {suggestion.fraga} — komplettera beskrivningen och analysera igen,
                eller justera raderna själv nedan.
              </div>
            )}
            {suggestion.varningar.map((v, i) => (
              <div key={i} className="rounded border bg-muted/40 p-2.5 text-sm">⚠️ {v}</div>
            ))}

            <div className="space-y-1.5">
              <div className="grid grid-cols-[1fr_110px_110px] gap-2 text-xs font-medium text-muted-foreground">
                <span>Konto</span><span className="text-right">Debet</span>
                <span className="text-right">Kredit</span>
              </div>
              {suggestion.rader.map((r, i) => (
                <div key={i}>
                  <div className="grid grid-cols-[1fr_110px_110px] gap-2">
                    <Select value={String(r.account)}
                      onValueChange={(v) => updateRow(i, "account", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.number} value={String(a.number)}>
                            {a.number} {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" step="0.01" className="text-right"
                      value={r.debit || ""} onChange={(e) => updateRow(i, "debit", e.target.value)} />
                    <Input type="number" step="0.01" className="text-right"
                      value={r.credit || ""} onChange={(e) => updateRow(i, "credit", e.target.value)} />
                  </div>
                  {r.motivering && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 ml-1">{r.motivering}</p>
                  )}
                </div>
              ))}
              <div className={`text-sm text-right tabular-nums ${balanced ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                Debet {fmt(totalDebit)} / Kredit {fmt(totalCredit)} {balanced ? "✓" : "— balanserar inte!"}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={book} disabled={booking || !balanced}>
                {booking ? "Bokför…" : `Bokför${fileName || inboxAttachmentId ? " & arkivera underlag" : ""}`}
              </Button>
              <Button variant="ghost" onClick={() => setSuggestion(null)}>Börja om</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
