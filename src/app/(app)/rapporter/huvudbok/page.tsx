import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ konto?: string }>;
}) {
  const { konto } = await searchParams;
  const supabase = await createClient();

  const { data: usedAccounts } = await supabase
    .from("account_balances")
    .select("account, account_name, balance")
    .order("account");

  const selected = konto ? parseInt(konto) : usedAccounts?.[0]?.account ?? null;

  const { data: entries } = selected
    ? await supabase
        .from("ledger_entries")
        .select("*")
        .eq("account", selected)
        .order("verification_date")
        .order("verification_label")
    : { data: [] };

  let running = 0;

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Huvudbok</h1>

      <div className="flex flex-wrap gap-1.5">
        {usedAccounts?.map((a) => (
          <Link
            key={a.account}
            href={`/rapporter/huvudbok?konto=${a.account}`}
            className={`px-2 py-1 rounded border text-sm font-mono ${
              a.account === selected ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            {a.account}
          </Link>
        ))}
        {!usedAccounts?.length && (
          <p className="text-sm text-muted-foreground">Inga transaktioner ännu.</p>
        )}
      </div>

      {selected && (
        <>
          <h2 className="font-medium">
            {selected} {usedAccounts?.find((a) => a.account === selected)?.account_name}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Ver.</TableHead>
                <TableHead className="w-28">Datum</TableHead>
                <TableHead>Beskrivning</TableHead>
                <TableHead className="text-right w-28">Debet</TableHead>
                <TableHead className="text-right w-28">Kredit</TableHead>
                <TableHead className="text-right w-32">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.map((e) => {
                running += Number(e.debit) - Number(e.credit);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono">
                      <Link href={`/verifikat/${e.verification_id}`} className="hover:underline">
                        {e.verification_label}
                      </Link>
                    </TableCell>
                    <TableCell>{e.verification_date}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(e.debit) > 0 ? fmt(Number(e.debit)) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(e.credit) > 0 ? fmt(Number(e.credit)) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(running)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
