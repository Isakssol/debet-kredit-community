import { createClient } from "@/lib/supabase/server";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function BalanceReportPage() {
  const supabase = await createClient();
  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .eq("status", "open").order("year", { ascending: false }).limit(1).single();
  const { data: balances } = await supabase.from("account_balances").select("*")
    .eq("fiscal_year_id", fy?.id ?? "").lte("class", 2);
  const { data: resultRows } = await supabase.from("account_balances").select("balance")
    .eq("fiscal_year_id", fy?.id ?? "").gte("class", 3);

  const rows = (balances ?? []).sort((a, b) => a.account! - b.account!);
  const tillgangar = rows.filter((r) => r.class === 1);
  const ekSkulder = rows.filter((r) => r.class === 2);

  const sumT = tillgangar.reduce((s, r) => s + Number(r.balance), 0);
  const sumES = ekSkulder.reduce((s, r) => s + Number(r.balance), 0);
  // Beräknat resultat (ännu ej bokfört mot 2019) balanserar rapporten
  const beraknatResultat = -(resultRows ?? []).reduce((s, r) => s + Number(r.balance), 0);

  const section = (title: string, list: typeof rows, flip: boolean) => (
    <>
      <TableRow className="bg-muted/50 font-medium">
        <TableCell colSpan={3}>{title}</TableCell>
      </TableRow>
      {list.map((r) => (
        <TableRow key={r.account}>
          <TableCell className="font-mono">{r.account}</TableCell>
          <TableCell>
            <Link href={`/rapporter/huvudbok?konto=${r.account}`} className="hover:underline">
              {r.account_name}
            </Link>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {fmt(flip ? -Number(r.balance) : Number(r.balance))}
          </TableCell>
        </TableRow>
      ))}
    </>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Balansrapport</h1>
        <p className="text-sm text-muted-foreground">
          Räkenskapsår {fy?.year} · utgående balans per idag
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Konto</TableHead>
            <TableHead>Benämning</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section("Tillgångar", tillgangar, false)}
          <TableRow className="font-medium border-b-2">
            <TableCell colSpan={2}>Summa tillgångar</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(sumT)}</TableCell>
          </TableRow>
          {section("Eget kapital och skulder", ekSkulder, true)}
          <TableRow>
            <TableCell />
            <TableCell className="text-muted-foreground">Beräknat resultat</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(beraknatResultat)}</TableCell>
          </TableRow>
          <TableRow className="font-medium">
            <TableCell colSpan={2}>Summa eget kapital och skulder</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(-sumES + beraknatResultat)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {Math.abs(sumT - (-sumES + beraknatResultat)) > 0.005 && (
        <p className="text-sm text-destructive">
          ⚠ Balansen stämmer inte — kontrollera bokföringen.
        </p>
      )}
    </div>
  );
}
