import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const query = q?.trim() ?? "";
  const like = `%${query}%`;
  const asNumber = parseFloat(query.replace(",", "."));

  const [verifications, invoices, customers, suppliers] = query
    ? await Promise.all([
        supabase.from("verifications")
          .select("id, number, verification_date, description, counterparty, verification_series(code)")
          .or(`description.ilike.${like},counterparty.ilike.${like}`)
          .order("verification_date", { ascending: false }).limit(25)
          .then((r) => r.data ?? []),
        supabase.from("invoices")
          .select("id, invoice_no, invoice_date, total_amount, status, customer_snapshot, customers(name)")
          .or(isNaN(asNumber)
            ? `ocr.ilike.${like}`
            : `total_amount.eq.${asNumber},invoice_no.eq.${Math.round(asNumber)},ocr.ilike.${like}`)
          .limit(25).then((r) => r.data ?? []),
        supabase.from("customers").select("id, customer_no, name, email")
          .ilike("name", like).limit(10).then((r) => r.data ?? []),
        supabase.from("suppliers").select("id, name")
          .ilike("name", like).limit(10).then((r) => r.data ?? []),
      ])
    : [[], [], [], []];

  // Beloppssökning i verifikatrader
  const amountRows = query && !isNaN(asNumber)
    ? (await supabase.from("ledger_entries").select("*")
        .or(`debit.eq.${asNumber},credit.eq.${asNumber}`)
        .limit(25)).data ?? []
    : [];

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Sök</h1>
      <form method="GET">
        <Input name="q" defaultValue={query} autoFocus
          placeholder="Sök beskrivning, motpart, kund, belopp, OCR…" />
      </form>

      {query && (
        <div className="space-y-5 text-sm">
          {(verifications as { id: string; number: number; verification_date: string; description: string; counterparty: string | null; verification_series: unknown }[]).length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Verifikat</h2>
              {(verifications as { id: string; number: number; verification_date: string; description: string; counterparty: string | null; verification_series: unknown }[]).map((v) => (
                <Link key={v.id} href={`/verifikat/${v.id}`}
                  className="flex justify-between py-1 border-b hover:bg-accent px-1">
                  <span>
                    <span className="font-mono text-muted-foreground mr-2">
                      {(v.verification_series as { code: string })?.code}{v.number}
                    </span>
                    {v.description}
                  </span>
                  <span className="text-muted-foreground">{v.verification_date}</span>
                </Link>
              ))}
            </section>
          )}

          {amountRows.length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Transaktioner på beloppet</h2>
              {amountRows.map((e) => (
                <Link key={e.id} href={`/verifikat/${e.verification_id}`}
                  className="flex justify-between py-1 border-b hover:bg-accent px-1">
                  <span>
                    <span className="font-mono text-muted-foreground mr-2">{e.verification_label}</span>
                    {e.account} · {e.description}
                  </span>
                  <span className="tabular-nums">
                    {Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit)} kr
                  </span>
                </Link>
              ))}
            </section>
          )}

          {invoices.length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Fakturor</h2>
              {invoices.map((i) => (
                <Link key={i.id} href={`/fakturor/${i.id}`}
                  className="flex justify-between py-1 border-b hover:bg-accent px-1">
                  <span>Faktura {i.invoice_no} — {(i.customer_snapshot as { name?: string })?.name ?? (i.customers as unknown as { name: string } | null)?.name}</span>
                  <span className="tabular-nums">{Number(i.total_amount).toLocaleString("sv-SE")} kr</span>
                </Link>
              ))}
            </section>
          )}

          {customers.length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Kunder</h2>
              {customers.map((c) => (
                <Link key={c.id} href="/kunder" className="block py-1 border-b hover:bg-accent px-1">
                  {c.customer_no} — {c.name} {c.email && <span className="text-muted-foreground">({c.email})</span>}
                </Link>
              ))}
            </section>
          )}

          {suppliers.length > 0 && (
            <section>
              <h2 className="font-medium mb-1">Leverantörer</h2>
              {suppliers.map((s) => (
                <Link key={s.id} href="/leverantorer" className="block py-1 border-b hover:bg-accent px-1">
                  {s.name}
                </Link>
              ))}
            </section>
          )}

          {!verifications.length && !invoices.length && !customers.length
            && !suppliers.length && !amountRows.length && (
            <p className="text-muted-foreground">Inga träffar på ”{query}”.</p>
          )}
        </div>
      )}
    </div>
  );
}
