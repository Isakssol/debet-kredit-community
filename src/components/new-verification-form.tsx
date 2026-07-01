"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bookVerification } from "@/lib/actions/verifications";
import {
  egetUttag, egenInsattning, fSkatt, kopMotKvitto, milersattning, representation,
  traktamente, type QuickEventResult,
} from "@/lib/posting/quick-events";
import { linkAttachment } from "@/lib/actions/inbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Account = { number: number; name: string; vatRate: number | null; blocked: boolean };
type FormRow = { account: string; debit: string; credit: string };

const emptyRow = (): FormRow => ({ account: "", debit: "", credit: "" });

export function NewVerificationForm({
  accounts,
  seriesCodes,
  rules,
  inboxAttachmentId = null,
}: {
  accounts: Account[];
  seriesCodes: string[];
  rules: Record<string, number>;
  inboxAttachmentId?: string | null;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [busy, setBusy] = useState(false);

  // --- Manuell registrering ---
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [rows, setRows] = useState<FormRow[]>([emptyRow(), emptyRow()]);

  const selectable = accounts.filter((a) => !a.blocked);
  const totalDebit = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const balanced =
    Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  async function submit(desc: string, postingRows: { account: number; debit: number; credit: number; note?: string }[], eventDate: string, cp?: string) {
    setBusy(true);
    const res = await bookVerification({
      seriesCode: seriesCodes[0] ?? "A",
      date: eventDate,
      description: desc,
      counterparty: cp || undefined,
      source: "manual",
      rows: postingRows,
    });
    setBusy(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    const verId = "verificationId" in res ? res.verificationId : "";
    if (inboxAttachmentId && verId) {
      await linkAttachment(inboxAttachmentId, verId);
    }
    toast.success(`Verifikat ${"label" in res ? res.label : ""} bokfört`);
    router.push(`/verifikat/${verId}`);
  }

  function submitManual() {
    const parsed = rows
      .filter((r) => r.account && (parseFloat(r.debit) > 0 || parseFloat(r.credit) > 0))
      .map((r) => ({
        account: parseInt(r.account),
        debit: parseFloat(r.debit) || 0,
        credit: parseFloat(r.credit) || 0,
      }));
    if (!description.trim()) return toast.error("Beskrivning krävs (BFL 5:7).");
    if (parsed.length < 2) return toast.error("Minst två rader krävs.");
    if (!balanced) return toast.error("Verifikatet balanserar inte.");
    submit(description, parsed, date, counterparty);
  }

  // --- Snabbhändelser ---
  const [qeType, setQeType] = useState("uttag");
  const [qeDate, setQeDate] = useState(today);
  const [qeAmount, setQeAmount] = useState("");
  const [qeVat, setQeVat] = useState("25");
  const [qeAccount, setQeAccount] = useState("6110");
  const [qeText, setQeText] = useState("");
  const [qeMil, setQeMil] = useState("");
  const [qePersons, setQePersons] = useState("2");
  const [qePrivate, setQePrivate] = useState(false);
  const [qeDays, setQeDays] = useState("1");
  const [qeHalfDays, setQeHalfDays] = useState("0");
  const [qeNights, setQeNights] = useState("0");

  function buildQuickEvent(): QuickEventResult | null {
    const amount = parseFloat(qeAmount) || 0;
    switch (qeType) {
      case "uttag":
        return amount > 0 ? egetUttag(amount) : null;
      case "insattning":
        return amount > 0 ? egenInsattning(amount) : null;
      case "fskatt":
        return amount > 0 ? fSkatt(amount) : null;
      case "kvitto":
        return amount > 0 && qeText.trim()
          ? kopMotKvitto(amount, parseFloat(qeVat), parseInt(qeAccount), qeText, qePrivate)
          : null;
      case "mil": {
        const mil = parseFloat(qeMil) || 0;
        return mil > 0 ? milersattning(mil, rules["milersattning"] ?? 25) : null;
      }
      case "traktamente": {
        const d = parseInt(qeDays) || 0, h = parseInt(qeHalfDays) || 0, n = parseInt(qeNights) || 0;
        return d + h + n > 0
          ? traktamente(d, h, n, {
              helt: rules["traktamente_helt"] ?? 300,
              halvt: rules["traktamente_halvt"] ?? 150,
              natt: rules["traktamente_natt"] ?? 150,
            })
          : null;
      }
      case "representation":
        return amount > 0
          ? representation(
              amount, parseFloat(qeVat), parseInt(qePersons) || 1,
              rules["representation_moms_underlag"] ?? 300,
              rules["representation_enklare"] ?? 60,
              qePrivate
            )
          : null;
      default:
        return null;
    }
  }

  const preview = buildQuickEvent();

  function submitQuickEvent() {
    if (!preview) return toast.error("Fyll i alla fält.");
    submit(preview.description, preview.rows, qeDate);
  }

  const accountName = (n: number) => accounts.find((a) => a.number === n)?.name ?? "";

  return (
    <Tabs defaultValue="snabb">
      <TabsList>
        <TabsTrigger value="snabb">Snabbhändelse</TabsTrigger>
        <TabsTrigger value="manuell">Manuell kontering</TabsTrigger>
      </TabsList>

      {/* ---------- Snabbhändelse ---------- */}
      <TabsContent value="snabb">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snabbhändelse</CardTitle>
            <CardDescription>Vanliga händelser med färdig kontering för enskild firma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Typ av händelse</Label>
                <Select value={qeType} onValueChange={setQeType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uttag">Eget uttag</SelectItem>
                    <SelectItem value="insattning">Egen insättning</SelectItem>
                    <SelectItem value="fskatt">F-skatt (preliminärskatt)</SelectItem>
                    <SelectItem value="kvitto">Köp mot kvitto</SelectItem>
                    <SelectItem value="mil">Milersättning egen bil</SelectItem>
                    <SelectItem value="representation">Representation (måltid)</SelectItem>
                    <SelectItem value="traktamente">Traktamente (tjänsteresa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input type="date" value={qeDate} onChange={(e) => setQeDate(e.target.value)} />
              </div>
            </div>

            {qeType === "traktamente" ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Hela dagar ({rules["traktamente_helt"] ?? 300} kr)</Label>
                  <Input type="number" min="0" value={qeDays} onChange={(e) => setQeDays(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Halva dagar ({rules["traktamente_halvt"] ?? 150} kr)</Label>
                  <Input type="number" min="0" value={qeHalfDays} onChange={(e) => setQeHalfDays(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Nätter ({rules["traktamente_natt"] ?? 150} kr)</Label>
                  <Input type="number" min="0" value={qeNights} onChange={(e) => setQeNights(e.target.value)} />
                </div>
              </div>
            ) : qeType === "mil" ? (
              <div className="space-y-1">
                <Label>Antal mil ({rules["milersattning"] ?? 25} kr/mil skattefritt)</Label>
                <Input type="number" value={qeMil} onChange={(e) => setQeMil(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Belopp {qeType === "kvitto" || qeType === "representation" ? "(inkl. moms)" : ""} kr</Label>
                <Input type="number" step="0.01" value={qeAmount}
                  onChange={(e) => setQeAmount(e.target.value)} />
              </div>
            )}

            {qeType === "kvitto" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Vad köptes?</Label>
                  <Input value={qeText} onChange={(e) => setQeText(e.target.value)}
                    placeholder="T.ex. Kontorsmaterial ICA Maxi" />
                </div>
                <div className="space-y-1">
                  <Label>Kostnadskonto</Label>
                  <Select value={qeAccount} onValueChange={(v) => {
                    setQeAccount(v);
                    const acc = accounts.find((a) => a.number === parseInt(v));
                    if (acc?.vatRate != null) setQeVat(String(acc.vatRate));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {selectable.filter((a) => a.number >= 4000 && a.number <= 6999).map((a) => (
                        <SelectItem key={a.number} value={String(a.number)}>
                          {a.number} {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {(qeType === "kvitto" || qeType === "representation") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Momssats</Label>
                  <Select value={qeVat} onValueChange={setQeVat}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25 %</SelectItem>
                      <SelectItem value="12">12 %</SelectItem>
                      <SelectItem value="6">6 %</SelectItem>
                      <SelectItem value="0">0 % (momsfritt)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {qeType === "representation" && (
                  <div className="space-y-1">
                    <Label>Antal personer</Label>
                    <Input type="number" min="1" value={qePersons}
                      onChange={(e) => setQePersons(e.target.value)} />
                  </div>
                )}
                {qeType === "representation" && (
                  <div className="col-span-2 space-y-1">
                    <Label>Syfte och deltagare (SKV-krav)</Label>
                    <Input value={qeText} onChange={(e) => setQeText(e.target.value)}
                      placeholder="T.ex. Kundlunch Haus Media — Oliver, Anna (affärsförhandling)" />
                  </div>
                )}
              </div>
            )}

            {(qeType === "kvitto" || qeType === "representation") && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={qePrivate}
                  onChange={(e) => setQePrivate(e.target.checked)} />
                Betalt privat (bokförs som egen insättning i stället för företagskontot)
              </label>
            )}

            {preview && (
              <div className="rounded border bg-muted/40 p-3 text-sm space-y-1">
                <div className="font-medium">{preview.description}</div>
                {preview.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-4 tabular-nums">
                    <span className="font-mono">{r.account} <span className="font-sans text-muted-foreground">{accountName(r.account)}</span></span>
                    <span className="w-24 text-right">{r.debit > 0 ? r.debit.toFixed(2) : ""}</span>
                    <span className="w-24 text-right">{r.credit > 0 ? r.credit.toFixed(2) : ""}</span>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={submitQuickEvent} disabled={busy || !preview}>
              {busy ? "Bokför…" : "Bokför"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------- Manuell kontering ---------- */}
      <TabsContent value="manuell">
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Datum (affärshändelsen)</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Beskrivning *</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Vad avser händelsen? (art och mängd — BFL 5:7)" />
              </div>
            </div>
            <div className="space-y-1 max-w-sm">
              <Label>Motpart</Label>
              <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_120px_120px_32px] gap-2 text-xs font-medium text-muted-foreground">
                <span>Konto</span><span className="text-right">Debet</span>
                <span className="text-right">Kredit</span><span />
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_120px_32px] gap-2">
                  <Select value={r.account}
                    onValueChange={(v) => setRows((p) => p.map((x, j) => (j === i ? { ...x, account: v } : x)))}>
                    <SelectTrigger><SelectValue placeholder="Välj konto…" /></SelectTrigger>
                    <SelectContent>
                      {selectable.map((a) => (
                        <SelectItem key={a.number} value={String(a.number)}>
                          {a.number} {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" step="0.01" className="text-right" value={r.debit}
                    onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, debit: e.target.value, credit: e.target.value ? "" : x.credit } : x)))} />
                  <Input type="number" step="0.01" className="text-right" value={r.credit}
                    onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, credit: e.target.value, debit: e.target.value ? "" : x.debit } : x)))} />
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                    disabled={rows.length <= 2}>
                    ×
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setRows((p) => [...p, emptyRow()])}>
                  + Lägg till rad
                </Button>
                <div className={`text-sm tabular-nums ${balanced ? "text-green-600" : "text-destructive"}`}>
                  Debet {totalDebit.toFixed(2)} / Kredit {totalCredit.toFixed(2)}
                  {balanced ? " ✓" : ` (diff ${(totalDebit - totalCredit).toFixed(2)})`}
                </div>
              </div>
            </div>

            <Button onClick={submitManual} disabled={busy || !balanced}>
              {busy ? "Bokför…" : "Bokför verifikat"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
