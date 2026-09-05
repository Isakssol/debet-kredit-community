/**
 * Regelvärden (rule_values) är datumstyrda: milersättning, referensränta och
 * schablonbelopp ändras vid årsskiften och gäller från ett visst datum. Slås de
 * upp med DAGENS datum får en efterhandsbokförd resa från förra året fel sats —
 * därför tar uppslaget alltid emot det datum affärshändelsen gäller.
 *
 * Raden som gäller är den med senaste valid_from som inte ligger efter datumet,
 * och vars valid_to (om satt) inte har passerat.
 */
export type RuleValueRow = {
  value: number | string;
  valid_from: string;
  valid_to?: string | null;
};

export function pickRuleValue(rows: RuleValueRow[] | null | undefined, onDate: string): number | null {
  let best: RuleValueRow | null = null;
  for (const r of rows ?? []) {
    if (r.valid_from > onDate) continue;
    if (r.valid_to && r.valid_to < onDate) continue;
    if (!best || r.valid_from > best.valid_from) best = r;
  }
  if (!best) return null;
  const n = Number(best.value);
  return Number.isFinite(n) ? n : null;
}
