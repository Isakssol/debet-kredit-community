import { createClient } from "@/lib/supabase/server";
import { enableBankingConfigured } from "@/lib/bank/enable-banking";
import { suggestMatch, type OpenInvoice, type OpenSupplierInvoice, type BookedCandidate } from "@/lib/bank/matching";
import { BankConnect, BankCsvUpload, BankTxRow } from "@/components/bank-components";
import { BankRules } from "@/components/bank-rules";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; visa?: string }>;
}) {
  const { code, visa } = await searchParams;
  const supabase = await createClient();

  const [
    { data: connections }, { data: transactions }, { data: invoices },
    { data: supplierInvoices }, { data: bankLedger }, { data: bankRules }, { data: ruleAccounts },
  ] = await Promise.all([
    supabase.from("bank_connections").select("*").order("created_at", { ascending: false }),
    supabase.from("bank_transactions").select("*")
      .order("booking_date", { ascending: false }).limit(300),
    supabase.from("invoices")
      .select("id, invoice_no, ocr, customer_snapshot, customers(name), total_amount, invoice_payments(amount)")
      .in("status", ["booked", "sent", "partially_paid"]).eq("type", "debit"),
    supabase.from("supplier_invoices")
      .select("id, invoice_no, ocr, suppliers(name), total_amount, supplier_payments(amount)")
      .neq("status", "paid"),
    supabase.from("ledger_entries").select("*").gte("account", 1910).lte("account", 1949),
    supabase.from("bank_rules").select("*").order("created_at"),
    supabase.from("accounts").select("number, name")
      .eq("active", true).eq("blocked", false).gte("number", 3000).order("number"),
  ]);

  const openInvoices: OpenInvoice[] = (invoices ?? []).map((i) => {
    const paid = ((i.invoice_payments ?? []) as { amount: number }[])
      .reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: i.id,
      invoiceNo: i.invoice_no,
      ocr: i.ocr,
      customerName: (i.customer_snapshot as { name?: string })?.name
        ?? (i.customers as unknown as { name: string } | null)?.name ?? "",
      remaining: Number(i.total_amount) - paid,
    };
  });

  const openSupplier: OpenSupplierInvoice[] = (supplierInvoices ?? []).map((i) => {
    const paid = ((i.supplier_payments ?? []) as { amount: number }[])
      .reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: i.id,
      invoiceNo: i.invoice_no,
      ocr: i.ocr,
      supplierName: (i.suppliers as unknown as { name: string } | null)?.name ?? "",
      remaining: Number(i.total_amount) - paid,
    };
  });

  // Bokförda bankrörelser per verifikat (för avprickning)
  const byVer = new Map<string, BookedCandidate>();
  for (const e of bankLedger ?? []) {
    const key = e.verification_id!;
    const existing = byVer.get(key);
    const amount = Number(e.debit) - Number(e.credit);
    if (existing) existing.amount += amount;
    else byVer.set(key, {
      verificationId: key,
      label: e.verification_label ?? "",
      date: e.verification_date!,
      amount,
      description: e.description ?? "",
    });
  }
  // Verifikat som redan är avprickade mot en banktransaktion ska inte föreslås igen
  const alreadyMatched = new Set(
    (transactions ?? []).filter((t) => t.verification_id).map((t) => t.verification_id));
  const bookedCandidates = [...byVer.values()]
    .filter((b) => !alreadyMatched.has(b.verificationId));

  const unmatched = (transactions ?? []).filter((t) => t.status === "unmatched");
  const handled = (transactions ?? []).filter((t) => t.status !== "unmatched").slice(0, 30);

  const rows = unmatched.map((t) => ({
    tx: {
      id: t.id,
      bookingDate: t.booking_date,
      amount: Number(t.amount),
      description: t.description,
    },
    suggestion: suggestMatch(
      { amount: Number(t.amount), description: t.description, bookingDate: t.booking_date },
      openInvoices, openSupplier, bookedCandidates
    ),
  }));

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bank</h1>
        <p className="text-sm text-muted-foreground">
          Hämta kontohändelser via bankkoppling (PSD2) eller CSV från internetbanken —
          systemet matchar mot fakturor och föreslår bokföring.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BankConnect
          configured={enableBankingConfigured()}
          callbackCode={code ?? null}
          connections={(connections ?? []).map((c) => ({
            id: c.id,
            institutionName: c.institution_name ?? "Bank",
            status: c.status,
            iban: c.account_iban,
            lastSynced: c.last_synced_at,
            consentExpires: c.consent_expires_at,
          }))}
        />
        <BankCsvUpload />
      </div>

      <BankRules
        rules={(bankRules ?? []) as never}
        accounts={(ruleAccounts ?? []).map((a) => ({ number: a.number, name: a.name }))}
      />

      <div className="flex items-center justify-between">
        <h2 className="font-medium">
          Att hantera{" "}
          {unmatched.length > 0 && <Badge variant="destructive">{unmatched.length}</Badge>}
        </h2>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Inga ohanterade bankhändelser. Importera CSV eller synka bankkopplingen.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(({ tx, suggestion }) => (
            <BankTxRow key={tx.id} tx={tx} suggestion={suggestion}
              openInvoices={openInvoices} openSupplierInvoices={openSupplier} />
          ))}
        </div>
      )}

      {(handled.length > 0 || visa === "alla") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hanterade</CardTitle>
            <CardDescription>Senaste bokförda/avprickade bankhändelser.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm divide-y">
              {handled.map((t) => (
                <li key={t.id} className="py-1.5 flex justify-between gap-3">
                  <span className="truncate">
                    {t.booking_date} · {t.description}
                  </span>
                  <span className="flex gap-2 items-center shrink-0">
                    <span className="tabular-nums">{fmt(Number(t.amount))} kr</span>
                    <Badge variant="outline">
                      {t.status === "booked" ? "Bokförd" : t.status === "matched" ? "Avprickad" : "Ignorerad"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
