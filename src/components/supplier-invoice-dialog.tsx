"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { registerSupplierInvoice, attachSupplierFile } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function SupplierInvoiceDialog({
  suppliers,
  expenseAccounts,
}: {
  suppliers: { id: string; name: string; paymentTerms: number; defaultExpenseAccount: number | null }[];
  expenseAccounts: { number: number; name: string; default_vat_rate: number | null }[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    supplierId: "", invoiceNo: "", ocr: "", invoiceDate: today,
    dueDate: addDays(today, 30), totalAmount: "", vatRate: "25",
    expenseAccount: "", description: "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  function selectSupplier(id: string) {
    const s = suppliers.find((x) => x.id === id);
    setF((p) => ({
      ...p,
      supplierId: id,
      dueDate: addDays(p.invoiceDate, s?.paymentTerms ?? 30),
      expenseAccount: s?.defaultExpenseAccount ? String(s.defaultExpenseAccount) : p.expenseAccount,
    }));
  }

  async function submit() {
    setBusy(true);
    const res = await registerSupplierInvoice({
      supplierId: f.supplierId,
      invoiceNo: f.invoiceNo,
      ocr: f.ocr,
      invoiceDate: f.invoiceDate,
      dueDate: f.dueDate,
      totalAmount: parseFloat(f.totalAmount) || 0,
      vatRate: parseFloat(f.vatRate),
      expenseAccount: parseInt(f.expenseAccount) || 0,
      description: f.description,
    });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      const file = fileRef.current?.files?.[0];
      if (file && res.id) {
        const fd = new FormData();
        fd.set("file", file);
        const att = await attachSupplierFile(res.id, fd);
        if (att.error) toast.error("Faktura bokförd men bilagan misslyckades: " + att.error);
      }
      toast.success("Leverantörsfaktura registrerad och bokförd");
      setOpen(false);
      setF({
        supplierId: "", invoiceNo: "", ocr: "", invoiceDate: today,
        dueDate: addDays(today, 30), totalAmount: "", vatRate: "25",
        expenseAccount: "", description: "",
      });
      router.refresh();
    }
  }

  const gross = parseFloat(f.totalAmount) || 0;
  const rate = parseFloat(f.vatRate);
  const vat = gross - gross / (1 + rate / 100);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Registrera leverantörsfaktura</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Registrera leverantörsfaktura</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Leverantör *</Label>
            <Select value={f.supplierId} onValueChange={selectSupplier}>
              <SelectTrigger><SelectValue placeholder="Välj leverantör…" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Vad avser fakturan? *</Label>
            <Input value={f.description} onChange={(e) => set("description", e.target.value)}
              placeholder="T.ex. Bredband juli 2026" />
          </div>
          <div className="space-y-1">
            <Label>Fakturanummer</Label>
            <Input value={f.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>OCR</Label>
            <Input value={f.ocr} onChange={(e) => set("ocr", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fakturadatum</Label>
            <Input type="date" value={f.invoiceDate}
              onChange={(e) => set("invoiceDate", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Förfallodatum</Label>
            <Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Belopp inkl. moms *</Label>
            <Input type="number" step="0.01" value={f.totalAmount}
              onChange={(e) => set("totalAmount", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Momssats (moms: {vat.toFixed(2)} kr)</Label>
            <Select value={f.vatRate} onValueChange={(v) => set("vatRate", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 %</SelectItem>
                <SelectItem value="12">12 %</SelectItem>
                <SelectItem value="6">6 %</SelectItem>
                <SelectItem value="0">0 % (momsfri)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Bilaga (fakturan som PDF/bild — arkiveras 7 år)</Label>
            <Input ref={fileRef} type="file" accept="image/*,.pdf" />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Kostnadskonto *</Label>
            <Select value={f.expenseAccount} onValueChange={(v) => {
              set("expenseAccount", v);
              const acc = expenseAccounts.find((a) => a.number === parseInt(v));
              if (acc?.default_vat_rate != null) set("vatRate", String(Number(acc.default_vat_rate)));
            }}>
              <SelectTrigger><SelectValue placeholder="Välj konto…" /></SelectTrigger>
              <SelectContent>
                {expenseAccounts.map((a) => (
                  <SelectItem key={a.number} value={String(a.number)}>
                    {a.number} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button onClick={submit}
            disabled={busy || !f.supplierId || !f.description || !f.totalAmount || !f.expenseAccount}>
            {busy ? "Bokför…" : "Registrera & bokför"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
