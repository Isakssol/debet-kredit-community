import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { InvoiceActions } from "@/components/invoice-actions";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  draft: "Utkast", booked: "Bokförd", sent: "Skickad",
  partially_paid: "Delbetald", paid: "Betald", credited: "Krediterad", cancelled: "Makulerad",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select(`*, customers(name, email), invoice_rows(*), invoice_payments(*),
             invoice_reminders(*), credits:credits_invoice_id(id, invoice_no)`)
    .eq("id", id).single();
  if (!inv) notFound();

  const { data: creditNote } = await supabase.from("invoices")
    .select("id, invoice_no").eq("credits_invoice_id", id).maybeSingle();

  type Payment = { id: string; payment_date: string; amount: number };
  type Reminder = { reminder_no: number; sent_date: string };
  const payments = (inv.invoice_payments ?? []) as Payment[];
  const reminders = (inv.invoice_reminders ?? []) as Reminder[];
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(inv.total_amount) - paid;
  const customerName =
    (inv.customer_snapshot as { name?: string })?.name ?? inv.customers?.name ?? "";
  type Row = {
    row_no: number; description: string; quantity: number; unit: string;
    unit_price: number; discount_pct: number; vat_rate: number;
  };
  const rows = ((inv.invoice_rows ?? []) as Row[]).sort((a, b) => a.row_no - b.row_no);
  const isCredit = inv.type === "credit";

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {isCredit ? "Kreditfaktura" : "Faktura"} {inv.invoice_no ?? "(utkast)"}
          </h1>
          <p className="text-muted-foreground">{customerName}</p>
        </div>
        <Badge variant={inv.status === "paid" ? "default" : "outline"} className="text-sm">
          {STATUS_LABEL[inv.status] ?? inv.status}
        </Badge>
      </div>

      <div className="flex gap-2 flex-wrap text-sm">
        <Badge variant="outline">Fakturadatum: {inv.invoice_date}</Badge>
        {!isCredit && <Badge variant="outline">Förfaller: {inv.due_date}</Badge>}
        {inv.ocr && <Badge variant="outline">OCR: {inv.ocr}</Badge>}
        {inv.credits && (
          <Badge variant="secondary">
            <Link href={`/fakturor/${(inv.credits as { id: string }).id}`}>
              Krediterar faktura {(inv.credits as { invoice_no: number }).invoice_no}
            </Link>
          </Badge>
        )}
        {creditNote && (
          <Badge variant="destructive">
            <Link href={`/fakturor/${creditNote.id}`}>
              Krediterad av {creditNote.invoice_no}
            </Link>
          </Badge>
        )}
        {inv.verification_id && (
          <Badge variant="outline">
            <Link href={`/verifikat/${inv.verification_id}`}>Verifikat →</Link>
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Beskrivning</TableHead>
                <TableHead className="text-right">Antal</TableHead>
                <TableHead>Enhet</TableHead>
                <TableHead className="text-right">À-pris</TableHead>
                <TableHead className="text-right">Rabatt</TableHead>
                <TableHead className="text-right">Moms</TableHead>
                <TableHead className="text-right">Belopp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.row_no}>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.quantity)}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(Number(r.unit_price))}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.discount_pct) > 0 ? `${Number(r.discount_pct)} %` : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.vat_rate)} %</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(Number(r.quantity) * Number(r.unit_price) * (1 - Number(r.discount_pct) / 100))}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={6} className="text-right text-muted-foreground">Netto</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(Number(inv.net_amount))}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={6} className="text-right text-muted-foreground">Moms</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(Number(inv.vat_amount))}</TableCell>
              </TableRow>
              {Number(inv.rounding) !== 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-right text-muted-foreground">Öresavrundning</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(Number(inv.rounding))}</TableCell>
                </TableRow>
              )}
              <TableRow className="font-semibold border-t-2">
                <TableCell colSpan={6} className="text-right">Att betala</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(Number(inv.total_amount))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isCredit && inv.status !== "draft" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Betalningar — {fmt(paid)} kr betalt, {fmt(remaining)} kr kvar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length > 0 ? (
              <ul className="text-sm divide-y">
                {payments
                  .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
                  .map((p) => (
                    <li key={p.id} className="py-1.5 flex justify-between">
                      <span>{p.payment_date}</span>
                      <span className="tabular-nums">{fmt(Number(p.amount))} kr</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Inga betalningar registrerade.</p>
            )}
            {reminders.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                Påminnelser: {reminders
                  .map((r) => `nr ${r.reminder_no} (${r.sent_date})`).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {inv.status !== "draft" && (
          <Button variant="outline" asChild>
            <a href={`/fakturor/${inv.id}/pdf`} target="_blank">Öppna PDF</a>
          </Button>
        )}
        <InvoiceActions
          invoiceId={inv.id}
          status={inv.status}
          type={inv.type}
          remaining={remaining}
          hasCreditNote={!!creditNote}
        />
      </div>
    </div>
  );
}
