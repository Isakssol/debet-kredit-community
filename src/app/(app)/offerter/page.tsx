import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2 });

const STATUS_BADGE: Record<string, { label: string; variant: "outline" | "secondary" | "destructive"; cls?: string }> = {
  draft: { label: "Utkast", variant: "secondary" },
  sent: { label: "Skickad", variant: "outline" },
  accepted: { label: "Order", variant: "outline", cls: "text-emerald-600 border-emerald-300" },
  declined: { label: "Nekad", variant: "destructive" },
  expired: { label: "Utgången", variant: "secondary" },
  invoiced: { label: "Fakturerad", variant: "outline", cls: "text-primary border-primary/40" },
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ visa?: string }>;
}) {
  const { visa } = await searchParams;
  const tab = visa === "order" ? "order" : "offert";
  const supabase = await createClient();
  const { data: quotes } = await supabase.from("quotes")
    .select("id, quote_no, order_no, status, quote_date, valid_until, total_amount, customers(name)")
    .order("quote_no", { ascending: false }).limit(200);

  const all = quotes ?? [];
  const offers = all.filter((q) => ["draft", "sent", "declined", "expired"].includes(q.status));
  const orders = all.filter((q) => ["accepted", "invoiced"].includes(q.status));
  const rows = tab === "order" ? orders : offers;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Offert &amp; Order</h1>
          <p className="text-sm text-muted-foreground">
            Offert → order → faktura, hela kedjan. Accepterade offerter blir ordrar
            med eget ordernummer och faktureras med ett klick.
          </p>
        </div>
        <Button asChild><Link href="/offerter/ny">Ny offert</Link></Button>
      </div>

      <div className="flex gap-1.5">
        <Button asChild size="sm" variant={tab === "offert" ? "default" : "outline"} className="rounded-full">
          <Link href="/offerter">Offerter ({offers.length})</Link>
        </Button>
        <Button asChild size="sm" variant={tab === "order" ? "default" : "outline"} className="rounded-full">
          <Link href="/offerter?visa=order">Ordrar ({orders.length})</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {tab === "order"
            ? "Inga ordrar ännu — acceptera en offert så hamnar den här."
            : "Inga offerter ännu. Skapa din första!"}
        </CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">{tab === "order" ? "Ordernr" : "Offertnr"}</TableHead>
              <TableHead>Kund</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>{tab === "order" ? "Accepterad" : "Giltig till"}</TableHead>
              <TableHead className="text-right">Belopp</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((q) => {
              const badge = STATUS_BADGE[q.status];
              const expiringSoon = q.status === "sent" && q.valid_until <= today;
              return (
                <TableRow key={q.id}>
                  <TableCell className="font-mono">
                    <Link href={`/offerter/${q.id}`} className="hover:underline">
                      {tab === "order" && q.order_no ? `O${q.order_no}` : `#${q.quote_no}`}
                    </Link>
                  </TableCell>
                  <TableCell>{(q.customers as unknown as { name: string })?.name}</TableCell>
                  <TableCell>{q.quote_date}</TableCell>
                  <TableCell className={expiringSoon ? "text-destructive" : ""}>{q.valid_until}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(Number(q.total_amount))} kr</TableCell>
                  <TableCell>
                    <Badge variant={badge.variant} className={badge.cls}>{badge.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
