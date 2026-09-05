import { createClient } from "@/lib/supabase/server";
import { NewVerificationForm } from "@/components/new-verification-form";
import { todayISO } from "@/lib/dates";

export default async function NewVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ underlag?: string }>;
}) {
  const { underlag } = await searchParams;
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: accounts }, { data: series }, { data: rules }, { data: templates }] = await Promise.all([
    supabase.from("accounts").select("number, name, default_vat_rate, blocked, description")
      .eq("active", true).order("number"),
    supabase.from("verification_series")
      .select("code, name, fiscal_years!inner(year, status)")
      .eq("manual_entry", true)
      .eq("fiscal_years.status", "open"),
    supabase.from("rule_values").select("key, value")
      .lte("valid_from", today)
      .or(`valid_to.gte.${today},valid_to.is.null`),
    supabase.from("posting_templates").select("id, name, rows").order("name"),
  ]);

  const ruleMap = Object.fromEntries((rules ?? []).map((r) => [r.key, Number(r.value)]));

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Ny verifikation</h1>
      <NewVerificationForm
        accounts={(accounts ?? []).map((a) => ({
          number: a.number,
          name: a.name,
          vatRate: a.default_vat_rate ? Number(a.default_vat_rate) : null,
          blocked: a.blocked,
        }))}
        seriesCodes={(series ?? []).map((s) => s.code)}
        rules={ruleMap}
        inboxAttachmentId={underlag ?? null}
        templates={(templates ?? []).map((t) => ({
          id: t.id, name: t.name,
          rows: t.rows as { account: number; side: "debit" | "credit"; share: number }[],
        }))}
      />
    </div>
  );
}
