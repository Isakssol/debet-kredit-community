"use server";

import { createClient } from "@/lib/supabase/server";
import { REDACT_NAME_LIMIT } from "@/lib/redact-names";

/**
 * Namnen ur den egna installationens register — kunder och leverantörer — så
 * att buggrapporten kan maska dem innan den lämnar datorn.
 *
 * Licensutgåvan har samma funktion och läser dessutom personalregistret;
 * community-utgåvan har inget sådant. Det är hela skillnaden.
 *
 * Listan läses med ANVÄNDARENS EGEN session, går till webbläsaren, används för
 * maskering och skickas ALDRIG vidare — den är nyckeln, inte meddelandet.
 */
export async function getReportRedactionNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const per = Math.ceil(REDACT_NAME_LIMIT / 2);
  const [customers, suppliers] = await Promise.all([
    supabase.from("customers").select("name").limit(per),
    supabase.from("suppliers").select("name").limit(per),
  ]);

  const names: string[] = [];
  for (const result of [customers, suppliers]) {
    for (const row of result.data ?? []) {
      const name = (row as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) names.push(name);
    }
  }
  return names;
}
