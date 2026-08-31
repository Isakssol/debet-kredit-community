"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveQuote } from "@/lib/actions/crm";
import { calculateTotals, type InvoiceRowInput } from "@/lib/invoicing/totals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

export type QuoteFormRow = {
  articleId: string | null; description: string; quantity: number; unit: string;
  unitPrice: number; discountPct: number; vatRate: number; account: number; isTextRow: boolean;
};

type Article = {
  id: string; article_no: string; name: string; unit: string;
  price: number; vat_rate: number; sales_account: number;
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const fmt = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2 });

const EMPTY_ROW: QuoteFormRow = {
  articleId: null, description: "", quantity: 1, unit: "st",
  unitPrice: 0, discountPct: 0, vatRate: 25, account: 3011, isTextRow: false,
};

export function QuoteForm({
  quoteId,
  customers,
  articles,
  applyVatByCustomer,
  initial,
}: {
  quoteId: string | null;
  customers: { id: string; name: string }[];
  articles: Article[];
  applyVatByCustomer: Record<string, boolean>;
  initial?: {
    customerId: string; quoteDate: string; validUntil: string;
    yourReference: string; notes: string; rows: QuoteFormRow[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState(initial ?? {
    customerId: customers[0]?.id ?? "",
    quoteDate: today(),
    validUntil: plusDays(30),
    yourReference: "",
    notes: "",
    rows: [{ ...EMPTY_ROW }],
  });

  const applyVat = applyVatByCustomer[f.customerId] ?? true;
  const totals = useMemo(
    () => calculateTotals(f.rows as InvoiceRowInput[], applyVat),
    [f.rows, applyVat]
  );

  const setRow = (i: number, patch: Partial<QuoteFormRow>) =>
    setF((p) => ({ ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const pickArticle = (i: number, articleId: string) => {
    const a = articles.find((x) => x.id === articleId);
    if (!a) { setRow(i, { articleId: null }); return; }
    setRow(i, {
      articleId: a.id, description: a.name, unit: a.unit,
      unitPrice: Number(a.price), vatRate: Number(a.vat_rate), account: a.sales_account,
    });
  };

  const submit = () =>
    startTransition(async () => {
      const res = await saveQuote(quoteId, {
        ...f,
        rows: f.rows.filter((r) => r.description.trim() !== ""),
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success(quoteId ? "Offerten uppdaterad" : "Offert skapad");
      router.push(`/offerter/${res.quoteId}`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Offertuppgifter</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Kund</Label>
            <select className={selectClass} value={f.customerId}
              onChange={(e) => setF((p) => ({ ...p, customerId: e.target.value }))}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Offertdatum</Label>
            <Input type="date" value={f.quoteDate}
              onChange={(e) => setF((p) => ({ ...p, quoteDate: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Giltig till</Label>
            <Input type="date" value={f.validUntil}
              onChange={(e) => setF((p) => ({ ...p, validUntil: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Er referens</Label>
            <Input value={f.yourReference}
              onChange={(e) => setF((p) => ({ ...p, yourReference: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rader</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {f.rows.map((row, i) => (
              <div key={i} className="grid grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_5rem_5.5rem_6.5rem_5rem_2.5rem] gap-2 items-end rounded-xl bg-muted/40 p-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Artikel</Label>
                  <select className={selectClass} value={row.articleId ?? ""}
                    onChange={(e) => pickArticle(i, e.target.value)}>
                    <option value="">Fri rad…</option>
                    {articles.map((a) => (
                      <option key={a.id} value={a.id}>{a.article_no} · {a.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Beskrivning</Label>
                  <Input value={row.description}
                    onChange={(e) => setRow(i, { description: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Antal</Label>
                  <Input type="number" value={row.quantity}
                    onChange={(e) => setRow(i, { quantity: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">À-pris</Label>
                  <Input type="number" value={row.unitPrice}
                    onChange={(e) => setRow(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Rabatt %</Label>
                  <Input type="number" value={row.discountPct}
                    onChange={(e) => setRow(i, { discountPct: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Moms %</Label>
                  <select className={selectClass} value={row.vatRate}
                    onChange={(e) => setRow(i, { vatRate: parseFloat(e.target.value) })}>
                    <option value="25">25</option><option value="12">12</option>
                    <option value="6">6</option><option value="0">0</option>
                  </select>
                </div>
                <Button size="icon" variant="ghost" className="h-9 w-9"
                  disabled={f.rows.length === 1}
                  onClick={() => setF((p) => ({ ...p, rows: p.rows.filter((_, j) => j !== i) }))}
                  title="Ta bort rad">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline"
            onClick={() => setF((p) => ({ ...p, rows: [...p.rows, { ...EMPTY_ROW }] }))}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till rad
          </Button>

          <div className="flex justify-end">
            <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm space-y-0.5 min-w-52">
              <div className="flex justify-between gap-6"><span>Netto</span><span className="tabular-nums">{fmt(totals.net)} kr</span></div>
              <div className="flex justify-between gap-6"><span>Moms</span><span className="tabular-nums">{fmt(totals.vat)} kr</span></div>
              <div className="flex justify-between gap-6 font-semibold border-t pt-1"><span>Totalt</span><span className="tabular-nums">{fmt(totals.total)} kr</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Meddelande på offerten</Label>
            <Textarea rows={2} value={f.notes}
              placeholder="T.ex. leveransvillkor, vad som ingår…"
              onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <Button onClick={submit} disabled={pending || !f.customerId || totals.total <= 0}>
            {pending ? "Sparar…" : quoteId ? "Spara ändringar" : "Skapa offert"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
