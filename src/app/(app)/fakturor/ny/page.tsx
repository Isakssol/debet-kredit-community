import { createClient } from "@/lib/supabase/server";
import { InvoiceForm } from "@/components/invoice-form";

export default async function NewInvoicePage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: articles }, { data: settings }] = await Promise.all([
    supabase.from("customers").select("id, customer_no, name, payment_terms, vat_type")
      .eq("active", true).order("name"),
    supabase.from("articles").select("*").eq("active", true).order("article_no"),
    supabase.from("settings").select("default_payment_terms").eq("id", 1).single(),
  ]);

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Ny faktura</h1>
      <InvoiceForm
        customers={customers ?? []}
        articles={(articles ?? []).map((a) => ({
          id: a.id,
          articleNo: a.article_no,
          name: a.name,
          unit: a.unit,
          price: Number(a.price),
          vatRate: Number(a.vat_rate),
          salesAccount: a.sales_account,
        }))}
        defaultPaymentTerms={settings?.default_payment_terms ?? 30}
      />
    </div>
  );
}
