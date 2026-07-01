"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveArticle } from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Article = {
  id: string;
  article_no: string;
  name: string;
  unit: string;
  price: number;
  vat_rate: number;
  type: string;
  sales_account: number;
};

export function ArticleDialog({
  article,
  salesAccounts,
}: {
  article?: Article;
  salesAccounts: { number: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    article_no: article?.article_no ?? "",
    name: article?.name ?? "",
    unit: article?.unit ?? "tim",
    price: article?.price?.toString() ?? "",
    vat_rate: article?.vat_rate?.toString() ?? "25",
    type: article?.type ?? "service",
    sales_account: article?.sales_account?.toString() ?? "3011",
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function submit() {
    setBusy(true);
    const res = await saveArticle(article?.id ?? null, {
      ...form,
      price: parseFloat(form.price) || 0,
      vat_rate: parseFloat(form.vat_rate),
      sales_account: parseInt(form.sales_account),
      type: form.type as "service" | "goods",
    });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(article ? "Artikel uppdaterad" : "Artikel skapad");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={article ? "ghost" : "default"} size={article ? "sm" : "default"}>
          {article ? "Redigera" : "Ny artikel"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{article ? "Redigera artikel" : "Ny artikel"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Artikelnummer *</Label>
            <Input value={form.article_no} onChange={(e) => set("article_no", e.target.value)}
              placeholder="T.ex. KONSULT" />
          </div>
          <div className="space-y-1">
            <Label>Enhet</Label>
            <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tim">tim</SelectItem>
                <SelectItem value="st">st</SelectItem>
                <SelectItem value="dag">dag</SelectItem>
                <SelectItem value="mån">mån</SelectItem>
                <SelectItem value="projekt">projekt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Benämning *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder="T.ex. Konsultarvode systemutveckling" />
          </div>
          <div className="space-y-1">
            <Label>Pris exkl. moms (kr)</Label>
            <Input type="number" step="0.01" value={form.price}
              onChange={(e) => set("price", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Momssats</Label>
            <Select value={form.vat_rate} onValueChange={(v) => set("vat_rate", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 %</SelectItem>
                <SelectItem value="12">12 %</SelectItem>
                <SelectItem value="6">6 %</SelectItem>
                <SelectItem value="0">0 %</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Försäljningskonto</Label>
            <Select value={form.sales_account} onValueChange={(v) => set("sales_account", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {salesAccounts.map((a) => (
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
          <Button onClick={submit} disabled={busy || !form.name.trim() || !form.article_no.trim()}>
            {busy ? "Sparar…" : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
