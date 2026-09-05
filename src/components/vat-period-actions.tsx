"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { approveVatReport, payVat } from "@/lib/actions/vat";
import { ESKD_NOTE_MAX } from "@/lib/vat/report";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/dates";

export function VatPeriodActions({
  periodStart,
  periodEnd,
  isApproved,
  payable,
  hasEskd,
  verificationId,
}: {
  periodStart: string;
  periodEnd: string;
  isApproved: boolean;
  payable: number;
  hasEskd: boolean;
  verificationId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payDate, setPayDate] = useState(todayISO());
  // Upplysningen till Skatteverket (eSKD Rad 35) — valfri, men den normala vägen
  // att förklara en rättelse av en redan inlämnad deklaration.
  const [note, setNote] = useState("");

  return (
    <div className="flex gap-2 flex-wrap">
      {!isApproved && (
        <Dialog>
          <DialogTrigger asChild>
            <Button disabled={busy}>Godkänn momsrapport</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Godkänn momsrapporten?</DialogTitle>
              <DialogDescription>
                Detta skapar ett omföringsverifikat (momskontona nollställs mot 2650),
                låser periodens månader permanent och genererar eSKD-filen för Skatteverket.
                Se till att alla verifikat för perioden är bokförda först.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label>Upplysning till Skatteverket (valfri)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                placeholder="T.ex. varför deklarationen rättas." />
              <p className="text-[11px] text-muted-foreground">
                Skrivs i eSKD-filens fält TextUpplysningMoms, högst {ESKD_NOTE_MAX} tecken.
                {note.trim() ? ` ${note.trim().length} tecken.` : ""}
              </p>
            </div>
            <DialogFooter>
              <Button disabled={busy} onClick={async () => {
                setBusy(true);
                const res = await approveVatReport({ periodStart, periodEnd, note });
                setBusy(false);
                if (res.error) toast.error(res.error);
                else {
                  toast.success("Momsrapport godkänd — perioden är låst");
                  router.refresh();
                }
              }}>
                {busy ? "Godkänner…" : "Godkänn och lås perioden"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isApproved && hasEskd && (
        <Button variant="outline" asChild>
          <a href={`/moms/eskd?period=${periodStart}`} download>
            Ladda ner eSKD-fil
          </a>
        </Button>
      )}

      {isApproved && verificationId && (
        <Button variant="ghost" asChild>
          <Link href={`/verifikat/${verificationId}`}>Omföringsverifikat →</Link>
        </Button>
      )}

      {isApproved && payable !== 0 && (
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              {payable > 0 ? "Bokför momsbetalning" : "Bokför återbetalning"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {payable > 0 ? "Momsbetalning" : "Momsåterbetalning"}
              </DialogTitle>
              <DialogDescription>
                {payable > 0
                  ? `${payable.toLocaleString("sv-SE")} kr bokförs D 2650 / K 1930.`
                  : `${(-payable).toLocaleString("sv-SE")} kr bokförs D 1930 / K 2650.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label>Betaldatum</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button disabled={busy} onClick={async () => {
                setBusy(true);
                const res = await payVat({ date: payDate, amount: payable });
                setBusy(false);
                if (res.error) toast.error(res.error);
                else {
                  toast.success("Momsbetalning bokförd");
                  setPayOpen(false);
                  router.refresh();
                }
              }}>
                Bokför
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
