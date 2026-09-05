"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { paySupplierInvoice } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISO } from "@/lib/dates";

export function SupplierPayDialog({
  supplierInvoiceId,
  remaining,
}: {
  supplierInvoiceId: string;
  remaining: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) setAmount(remaining.toFixed(2));
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Betala</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Registrera betalning</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Betaldatum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Belopp (kvar: {remaining.toFixed(2)} kr)</Label>
            <Input type="number" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            const res = await paySupplierInvoice({
              supplierInvoiceId, paymentDate: date, amount: parseFloat(amount) || 0,
            });
            setBusy(false);
            if (res.error) toast.error(res.error);
            else {
              toast.success("Betalning bokförd");
              setOpen(false);
              router.refresh();
            }
          }}>
            {busy ? "Bokför…" : "Bokför betalning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
