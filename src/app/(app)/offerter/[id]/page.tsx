import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QuoteForm, type QuoteFormRow } from "@/components/quote-form";
import { QuoteActions } from "@/components/quote-actions";
import { PrintButton } from "@/components/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fmt = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2 });

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ redigera?: string }>;
}) {
  const { id } = await params;
  const { redigera } = await searchParams;
  const supabase = await createClient();
  const [{ data: quote }, { data: settings }] = await Promise.all([
    supabase.from("quotes").select("*, customers(*), quote_rows(*)").eq("id", id).single(),
    supabase.from("settings").select("*").eq("id", 1).single(),
  ]);
  if (!quote) return <p className="text-muted-foreground">Offerten finns inte.</p>;

  const customer = quote.customers as unknown as {
    name: string; address: string | null; postal_code: string | null; city: string | null;
    vat_type: string;
  };
  const rows = (quote.quote_rows as {
    row_no: number; article_id: string | null; description: string; quantity: number;
    unit: string; unit_price: number; discount_pct: number; vat_rate: number;
    account: number | null; is_text_row: boolean;
  }[]).sort((a, b) => a.row_no - b.row_no);

  const editable = ["draft", "sent"].includes(quote.status);

  // Redigeringsläge
  if (editable && redigera === "1") {
    const [{ data: customers }, { data: articles }] = await Promise.all([
      supabase.from("customers").select("id, name, vat_type").order("name"),
      supabase.from("articles").select("id, article_no, name, unit, price, vat_rate, sales_account")
        .eq("active", true).order("article_no"),
    ]);
    return (
      <div className="max-w-4xl space-y-4">
        <h1 className="text-2xl font-semibold">Redigera offert #{quote.quote_no}</h1>
        <QuoteForm
          quoteId={quote.id}
          customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name }))}
          articles={(articles ?? []).map((a) => ({
            id: a.id, article_no: a.article_no, name: a.name, unit: a.unit,
            price: Number(a.price), vat_rate: Number(a.vat_rate), sales_account: a.sales_account,
          }))}
          applyVatByCustomer={Object.fromEntries((customers ?? []).map((c) => [c.id, c.vat_type === "SE"]))}
          initial={{
            customerId: quote.customer_id,
            quoteDate: quote.quote_date,
            validUntil: quote.valid_until,
            yourReference: quote.your_reference ?? "",
            notes: quote.notes ?? "",
            rows: rows.map((r): QuoteFormRow => ({
              articleId: r.article_id, description: r.description, quantity: Number(r.quantity),
              unit: r.unit, unitPrice: Number(r.unit_price), discountPct: Number(r.discount_pct),
              vatRate: Number(r.vat_rate), account: r.account ?? 3011, isTextRow: r.is_text_row,
            })),
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">
            {quote.order_no ? `Order O${quote.order_no}` : `Offert #${quote.quote_no}`}
          </h1>
          <p className="text-sm text-muted-foreground">{customer.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/offerter/${quote.id}?redigera=1`}>Redigera</Link>
            </Button>
          )}
          <PrintButton label="Skriv ut / PDF" />
          <QuoteActions
            quoteId={quote.id}
            status={quote.status}
            convertedInvoiceId={quote.converted_invoice_id}
          />
        </div>
      </div>

      {/* Offertdokumentet — utskrivbart */}
      <Card>
        <CardContent className="py-8 px-8 space-y-6 print:shadow-none">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xl font-bold font-heading">
                {quote.order_no ? "Orderbekräftelse" : "Offert"}
              </div>
              <div className="text-sm text-muted-foreground">
                {quote.order_no ? `Order O${quote.order_no} · ` : ""}Nr {quote.quote_no} · {quote.quote_date}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold">{settings?.company_name}</div>
              <div className="text-muted-foreground">
                {settings?.address}<br />{settings?.postal_code} {settings?.city}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Till</div>
              <div className="font-medium">{customer.name}</div>
              <div className="text-muted-foreground">
                {customer.address}<br />{customer.postal_code} {customer.city}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Giltig till</div>
              <div className="font-medium">{quote.valid_until}</div>
              {quote.your_reference && (
                <div className="text-muted-foreground mt-1">Er referens: {quote.your_reference}</div>
              )}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Beskrivning</th>
                <th className="py-1.5 font-medium text-right">Antal</th>
                <th className="py-1.5 font-medium text-right">À-pris</th>
                <th className="py-1.5 font-medium text-right">Moms</th>
                <th className="py-1.5 font-medium text-right">Belopp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const net = Number(r.quantity) * Number(r.unit_price) * (1 - Number(r.discount_pct) / 100);
                return (
                  <tr key={r.row_no} className="border-b border-border/50">
                    <td className="py-2">
                      {r.description}
                      {Number(r.discount_pct) > 0 && (
                        <span className="text-xs text-muted-foreground"> (−{Number(r.discount_pct)} %)</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{Number(r.quantity)} {r.unit}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(Number(r.unit_price))}</td>
                    <td className="py-2 text-right tabular-nums">{Number(r.vat_rate)} %</td>
                    <td className="py-2 text-right tabular-nums">{fmt(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="text-sm space-y-1 min-w-56">
              <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span className="tabular-nums">{fmt(Number(quote.net_amount))} kr</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Moms</span><span className="tabular-nums">{fmt(Number(quote.vat_amount))} kr</span></div>
              <div className="flex justify-between font-semibold text-base border-t pt-1">
                <span>Att betala</span><span className="tabular-nums">{fmt(Number(quote.total_amount))} kr</span>
              </div>
            </div>
          </div>

          {quote.notes && (
            <p className="text-sm text-muted-foreground border-t pt-4 whitespace-pre-line">{quote.notes}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Offerten är giltig till {quote.valid_until}. Priser {customer.vat_type === "SE" ? "exkl. moms enligt specifikation" : "utan svensk moms"}.
          </p>
        </CardContent>
      </Card>

      <div className="print:hidden">
        <Badge variant="outline">
          Status: {quote.status === "draft" ? "Utkast" : quote.status === "sent" ? "Skickad"
            : quote.status === "accepted" ? "Accepterad (order)" : quote.status === "declined" ? "Nekad"
            : quote.status === "expired" ? "Utgången" : "Fakturerad"}
        </Badge>
      </div>
    </div>
  );
}
