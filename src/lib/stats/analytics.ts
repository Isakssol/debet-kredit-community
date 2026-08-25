/**
 * Delad analyslogik för Analys-vyn och stats-API:et.
 * All aggregering utgår från verification_rows + verifications.
 *
 * Regler:
 * - Belopp summeras över ALLA verifikat (dubbletter + rättelser tar ut varandra,
 *   summorna blir alltid identiska med huvudboken).
 * - Affärsräkning och tjänst-/kundfördelning använder endast verifikat som varken
 *   är rättelseverifikat (source=correction) eller själva blivit rättade
 *   (corrected_by_id satt) — annars räknas vändningspar dubbelt.
 */

export const AD_PARTIES = /google|meta|socialwick/i;
export const FILE_PARTIES = /koelewijn|ecufiles|vitali|olsx/i;

export function serviceCategory(text: string): string {
  const t = text.toLowerCase();
  if (/dongel|obd.?flasher|at.?one/.test(t)) return "OBD-dongel";
  if (/steg ?1|motoroptimering/.test(t)) {
    return /egr|dpf|adblue|cold ?start|tillval/.test(t) ? "Steg 1 + tillval" : "Steg 1";
  }
  if (/dpf/.test(t)) return "DPF OFF";
  if (/adblue|def removal/.test(t)) return "AdBlue OFF";
  if (/egr/.test(t)) return "EGR OFF";
  if (/cold ?start/.test(t)) return "Cold Start OFF";
  return "Övrigt";
}

export type AnalyticsRow = {
  account: number;
  debit: number;
  credit: number;
  note: string | null;
  verifications: {
    id: string;
    verification_date: string;
    description: string;
    counterparty: string | null;
    source: string;
    corrected_by_id: string | null;
  };
};

export function isCleanBusinessEvent(v: AnalyticsRow["verifications"]): boolean {
  return v.source !== "correction" && v.corrected_by_id === null;
}

const r2 = (n: number) => Math.round(n);

