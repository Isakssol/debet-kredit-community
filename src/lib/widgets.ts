/**
 * Widgetregistret för översikten: alla tillgängliga nyckeltal användaren kan
 * visa. Värdena beräknas i dashboard-sidan (server) och renderas i
 * dashboard-widgets.tsx (klient) som formaterar och färgsätter.
 */

export const WIDGET_IDS = [
  "revenue_year",
  "revenue_month",
  "avg_order",
  "bank_cash",
  "result_year",
  "own_withdrawals",
  "vat_debt",
  "approval_queue",
  "unpaid_invoices",
  "costs_year",
  "gross_margin",
  "verifikat_count",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export const DEFAULT_WIDGETS: WidgetId[] = [
  "revenue_year", "revenue_month", "avg_order",
  "bank_cash", "result_year", "own_withdrawals",
];

/** Ett beräknat widgetvärde: belopp i öre ELLER färdig text */
export type WidgetMetric = {
  /** Belopp i öre — formateras som kr i klienten */
  ore?: number;
  /** Färdigformaterat värde (t.ex. "77,5 %" eller "3 st") */
  text?: string;
  sub: string;
  /** Länk vid klick */
  href?: string;
};

export type WidgetMetrics = Partial<Record<WidgetId, WidgetMetric>>;

export function sanitizeWidgetIds(input: unknown): WidgetId[] | null {
  if (!Array.isArray(input)) return null;
  const valid = input.filter((id): id is WidgetId => WIDGET_IDS.includes(id));
  return valid.length ? valid.slice(0, 12) : null;
}
