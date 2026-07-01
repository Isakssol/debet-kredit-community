"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { correctVerification } from "@/lib/actions/verifications";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = { account: number; debit: number; credit: number };

export function CorrectionDialog({
  verificationId,
  description,
  rows: originalRows,
}: {
  verificationId: string;
  description: string;
  rows: Row[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [newDescription, setNewDescription] = useState(description);
  const [rows, setRows] = useState<Row[]>(originalRows);
  const [reverseOnly, setReverseOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  function updateRow(i: number, field: keyof Row, value: string) {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: Number(value) || 0 } : r))
    );
  }

  async function submit() {
    if (!reason.trim()) {
      toast.error("Ange orsak till rättelsen (krav enligt BFNAR 2013:2).");
      return;
    }
    if (!reverseOnly && !balanced) {
      toast.error("De nya raderna balanserar inte.");
      return;
    }
    setBusy(true);
    const res = await correctVerification({
      originalId: verificationId,
      date: new Date().toISOString().slice(0, 10),
      description: newDescription,
      rows: reverseOnly ? null : rows,
      reason,
    });
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Ändringsverifikat skapat");
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Rätta verifikat</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rätta verifikat</DialogTitle>
          <DialogDescription>
            Originalet vänds med ett ändringsverifikat och ersätts av ett nytt.
            Båda länkas till originalet — inget raderas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Orsak till rättelsen *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="T.ex. fel konto: skulle vara 5460" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reverseOnly}
              onChange={(e) => setReverseOnly(e.target.checked)} />
            Endast vändning (makulera utan ersättning)
          </label>
          {!reverseOnly && (
            <>
              <div className="space-y-1">
                <Label>Ny beskrivning</Label>
                <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Nya rader</Label>
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <Input type="number" value={r.account || ""} placeholder="Konto"
                      onChange={(e) => updateRow(i, "account", e.target.value)} />
                    <Input type="number" step="0.01" value={r.debit || ""} placeholder="Debet"
                      onChange={(e) => updateRow(i, "debit", e.target.value)} />
                    <Input type="number" step="0.01" value={r.credit || ""} placeholder="Kredit"
                      onChange={(e) => updateRow(i, "credit", e.target.value)} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setRows([...rows, { account: 0, debit: 0, credit: 0 }])}>
                    + Rad
                  </Button>
                  <span className={`text-sm ml-auto ${balanced ? "text-muted-foreground" : "text-destructive"}`}>
                    D {totalDebit.toFixed(2)} / K {totalCredit.toFixed(2)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Bokför…" : "Skapa ändringsverifikat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
