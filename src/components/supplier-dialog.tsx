"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveSupplier } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function SupplierDialog({
  expenseAccounts,
}: {
  expenseAccounts: { number: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "", org_number: "", bankgiro: "", payment_terms: "30",
    default_expense_account: "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setBusy(true);
    const res = await saveSupplier(null, {
      ...f,
      payment_terms: parseInt(f.payment_terms) || 30,
      default_expense_account: f.default_expense_account
        ? parseInt(f.default_expense_account) : null,
    });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Leverantör skapad");
      setOpen(false);
      setF({ name: "", org_number: "", bankgiro: "", payment_terms: "30", default_expense_account: "" });
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Ny leverantör</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ny leverantör</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label>Namn *</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Organisationsnummer</Label>
            <Input value={f.org_number} onChange={(e) => set("org_number", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bankgiro</Label>
            <Input value={f.bankgiro} onChange={(e) => set("bankgiro", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Betalningsvillkor (dagar)</Label>
            <Input type="number" value={f.payment_terms}
              onChange={(e) => set("payment_terms", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Standardkonto för kostnader</Label>
            <Select value={f.default_expense_account}
              onValueChange={(v) => set("default_expense_account", v)}>
              <SelectTrigger><SelectValue placeholder="Valfritt…" /></SelectTrigger>
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
          <Button onClick={submit} disabled={busy || !f.name.trim()}>
            {busy ? "Sparar…" : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