export function buildAnalytics(rows: AnalyticsRow[]) {
  const byMonth = new Map<string, { revenue: number; costs: number }>();
  const byService = new Map<string, { revenue: number; ids: Set<string> }>();
  const byCustomer = new Map<string, { revenue: number; ids: Set<string> }>();
  const costByParty = new Map<string, { total: number; byMonth: Map<string, number> }>();
  const balance = new Map<number, number>(); // konto -> debet−kredit
  let ads = 0, adsGoogle = 0, adsMeta = 0, files = 0, paymentFees = 0;
  const salesIds = new Set<string>();
  let refunded = 0;

  for (const r of rows) {
    const v = r.verifications;
    const a = r.account;
    const month = v.verification_date.slice(0, 7);
    const netD = Number(r.debit) - Number(r.credit);
    balance.set(a, (balance.get(a) ?? 0) + netD);

    if (a >= 3000 && a <= 3799) {
      const amt = -netD;
      const m = byMonth.get(month) ?? { revenue: 0, costs: 0 };
      m.revenue += amt; byMonth.set(month, m);
      if (isCleanBusinessEvent(v)) {
        if (amt > 0) salesIds.add(v.id); else refunded += -amt;
        const cat = serviceCategory(`${v.description} ${r.note ?? ""}`);
        const s = byService.get(cat) ?? { revenue: 0, ids: new Set() };
        s.revenue += amt; s.ids.add(v.id); byService.set(cat, s);
        const cust = v.counterparty ?? "(okänd kund)";
        const c = byCustomer.get(cust) ?? { revenue: 0, ids: new Set() };
        c.revenue += amt; c.ids.add(v.id); byCustomer.set(cust, c);
      }
    } else if (a >= 4000 && a <= 7999) {
      const m = byMonth.get(month) ?? { revenue: 0, costs: 0 };
      m.costs += netD; byMonth.set(month, m);
      // Betalavgifter (6570) grupperas under betalväxeln, inte affärens motpart
      const party = a === 6570 ? "PayPal/Zettle (avgifter)" : (v.counterparty ?? "(utan motpart)");
      const cp = costByParty.get(party) ?? { total: 0, byMonth: new Map() };
      cp.total += netD; cp.byMonth.set(month, (cp.byMonth.get(month) ?? 0) + netD);
      costByParty.set(party, cp);
      if (a === 6570) paymentFees += netD;
      if (AD_PARTIES.test(party)) {
        ads += netD;
        if (/google/i.test(party)) adsGoogle += netD;
        if (/meta/i.test(party)) adsMeta += netD;
      }
      if (FILE_PARTIES.test(party)) files += netD;
    }
  }

  const bal = (acc: number) => balance.get(acc) ?? 0;
  const revenueTotal = [...byMonth.values()].reduce((s, m) => s + m.revenue, 0);
  const costsTotal = [...byMonth.values()].reduce((s, m) => s + m.costs, 0);
  const salesCount = salesIds.size;
  const avgOrder = salesCount ? revenueTotal / salesCount : 0;
  const grossPerOrder = salesCount ? (revenueTotal - files - paymentFees) / salesCount : 0;
  const vatOut = -(bal(2611) + bal(2612) + bal(2621) + bal(2631) + bal(2614));
  const vatIn = bal(2640) + bal(2645);

  return {
    months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({
        month, revenue: r2(m.revenue), costs: r2(m.costs), result: r2(m.revenue - m.costs),
      })),
    by_service: [...byService.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([service, s]) => {
        // Snittorder på positiva affärer: återbetalningspar ska inte dra ner snittet
        const positive = [...s.ids].length;
        return {
          service, count: positive, revenue: r2(s.revenue),
          avg_order: positive ? r2(Math.max(s.revenue, 0) / positive) : 0,
          includes_refunds: s.revenue < 0 || undefined,
        };
      }),
    by_customer: [...byCustomer.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, c]) => ({ name, count: c.ids.size, revenue: r2(c.revenue) })),
    costs_by_counterparty: [...costByParty.entries()].sort((a, b) => b[1].total - a[1].total)
      .map(([name, c]) => ({
        name, total: r2(c.total),
        by_month: Object.fromEntries([...c.byMonth.entries()].sort().map(([m, v]) => [m, r2(v)])),
      })),
    totals: {
      revenue: r2(revenueTotal), costs: r2(costsTotal), result: r2(revenueTotal - costsTotal),
      sales_count: salesCount, refunded: r2(refunded), avg_order: r2(avgOrder),
    },
    variable_costs: {
      ads: r2(ads), ads_google: r2(adsGoogle), ads_meta: r2(adsMeta),
      files_and_software: r2(files), payment_fees: r2(paymentFees),
    },
    margins: {
      gross_per_order: r2(grossPerOrder),
      gross_pct: revenueTotal ? Math.round(((revenueTotal - files - paymentFees) / revenueTotal) * 100) : 0,
      cac_all_channels: salesCount ? r2(ads / salesCount) : 0,
      cac_google: salesCount ? r2(adsGoogle / salesCount) : 0,
      net_per_order_after_ads: salesCount ? r2((revenueTotal - files - paymentFees - ads) / salesCount) : 0,
    },
    liquidity: {
      paypal_balance: Math.round(bal(1940) * 100) / 100,
      google_ads_debt: Math.round(-bal(2890) * 100) / 100,
      vat_net_position: r2(vatOut - vatIn), // positiv = skuld till Skatteverket
      disposable_estimate: r2(bal(1940) + bal(2890) - Math.max(0, vatOut - vatIn)),
      owner_capital_in: r2(-bal(2018)),
      owner_withdrawals: r2(bal(2013) + bal(2011) + bal(2012)),
      fixed_assets: r2(bal(1220)),
    },
  };
}
