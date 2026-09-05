import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { todayISO } from "@/lib/dates";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Utkast", variant: "secondary" },
  booked: { label: "Bokförd", variant: "outline" },
  sent: { label: "Skickad", variant: "outline" },
  partially_paid: { label: "Delbetald", variant: "default" },
  paid: { label: "Betald", variant: "default" },
  credited: { label: "Krediterad", variant: "destructive" },
  cancelled: { label: "Makulerad", variant: "destructive" },
};

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, customers(name), invoice_payments(amount)")
    .order("created_at", { ascending: false });

  const today = todayISO();
  const open = (invoices ?? []).filter((i) =>
    ["booked", "sent", "partially_paid"].includes(i.status) && i.type === "debit");
  const openTotal = open.reduce((s, i) => {
    const paid = ((i.invoice_payments ?? []) as { amount: number }[]).reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(i.total_amount) - paid;
  }, 0);
  const overdue = open.filter((i) => i.due_date < today);
  const overdueTotal = overdue.reduce((s, i) => {
    const paid = ((i.invoice_payments ?? []) as { amount: number }[]).reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(i.total_amount) - paid;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Fakturor</h1>
        <Button asChild><Link href="/fakturor/ny">Ny faktura</Link></Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Obetalt ({open.length} fakturor)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(openTotal)} kr</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Förfallet ({overdue.length} fakturor)
            </CardTitle>
          </CardHeader>
          <CardContent className={`text-xl font-semibold ${overdueTotal > 0 ? "text-destructive" : ""}`}>
            {fmt(overdueTotal)} kr
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Nr</TableHead>
            <TableHead>Kund</TableHead>
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
                Inga fakturor ännu.
              </TableCell>
            </TableRow>
          )}
          {invoices?.map((inv) => {
            const isOverdue = ["booked", "sent", "partially_paid"].includes(inv.status)
              && inv.due_date < today && inv.type === "debit";
            const st = STATUS[inv.status] ?? { label: inv.status, variant: "outline" as const };
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-mono">
                  {inv.type === "credit" ? "K" : ""}{inv.invoice_no ?? "—"}
                </TableCell>
                <TableCell>
                  <Link href={`/fakturor/${inv.id}`} className="hover:underline">
                    {(inv.customer_snapshot as { name?: string })?.name ?? inv.customers?.name}
                  </Link>
                </TableCell>
                <TableCell>{inv.invoice_date}</TableCell>
                <TableCell className={isOverdue ? "text-destructive font-medium" : ""}>
                  {inv.type === "debit" ? inv.due_date : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(Number(inv.total_amount))} kr
                </TableCell>
                <TableCell>
                  <Badge variant={isOverdue ? "destructive" : st.variant}>
                    {isOverdue ? "Förfallen" : st.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/fakturor/${inv.id}`}>Visa</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
