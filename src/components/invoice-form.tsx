"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveInvoiceDraft, bookInvoice } from "@/lib/actions/invoices";
import { calculateTotals, type InvoiceRowInput } from "@/lib/invoicing/totals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Customer = {
  id: string; customer_no: number; name: string;
  payment_terms: number | null; vat_type: string;
};
type Article = {
  id: string; articleNo: string; name: string; unit: string;
  price: number; vatRate: number; salesAccount: number;
};
type Row = {
  articleId: string | null; description: string; quantity: string;
  unit: string; unitPrice: string; discountPct: string; vatRate: string;
  account: number;
};

const emptyRow = (): Row => ({
  articleId: null, description: "", quantity: "1", unit: "st",
  unitPrice: "", discountPct: "0", vatRate: "25", account: 3011,
});

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InvoiceForm({
  customers,
  articles,
  defaultPaymentTerms,
}: {
  customers: Customer[];
  articles: Article[];
  defaultPaymentTerms: number;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [paymentTerms, setPaymentTerms] = useState(String(defaultPaymentTerms));
  const [yourReference, setYourReference] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  const customer = customers.find((c) => c.id === customerId);
  const applyVat = !customer || customer.vat_type === "SE";

  const totals = useMemo(() => {
    const inputs: InvoiceRowInput[] = rows
      .filter((r) => r.description && parseFloat(r.unitPrice) > 0)
      .map((r) => ({
        description: r.description,
        quantity: parseFloat(r.quantity) || 0,
        unitPrice: parseFloat(r.unitPrice) || 0,
        discountPct: parseFloat(r.discountPct) || 0,
        vatRate: parseFloat(r.vatRate),
        account: r.account,
      }));
    return calculateTotals(inputs, applyVat);
  }, [rows, applyVat]);

  function selectCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c?.payment_terms != null) setPaymentTerms(String(c.payment_terms));
  }

  function selectArticle(rowIdx: number, articleId: string) {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return;
    setRows((prev) => prev.map((r, i) => i === rowIdx ? {
      articleId: a.id,
      description: a.name,
      quantity: r.quantity || "1",
      unit: a.unit,
      unitPrice: String(a.price),
      discountPct: r.discountPct,
      vatRate: String(a.vatRate),
      account: a.salesAccount,
    } : r));
  }

  const setRow = (i: number, field: keyof Row, value: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  async function save(book: boolean) {
    if (!customerId) return toast.error("Välj kund.");
    const validRows = rows.filter((r) => r.description && parseFloat(r.unitPrice) > 0);
    if (!validRows.length) return toast.error("Minst en fakturarad krävs.");
    setBusy(true);
    const res = await saveInvoiceDraft(null, {
      customerId,
      invoiceDate,
      paymentTerms: parseInt(paymentTerms) || 0,
      yourReference,
      notes,
      rows: validRows.map((r) => ({
        articleId: r.articleId,
        description: r.description,
        quantity: parseFloat(r.quantity) || 1,
        unit: r.unit,
        unitPrice: parseFloat(r.unitPrice) || 0,
        discountPct: parseFloat(r.discountPct) || 0,
        vatRate: parseFloat(r.vatRate),
        account: r.account,
        isTextRow: false,
      })),
    });
    if (res.error || !res.invoiceId) {
      setBusy(false);
      return toast.error(res.error ?? "Kunde inte spara.");
    }
    if (book) {
      const booked = await bookInvoice(res.invoiceId);
      setBusy(false);
      if (booked.error) return toast.error(booked.error);
      toast.success(`Faktura ${booked.invoiceNo} bokförd`);
    } else {
      setBusy(false);
      toast.success("Utkast sparat");
    }
    router.push(`/fakturor/${res.invoiceId}`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 grid grid-cols-4 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Kund *</Label>
            <Select value={customerId} onValueChange={selectCustomer}>
              <SelectTrigger><SelectValue placeholder="Välj kund…" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.customer_no} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customer && customer.vat_type !== "SE" && (
              <p className="text-xs text-muted-foreground">
                {customer.vat_type === "EU_REVERSE"
                  ? "EU-kund: fakturan blir momsfri med texten ”omvänd betalningsskyldighet”."
                  : "Exportkund: fakturan blir momsfri."}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Fakturadatum</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Betalningsvillkor (dagar)</Label>
            <Input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Er referens</Label>
            <Input value={yourReference} onChange={(e) => setYourReference(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="grid grid-cols-[170px_1fr_70px_70px_100px_70px_80px_32px] gap-2 text-xs font-medium text-muted-foreground">
            <span>Artikel</span><span>Beskrivning</span><span className="text-right">Antal</span>
            <span>Enhet</span><span className="text-right">À-pris</span>
            <span className="text-right">Rabatt %</span><span>Moms</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[170px_1fr_70px_70px_100px_70px_80px_32px] gap-2">
              <Select value={r.articleId ?? ""} onValueChange={(v) => selectArticle(i, v)}>
                <SelectTrigger><SelectValue placeholder="Fri text" /></SelectTrigger>
                <SelectContent>
                  {articles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.articleNo} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={r.description} onChange={(e) => setRow(i, "description", e.target.value)}
                placeholder="Beskrivning av vara/tjänst" />
              <Input type="number" step="0.5" className="text-right" value={r.quantity}
                onChange={(e) => setRow(i, "quantity", e.target.value)} />
              <Input value={r.unit} onChange={(e) => setRow(i, "unit", e.target.value)} />
              <Input type="number" step="0.01" className="text-right" value={r.unitPrice}
                onChange={(e) => setRow(i, "unitPrice", e.target.value)} />
              <Input type="number" className="text-right" value={r.discountPct}
                onChange={(e) => setRow(i, "discountPct", e.target.value)} />
              <Select value={r.vatRate} onValueChange={(v) => setRow(i, "vatRate", v)} disabled={!applyVat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 %</SelectItem>
                  <SelectItem value="12">12 %</SelectItem>
                  <SelectItem value="6">6 %</SelectItem>
                  <SelectItem value="0">0 %</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="sm"
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                disabled={rows.length <= 1}>×</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm"
            onClick={() => setRows((p) => [...p, emptyRow()])}>
            + Lägg till rad
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-start justify-between">
        <div className="space-y-1 w-96">
          <Label>Meddelande på fakturan</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="text-sm space-y-1 text-right tabular-nums min-w-56">
          <div className="flex justify-between gap-8"><span>Netto</span><span>{fmt(totals.net)} kr</span></div>
          {totals.vatGroups.map((g) => (
            <div key={g.rate} className="flex justify-between gap-8">
              <span>Moms {g.rate} %</span><span>{fmt(g.vat)} kr</span>
            </div>
          ))}
          {totals.rounding !== 0 && (
            <div className="flex justify-between gap-8">
              <span>Öresavrundning</span><span>{fmt(totals.rounding)} kr</span>
            </div>
          )}
          <div className="flex justify-between gap-8 font-semibold text-base border-t pt-1">
            <span>Att betala</span><span>{fmt(totals.total)} kr</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => save(false)} disabled={busy}>
          Spara som utkast
        </Button>
        <Button onClick={() => save(true)} disabled={busy}>
          {busy ? "Bokför…" : "Bokför faktura"}
        </Button>
      </div>
    </div>
  );
}
