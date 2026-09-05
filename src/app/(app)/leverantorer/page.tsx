import { createClient } from "@/lib/supabase/server";
import { SupplierDialog } from "@/components/supplier-dialog";
import { SupplierInvoiceDialog } from "@/components/supplier-invoice-dialog";
import { SupplierPayDialog } from "@/components/supplier-pay-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { todayISO } from "@/lib/dates";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS: Record<string, string> = {
  unpaid: "Obetald", partially_paid: "Delbetald", paid: "Betald", credited: "Krediterad",
};

export default async function SuppliersPage() {
  const supabase = await createClient();
  const [{ data: suppliers }, { data: invoices }, { data: expenseAccounts }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("active", true).order("name"),
    supabase.from("supplier_invoices")
      .select("*, suppliers(name), supplier_payments(amount)")
      .order("due_date", { ascending: true }),
    supabase.from("accounts").select("number, name, default_vat_rate")
      .gte("number", 4000).lte("number", 8499).eq("active", true).eq("blocked", false)
      .order("number"),
  ]);

  const today = todayISO();
  const openInvoices = (invoices ?? []).filter((i) => i.status !== "paid");
  const openTotal = openInvoices.reduce((s, i) => {
    const paid = ((i.supplier_payments ?? []) as { amount: number }[])
      .reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(i.total_amount) - paid;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leverantörer</h1>
        <div className="flex gap-2">
          <SupplierDialog expenseAccounts={expenseAccounts ?? []} />
          <SupplierInvoiceDialog
            suppliers={(suppliers ?? []).map((s) => ({
              id: s.id, name: s.name, paymentTerms: s.payment_terms,
              defaultExpenseAccount: s.default_expense_account,
            }))}
            expenseAccounts={expenseAccounts ?? []}
          />
        </div>
      </div>

      <Card className="max-w-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Att betala ({openInvoices.length} fakturor)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xl font-semibold">{fmt(openTotal)} kr</CardContent>
      </Card>

      <div>
        <h2 className="font-medium mb-2">Leverantörsreskontra</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Leverantör</TableHead>
              <TableHead>Fakturanr</TableHead>
              <TableHead>Fakturadatum</TableHead>
              <TableHead>Förfaller</TableHead>
              <TableHead className="text-right">Belopp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!invoices?.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Inga leverantörsfakturor registrerade.
                </TableCell>
              </TableRow>
            )}
            {invoices?.map((inv) => {
              const paid = ((inv.supplier_payments ?? []) as { amount: number }[])
                .reduce((s, p) => s + Number(p.amount), 0);
              const remaining = Number(inv.total_amount) - paid;
              const isOverdue = inv.status !== "paid" && inv.due_date < today;
              return (
                <TableRow key={inv.id}>
                  <TableCell>
                    {inv.suppliers?.name}
                    <span className="block text-xs text-muted-foreground">{inv.notes}</span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{inv.invoice_no}</TableCell>
                  <TableCell>{inv.invoice_date}</TableCell>
                  <TableCell className={isOverdue ? "text-destructive font-medium" : ""}>
                    {inv.due_date}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(Number(inv.total_amount))} kr
                  </TableCell>
                  <TableCell>
                    <Badge variant={isOverdue ? "destructive" : inv.status === "paid" ? "default" : "outline"}>
                      {isOverdue ? "Förfallen" : STATUS[inv.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex gap-1 items-center">
                    {inv.status !== "paid" && (
                      <SupplierPayDialog supplierInvoiceId={inv.id} remaining={remaining} />
                    )}
                    {inv.verification_id && (
                      <Link href={`/verifikat/${inv.verification_id}`}
                        className="text-xs text-muted-foreground hover:underline">
                        Verifikat
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
