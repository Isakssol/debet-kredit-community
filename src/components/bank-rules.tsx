"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveBankRule, deleteBankRule, runBankRules } from "@/lib/actions/bank";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Zap, Trash2, Play } from "lucide-react";

type Rule = {
  id: string; name: string; match_text: string; direction: string;
  account: number; vat_rate: number; liquidity_account: number;
  auto_book: boolean; active: boolean;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

const EMPTY = {
  name: "", match_text: "", direction: "out", account: "",
  vat_rate: "25", liquidity_account: "1930", auto_book: false,
};

export function BankRules({
  rules,
  accounts,
}: {
  rules: Rule[];
  accounts: { number: number; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const save = () =>
    startTransition(async () => {
      const res = await saveBankRule({
        name: form.name,
        match_text: form.match_text,
        direction: form.direction,
        account: parseInt(form.account, 10),
        vat_rate: parseFloat(form.vat_rate),
        liquidity_account: parseInt(form.liquidity_account, 10),
        auto_book: form.auto_book,
      });
      if (res.error) toast.error(res.error);
      else { toast.success("Regel sparad"); setForm(EMPTY); setShowForm(false); }
    });

  const run = () =>
    startTransition(async () => {
      const res = await runBankRules(false);
      if (res.error) { toast.error(res.error); return; }
      toast.success(`${res.booked} transaktion${res.booked === 1 ? "" : "er"} bokförda via regler`);
      res.skipped?.slice(0, 3).forEach((s) => toast.warning(s));
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteBankRule(id);
      if (res.error) toast.error(res.error);
      else toast.success("Regel borttagen");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Bokföringsregler
        </CardTitle>
        <CardDescription>
          Matcha banktransaktioner på text och bokför dem automatiskt — t.ex.
          "Bankavgift" → 6570 momsfritt. Regler med automatik bokförs direkt vid
          synk/import när exakt en regel träffar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length > 0 && (
          <ul className="text-sm divide-y">
            {rules.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{r.name}</span>{" "}
                  <span className="text-muted-foreground">
                    · "{r.match_text}" · {r.direction === "in" ? "insättning" : r.direction === "out" ? "uttag" : "båda"} →{" "}
                    {r.account} {r.vat_rate > 0 ? `(${r.vat_rate} % moms)` : "(momsfritt)"} mot {r.liquidity_account}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {r.auto_book && <Badge variant="outline" className="text-emerald-600">Auto</Badge>}
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={pending}
                    onClick={() => remove(r.id)} title="Ta bort">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {showForm ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
            <div className="space-y-1">
              <Label className="text-xs">Namn</Label>
              <Input value={form.name} placeholder="T.ex. Bankavgift"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Matcha text (i beskrivning/motpart)</Label>
              <Input value={form.match_text} placeholder="T.ex. PRIS ENL SPEC"
                onChange={(e) => setForm((f) => ({ ...f, match_text: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Riktning</Label>
              <select className={selectClass} value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
                <option value="out">Uttag (kostnad)</option>
                <option value="in">Insättning (intäkt)</option>
                <option value="both">Båda</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Konto</Label>
              <select className={selectClass} value={form.account}
                onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}>
                <option value="">Välj konto…</option>
                {accounts.map((a) => (
                  <option key={a.number} value={a.number}>{a.number} {a.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Moms</Label>
              <select className={selectClass} value={form.vat_rate}
                onChange={(e) => setForm((f) => ({ ...f, vat_rate: e.target.value }))}>
                <option value="25">25 %</option>
                <option value="12">12 %</option>
                <option value="6">6 %</option>
                <option value="0">Momsfritt</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Likvidkonto</Label>
              <select className={selectClass} value={form.liquidity_account}
                onChange={(e) => setForm((f) => ({ ...f, liquidity_account: e.target.value }))}>
                <option value="1930">1930 Företagskonto</option>
                <option value="1940">1940 Övriga bankkonton</option>
                <option value="1910">1910 Kassa</option>
              </select>
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.auto_book}
                onChange={(e) => setForm((f) => ({ ...f, auto_book: e.target.checked }))} />
              Bokför automatiskt vid synk/import (annars via knappen nedan)
            </label>
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={save}
                disabled={pending || !form.name || !form.match_text || !form.account}>
                Spara regel
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Avbryt</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              + Ny regel
            </Button>
            {rules.length > 0 && (
              <Button size="sm" variant="outline" onClick={run} disabled={pending}>
                <Play className="h-3.5 w-3.5 mr-1" />
                Bokför alla regelträffar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
