import { createClient } from "@/lib/supabase/server";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function ResultReportPage() {
  const supabase = await createClient();
  const { data: fy } = await supabase.from("fiscal_years").select("*")
    .eq("status", "open").order("year", { ascending: false }).limit(1).single();
  const { data: balances } = await supabase.from("account_balances").select("*")
    .eq("fiscal_year_id", fy?.id ?? "").gte("class", 3);

  const rows = (balances ?? []).sort((a, b) => a.account! - b.account!);
  // Resultaträkning: intäkter är kreditsaldon → visas positivt
  const intakter = rows.filter((r) => r.class === 3);
  const kostnader = rows.filter((r) => r.class! >= 4 && r.class! <= 7);
  const finansiellt = rows.filter((r) => r.class === 8 && r.account !== 8999);

  const sum = (list: typeof rows) => list.reduce((s, r) => s + Number(r.balance), 0);
  const resultat = -(sum(intakter) + sum(kostnader) + sum(finansiellt));

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
            {fmt(flip ? -Number(r.balance) : -Number(r.balance))}
          </TableCell>
        </TableRow>
      ))}
      <TableRow className="font-medium">
        <TableCell colSpan={2}>Summa {title.toLowerCase()}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(-sum(list))}</TableCell>
      </TableRow>
    </>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Resultatrapport</h1>
        <p className="text-sm text-muted-foreground">
          Räkenskapsår {fy?.year} · {fy?.start_date} – {fy?.end_date}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Konto</TableHead>
            <TableHead>Benämning</TableHead>
            <TableHead className="text-right">Belopp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section("Rörelsens intäkter", intakter, false)}
          {section("Rörelsens kostnader", kostnader, false)}
          {finansiellt.length > 0 && section("Finansiella poster", finansiellt, false)}
          <TableRow className="border-t-2 font-semibold text-base">
            <TableCell colSpan={2}>Beräknat resultat</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(resultat)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
