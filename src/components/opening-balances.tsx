"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bookOpeningBalances } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Working } from "@/components/ui/working";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Row = { account: string; debit: string; credit: string };

export function OpeningBalances({
  accounts,
  hasVerifications,
}: {
  accounts: { number: number; name: string }[];
  hasVerifications: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("2026-01-01");
  const [rows, setRows] = useState<Row[]>([
    { account: "1930", debit: "", credit: "" },
    { account: "2010", debit: "", credit: "" },
  ]);

  const balanceAccounts = accounts.filter((a) => a.number < 3000);
  const totalDebit = rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  async function submit() {
    const parsed = rows
      .filter((r) => r.account && (parseFloat(r.debit) > 0 || parseFloat(r.credit) > 0))
      .map((r) => ({
        account: parseInt(r.account),
        debit: parseFloat(r.debit) || 0,
        credit: parseFloat(r.credit) || 0,
      }));
    if (parsed.length < 2 || !balanced) return toast.error("Balanserna måste balansera.");
    setBusy(true);
    const res = await bookOpeningBalances({ date, rows: parsed });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(`Ingående balanser bokförda (${res.label})`);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ingående balanser (migrering)</CardTitle>
        <CardDescription>
          Tar du över bokföring från ett annat system: ange utgående balanser från förra systemet
          per konto. Differensen mot eget kapital läggs på 2010. Tips: du kan också importera en
          SIE-fil under Rapporter → SIE.
          {hasVerifications && (
            <span className="block mt-1 text-amber-600">
              Obs: året har redan verifikat — ingående balanser bör bokföras först av allt.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-w-40 space-y-1">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_120px_32px] gap-2">
            <Select value={r.account}
              onValueChange={(v) => setRows((p) => p.map((x, j) => (j === i ? { ...x, account: v } : x)))}>
              <SelectTrigger><SelectValue placeholder="Konto…" /></SelectTrigger>
              <SelectContent>
                {balanceAccounts.map((a) => (
                  <SelectItem key={a.number} value={String(a.number)}>
                    {a.number} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" step="0.01" className="text-right" placeholder="Debet" value={r.debit}
              onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, debit: e.target.value } : x)))} />
            <Input type="number" step="0.01" className="text-right" placeholder="Kredit" value={r.credit}
              onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, credit: e.target.value } : x)))} />
            <Button variant="ghost" size="sm" disabled={rows.length <= 2}
              onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>×</Button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm"
            onClick={() => setRows((p) => [...p, { account: "", debit: "", credit: "" }])}>
            + Rad
          </Button>
          <span className={`text-sm tabular-nums ${balanced ? "text-green-600" : "text-muted-foreground"}`}>
            D {totalDebit.toFixed(2)} / K {totalCredit.toFixed(2)}
          </span>
        </div>
        <Button onClick={submit} disabled={busy || !balanced}>
          {busy ? <Working inline label="Bokför…" /> : "Bokför ingående balanser"}
        </Button>
      </CardContent>
    </Card>
  );
}
