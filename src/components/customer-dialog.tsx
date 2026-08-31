"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveCustomer } from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Customer = {
  id: string;
  name: string;
  org_number: string | null;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  payment_terms: number | null;
  vat_type: string;
  your_reference: string | null;
};

export function CustomerDialog({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    org_number: customer?.org_number ?? "",
    vat_number: customer?.vat_number ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    postal_code: customer?.postal_code ?? "",
    city: customer?.city ?? "",
    country: customer?.country ?? "SE",
    payment_terms: customer?.payment_terms?.toString() ?? "",
    vat_type: customer?.vat_type ?? "SE",
    your_reference: customer?.your_reference ?? "",
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function submit() {
    setBusy(true);
    const res = await saveCustomer(customer?.id ?? null, {
      ...form,
      payment_terms: form.payment_terms ? parseInt(form.payment_terms) : null,
      vat_type: form.vat_type as "SE" | "EU_REVERSE" | "EXPORT",
    });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(customer ? "Kund uppdaterad" : "Kund skapad");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={customer ? "ghost" : "default"} size={customer ? "sm" : "default"}>
          {customer ? "Redigera" : "Ny kund"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? "Redigera kund" : "Ny kund"}</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Namn *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Org-/personnummer</Label>
            <Input value={form.org_number} onChange={(e) => set("org_number", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>E-post</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label>Adress</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Postnummer</Label>
            <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Ort</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Momstyp</Label>
            <Select value={form.vat_type} onValueChange={(v) => set("vat_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SE">Sverige (moms)</SelectItem>
                <SelectItem value="EU_REVERSE">EU-företag (omvänd moms)</SelectItem>
                <SelectItem value="EXPORT">Utanför EU (export)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Betalningsvillkor (dagar)</Label>
            <Input type="number" placeholder="standard" value={form.payment_terms}
              onChange={(e) => set("payment_terms", e.target.value)} />
          </div>
          {form.vat_type === "EU_REVERSE" && (
            <div className="sm:col-span-2 space-y-1">
              <Label>VAT-nummer * (krävs för omvänd skattskyldighet)</Label>
              <Input value={form.vat_number} placeholder="DE123456789"
                onChange={(e) => set("vat_number", e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Telefon</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Er referens</Label>
            <Input value={form.your_reference} onChange={(e) => set("your_reference", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button onClick={submit} disabled={busy || !form.name.trim()}>
            {busy ? "Sparar…" : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
