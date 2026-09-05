/**
 * GET /api/stats/monthly
 * Resultatserie per månad: intäkter, kostnader, resultat (SEK exkl moms, heltal).
 * Auth: Authorization: Bearer <API-nyckel med data:read> eller <STATS_API_KEY>.
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkStatsAuth, serviceClient, ANALYTICS_SELECT, noStore } from "../_shared";
import { buildAnalytics, type AnalyticsRow } from "@/lib/stats/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = await checkStatsAuth(request);
  if (unauthorized) return unauthorized;

  const supabase = serviceClient();
  const { data: rows, error } = await supabase
    .from("verification_rows").select(ANALYTICS_SELECT)
    .gte("account", 3000).lte("account", 7999).limit(5000);
  if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });

  const { months, totals } = buildAnalytics((rows ?? []) as unknown as AnalyticsRow[]);
  return NextResponse.json({ generated_at: new Date().toISOString(), months, totals }, noStore);
}
