import { createClient } from "@/lib/supabase/server";
import { CustomerDialog } from "@/components/customer-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const VAT_TYPE_LABEL: Record<string, string> = {
  SE: "Sverige",
  EU_REVERSE: "EU (omvänd moms)",
  EXPORT: "Export (utanför EU)",
};

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers").select("*").eq("active", true).order("customer_no");

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kunder</h1>
        <CustomerDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Kundnr</TableHead>
            <TableHead>Namn</TableHead>
            <TableHead>E-post</TableHead>
            <TableHead>Momstyp</TableHead>
            <TableHead>Villkor</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!customers?.length && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Inga kunder ännu. Lägg till din första kund.
              </TableCell>
            </TableRow>
          )}
          {customers?.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono">{c.customer_no}</TableCell>
              <TableCell>
                {c.name}
                {c.org_number && (
                  <span className="block text-xs text-muted-foreground">{c.org_number}</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{c.email}</TableCell>
              <TableCell>
                <Badge variant={c.vat_type === "SE" ? "outline" : "secondary"}>
                  {VAT_TYPE_LABEL[c.vat_type]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {c.payment_terms ?? "standard"} dgr
              </TableCell>
              <TableCell>
                <CustomerDialog customer={c} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
