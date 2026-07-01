import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function VerificationsPage() {
  const supabase = await createClient();
  const { data: verifications } = await supabase
    .from("verifications")
    .select(
      "id, number, verification_date, description, counterparty, source, corrects_id, corrected_by_id, verification_series(code), verification_rows(debit)"
    )
    .order("verification_date", { ascending: false })
    .order("number", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Verifikat</h1>
        <Button asChild>
          <Link href="/verifikat/ny">Ny verifikation</Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Nr</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead>Beskrivning</TableHead>
            <TableHead>Motpart</TableHead>
            <TableHead className="text-right">Belopp</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!verifications?.length && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Inga verifikat ännu.
              </TableCell>
            </TableRow>
          )}
          {verifications?.map((v) => {
            const total = (v.verification_rows as { debit: number }[])
              .reduce((s, r) => s + Number(r.debit), 0);
            return (
              <TableRow key={v.id}>
                <TableCell className="font-mono">
                  {(v.verification_series as unknown as { code: string })?.code}
                  {v.number}
                </TableCell>
                <TableCell>{v.verification_date}</TableCell>
                <TableCell>
                  <Link href={`/verifikat/${v.id}`} className="hover:underline">
                    {v.description}
                  </Link>{" "}
                  {v.corrected_by_id && <Badge variant="destructive">Rättad</Badge>}
                  {v.corrects_id && <Badge variant="secondary">Rättelse</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{v.counterparty}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {total.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/verifikat/${v.id}`}>Visa</Link>
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
