import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QuoteForm } from "@/components/quote-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function NewQuotePage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: articles }] = await Promise.all([
    supabase.from("customers").select("id, name, vat_type").order("name"),
    supabase.from("articles").select("id, article_no, name, unit, price, vat_rate, sales_account")
      .eq("active", true).order("article_no"),
  ]);

  if (!customers?.length) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Ny offert</h1>
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground space-y-3">
          <p>Du behöver minst en kund för att skapa en offert.</p>
          <Button asChild><Link href="/kunder">Lägg upp en kund</Link></Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Ny offert</h1>
      <QuoteForm
        quoteId={null}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        articles={(articles ?? []).map((a) => ({
          id: a.id, article_no: a.article_no, name: a.name, unit: a.unit,
          price: Number(a.price), vat_rate: Number(a.vat_rate), sales_account: a.sales_account,
        }))}
        applyVatByCustomer={Object.fromEntries(customers.map((c) => [c.id, c.vat_type === "SE"]))}
      />
    </div>
  );
}
