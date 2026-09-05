"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  bookInvoice, registerPayment, createCreditInvoice, markInvoiceSent,
  createReminder, deleteDraft,
} from "@/lib/actions/invoices";
import { sendInvoiceEmail } from "@/lib/actions/email";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Påminnelseavgiften är 60 kr enligt lag (1981:739) om ersättning för
 * inkassokostnader m.m. 4 § andra stycket. Enligt 2 § får ersättning för en
 * skriftlig betalningspåminnelse tas ut bara om avtal om det träffats senast i
 * samband med skuldens uppkomst — det kan programmet inte kontrollera, så det
 * står i knappens hjälptext. Server-actionen avvisar högre belopp.
 */
const REMINDER_FEE_NOTE =
  "Påminnelseavgift 60 kr (lag 1981:739, 4 §). Avgiften får bara tas ut om det avtalats senast när skulden uppkom (2 §).";

export function InvoiceActions({
  invoiceId,
  status,
  type,
  remaining,
  hasCreditNote,
}: {
  invoiceId: string;
  status: string;
  type: string;
  remaining: number;
  hasCreditNote: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState(remaining > 0 ? remaining.toFixed(2) : "");

  async function run(fn: () => Promise<{ error?: string } & Record<string, unknown>>, okMsg: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(okMsg);
      router.refresh();
    }
  }

  const canPay = ["booked", "sent", "partially_paid"].includes(status) && type === "debit";
  const canCredit = ["booked", "sent", "partially_paid", "paid"].includes(status)
    && type === "debit" && !hasCreditNote;

  return (
    <>
      {status === "draft" && (
        <>
          <Button disabled={busy}
            onClick={() => run(() => bookInvoice(invoiceId), "Faktura bokförd")}>
            Bokför faktura
          </Button>
          <Button variant="destructive" disabled={busy}
            onClick={() => run(() => deleteDraft(invoiceId).then((r) => {
              if (!r.error) router.push("/fakturor");
              return r;
            }), "Utkast raderat")}>
            Radera utkast
          </Button>
        </>
      )}

      {(status === "booked" || status === "sent") && type === "debit" && (
        <Button variant="outline" disabled={busy}
          onClick={() => run(async () => {
            const r = await sendInvoiceEmail(invoiceId);
            return r.error ? r : { ...r };
          }, "Faktura skickad via e-post")}>
          Skicka via e-post
        </Button>
      )}

      {status === "booked" && (
        <Button variant="ghost" disabled={busy}
          onClick={() => run(() => markInvoiceSent(invoiceId), "Markerad som skickad")}>
          Markera som skickad
        </Button>
      )}

      {canPay && (
        <Dialog open={payOpen} onOpenChange={(open) => {
          setPayOpen(open);
          if (open) setPayAmount(remaining > 0 ? remaining.toFixed(2) : "");
        }}>
          <DialogTrigger asChild>
            <Button disabled={busy}>Registrera betalning</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrera inbetalning</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Betaldatum</Label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Belopp (kvar: {remaining.toFixed(2)} kr)</Label>
                <Input type="number" step="0.01" value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPayOpen(false)}>Avbryt</Button>
              <Button disabled={busy} onClick={() =>
                run(async () => {
                  const r = await registerPayment({
                    invoiceId, paymentDate: payDate, amount: parseFloat(payAmount) || 0,
                  });
                  if (!r.error) setPayOpen(false);
                  return r;
                }, "Betalning bokförd")
              }>
                Bokför betalning
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canPay && (
        <Button variant="outline" disabled={busy} title={REMINDER_FEE_NOTE}
          onClick={() => run(async () => {
            const r = await createReminder(invoiceId, 60);
            if (!r.error) window.open(`/fakturor/${invoiceId}/paminnelse`, "_blank");
            return r;
          }, "Påminnelse skapad — PDF öppnas")}>
          Skapa påminnelse (PDF)
        </Button>
      )}

      {canCredit && (
        <Button variant="destructive" disabled={busy}
          onClick={() => {
            if (confirm("Skapa kreditfaktura som krediterar hela fakturan?")) {
              run(() => createCreditInvoice(invoiceId), "Kreditfaktura skapad");
            }
          }}>
          Kreditera
        </Button>
      )}
    </>
  );
}
