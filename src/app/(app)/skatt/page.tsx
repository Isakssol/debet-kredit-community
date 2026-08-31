import { createClient } from "@/lib/supabase/server";
import { TaxSimulator } from "@/components/tax-simulator";

export default async function TaxPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: balances }, { data: rules }, { data: settings }, { data: fy }] =
    await Promise.all([
      supabase.from("account_balances").select("*"),
      supabase.from("rule_values").select("key, value")
        .lte("valid_from", today).or(`valid_to.gte.${today},valid_to.is.null`),
      supabase.from("settings").select("municipal_tax_rate, company_type").eq("id", 1).single(),
      supabase.from("fiscal_years").select("year").eq("status", "open")
        .order("year", { ascending: false }).limit(1).single(),
    ]);

  const bal = balances ?? [];
  const resultat = bal.filter((b) => b.class! >= 3)
    .reduce((s, b) => s - Number(b.balance), 0);
  const ejAvdragsgilla = bal
    .filter((b) => [6072, 6982, 6992, 8423].includes(b.account!))
    .reduce((s, b) => s + Number(b.balance), 0);
  const fSkattBetald = bal.filter((b) => b.account === 2012)
    .reduce((s, b) => s + Number(b.balance), 0);

  const r = Object.fromEntries((rules ?? []).map((x) => [x.key, Number(x.value)]));

  if (settings && (settings as { company_type?: string }).company_type !== "enskild_firma"
      && (settings as { company_type?: string }).company_type !== undefined) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Skatt &amp; eget uttag</h1>
        <p className="text-sm text-muted-foreground">
          Skattesimulatorn beräknar egenavgifter och inkomstskatt för enskild firma
          och gäller därför inte din bolagstyp. I aktiebolag tas ersättning ut som
          lön eller utdelning, i handelsbolag beskattas delägarna för sina
          resultatandelar — rådgör med din redovisningskonsult.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Skatt & eget uttag</h1>
        <p className="text-sm text-muted-foreground">
          Simulera årets skatt och egenavgifter, planera periodiseringsfond och räntefördelning,
          och stäm av mot din debiterade F-skatt. Förenklad beräkning — grundavdrag och
          jobbskatteavdrag ingår inte.
        </p>
      </div>
      <TaxSimulator
        year={fy?.year ?? 2026}
        bookedResult={Math.round(resultat)}
        nonDeductible={Math.round(ejAvdragsgilla)}
        fSkattPaid={Math.round(fSkattBetald)}
        rules={{
          egenavgifterFull: r["egenavgifter_full"] ?? 28.97,
          nedsattningPct: r["egenavgifter_nedsattning_pct"] ?? 7.5,
          nedsattningMax: r["egenavgifter_nedsattning_max"] ?? 15000,
          nedsattningKrav: r["egenavgifter_nedsattning_krav"] ?? 40000,
          schablonavdrag: r["schablonavdrag_egenavgifter"] ?? 25,
          periodiseringsfondPct: r["periodiseringsfond_pct"] ?? 30,
          skiktgransStatlig: r["skiktgrans_statlig"] ?? 660400,
          statligSkattPct: r["statlig_skatt_pct"] ?? 20,
          kommunalskattPct: Number(settings?.municipal_tax_rate ?? 32),
        }}
        rantefordelningRate={r["rantefordelning_positiv"] ?? 8.55}
        rantefordelningGrans={r["rantefordelning_grans"] ?? 50000}
      />
    </div>
  );
}
