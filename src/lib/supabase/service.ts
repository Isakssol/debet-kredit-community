import { createClient } from "@supabase/supabase-js";

/**
 * Service-klienten — går förbi RLS och används därför på så få ställen som
 * möjligt.
 *
 * Skillnaden mot `serviceClient()` i `src/app/api/stats/_shared.ts` är att den
 * här returnerar `null` när nyckeln saknas i stället för att bygga en klient
 * med `undefined!` och krascha vid första anropet. Byrånycklarna kräver
 * admin-API:t för att skapa maskinkontot i auth.users, och en installation
 * utan SUPABASE_SERVICE_ROLE_KEY ska få veta just det — inte ett stackspår.
 *
 * Anropare ska behandla null som "funktionen är inte tillgänglig i den här
 * installationen" och säga det på svenska till användaren.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
