/**
 * GET /api/stats/overview
 * Komplett ekonomisk lägesbild för adminportalen: månadsresultat, tjänste-/kund-
 * fördelning, kostnader per leverantör, rörliga kostnader, marginaler/CAC,
 * likviditet och underlagsstatus. Alla belopp i SEK exkl moms, heltal
 * (öresavrundade) utom likviditetssaldon som har ören för exakt avstämning.
 * Auth: Authorization: Bearer <STATS_API_KEY>.
 */
import { NextResponse, type NextRequest } from "next/server";
import { checkAuth, serviceClient, ANALYTICS_SELECT, noStore } from "../_shared";
import { buildAnalytics, type AnalyticsRow } from "@/lib/stats/analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = checkAuth(request);
  if (unauthorized) return unauthorized;

  const supabase = serviceClient();
  const [{ data: rows, error }, { data: vers, error: verErr }] = await Promise.all([
    supabase.from("verification_rows").select(ANALYTICS_SELECT)
      .gte("account", 1000).lte("account", 8999).limit(5000),
    supabase.from("verifications").select("id, attachments(id)").neq("source", "correction"),
  ]);
  if (error || verErr) {
    return NextResponse.json({ error: "db_error", detail: (error ?? verErr)?.message }, { status: 500 });
  }

  const analytics = buildAnalytics((rows ?? []) as unknown as AnalyticsRow[]);
  const attachments_missing = (vers ?? [])
    .filter((v) => (v.attachments as { id: string }[]).length === 0).length;

  return NextResponse.json(
    { generated_at: new Date().toISOString(), ...analytics, attachments_missing },
    noStore
  );
}
