"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAsset, runYearlyDepreciation, disposeAsset } from "@/lib/actions/assets";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ASSET_TYPES = [
  { label: "Inventarier och verktyg", account: 1220, contra: 1229, dep: 7832 },
  { label: "Datorer", account: 1250, contra: 1259, dep: 7835 },
];

export function AssetDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "", purchase_date: new Date().toISOString().slice(0, 10),
    purchase_value: "", vat_amount: "", type: "0", useful_life_years: "5",
    book_purchase: true,
  });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    const t = ASSET_TYPES[parseInt(f.type)];
    setBusy(true);
    const res = await createAsset({
      name: f.name,
      purchase_date: f.purchase_date,
      purchase_value: parseFloat(f.purchase_value) || 0,
      vat_amount: parseFloat(f.vat_amount) || 0,
      account: t.account,
      contra_account: t.contra,
      depreciation_account: t.dep,
      useful_life_years: parseInt(f.useful_life_years) || 5,
      book_purchase: f.book_purchase,
    });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Tillgång registrerad");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Ny tillgång</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrera anläggningstillgång</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Benämning *</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)}
              placeholder='T.ex. "MacBook Pro 16"' />
          </div>
          <div className="space-y-1">
            <Label>Typ</Label>
            <Select value={f.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t, i) => (
                  <SelectItem key={i} value={String(i)}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Inköpsdatum</Label>
            <Input type="date" value={f.purchase_date}
              onChange={(e) => set("purchase_date", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Anskaffningsvärde exkl. moms *</Label>
            <Input type="number" step="0.01" value={f.purchase_value}
              onChange={(e) => set("purchase_value", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Moms (kr)</Label>
            <Input type="number" step="0.01" value={f.vat_amount}
              onChange={(e) => set("vat_amount", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nyttjandeperiod (år)</Label>
            <Input type="number" value={f.useful_life_years}
              onChange={(e) => set("useful_life_years", e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={f.book_purchase}
              onChange={(e) => set("book_purchase", e.target.checked)} />
            Bokför inköpet nu (D {ASSET_TYPES[parseInt(f.type)].account} + D 2640 / K 1930).
            Bocka ur om inköpet redan är bokfört.
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button onClick={submit} disabled={busy || !f.name || !f.purchase_value}>
            {busy ? "Sparar…" : "Registrera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepreciationRun({ year }: { year: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      if (!confirm(`Beräkna och bokför årets avskrivningar för ${year}?`)) return;
      setBusy(true);
      const res = await runYearlyDepreciation(year);
      setBusy(false);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Avskrivningar bokförda: ${res.depreciation?.toLocaleString("sv-SE")} kr (${res.method})`);
        router.refresh();
      }
    }}>
      {busy ? "Beräknar…" : `Bokför avskrivningar ${year}`}
    </Button>
  );
}

export function DisposeDialog({ assetId, name }: { assetId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("0");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Avyttra</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Avyttra {name}</DialogTitle>
          <DialogDescription>
            Försäljningspris 0 kr = utrangering. Vinst bokförs på 3973, förlust på 7973.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Datum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Försäljningspris exkl. moms</Label>
            <Input type="number" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            const res = await disposeAsset({ assetId, date, amount: parseFloat(amount) || 0 });
            setBusy(false);
            if (res.error) toast.error(res.error);
            else {
              toast.success("Avyttring bokförd");
              setOpen(false);
              router.refresh();
            }
          }}>
            Bokför avyttring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
