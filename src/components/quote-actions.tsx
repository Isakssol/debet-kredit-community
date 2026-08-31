"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setQuoteStatus, convertQuoteToInvoice, deleteQuoteDraft } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import { Send, Check, X, Receipt, Trash2 } from "lucide-react";

/** Statusknappar för offert: skicka → acceptera/neka → fakturera */
export function QuoteActions({
  quoteId,
  status,
  convertedInvoiceId,
}: {
  quoteId: string;
  status: string;
  convertedInvoiceId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const transition = (next: "sent" | "accepted" | "declined") =>
    startTransition(async () => {
      const res = await setQuoteStatus(quoteId, next);
      if (res.error) { toast.error(res.error); return; }
      toast.success(
        next === "sent" ? "Offerten markerad som skickad"
        : next === "accepted" ? `Accepterad! Order O${res.orderNo} skapad 🎉`
        : "Offerten markerad som nekad"
      );
      router.refresh();
    });

  const invoice = () =>
    startTransition(async () => {
      const res = await convertQuoteToInvoice(quoteId);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Fakturautkast skapat från ordern");
      router.push(`/fakturor/${res.invoiceId}`);
    });

  const remove = () => {
    if (!confirm("Ta bort offertutkastet?")) return;
    startTransition(async () => {
      const res = await deleteQuoteDraft(quoteId);
      if (res.error) { toast.error(res.error); return; }
      router.push("/offerter");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <>
          <Button size="sm" onClick={() => transition("sent")} disabled={pending}>
            <Send className="h-3.5 w-3.5 mr-1" /> Markera skickad
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={pending}
            className="text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {status === "sent" && (
        <>
          <Button size="sm" onClick={() => transition("accepted")} disabled={pending}>
            <Check className="h-3.5 w-3.5 mr-1" /> Kund accepterade
          </Button>
          <Button size="sm" variant="outline" onClick={() => transition("declined")} disabled={pending}>
            <X className="h-3.5 w-3.5 mr-1" /> Nekad
          </Button>
        </>
      )}
      {status === "accepted" && (
        <Button size="sm" onClick={invoice} disabled={pending}>
          <Receipt className="h-3.5 w-3.5 mr-1" /> Skapa faktura
        </Button>
      )}
      {status === "invoiced" && convertedInvoiceId && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/fakturor/${convertedInvoiceId}`}>Visa fakturan</Link>
        </Button>
      )}
    </div>
  );
}
