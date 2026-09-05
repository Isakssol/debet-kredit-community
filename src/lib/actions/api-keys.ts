"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/service";
import { generateApiKey } from "@/lib/api/keys";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";

/**
 * API-nycklar — utfärda och återkalla.
 *
 * Motsvarigheten till `byra-keys.ts`, och medvetet byggd likadant: nyckeln
 * utfärdas HÄR, i installationens eget gränssnitt, av installationens egen
 * ägare. Ingen miljövariabel, ingen terminal, ingen redeploy — det är hela
 * skillnaden mot STATS_API_KEY.
 *
 * Två lager, som överallt annars i produkten:
 *  * RLS avgör. Raderna skrivs med användarens egen klient, så policyn på
 *    api_keys är det som faktiskt gäller — inte en kontroll i den här filen.
 *  * Service-nyckeln används till exakt en sak: att skapa maskinkontot i
 *    auth.users, vilket inte går utan admin-API:t.
 *
 * ANPASSNING. Licensutgåvan kräver rollen admin här. Den här utgåvan har
 * ingen rollhierarki — en installation, en inloggning — så kontrollen är att
 * någon ÄR inloggad. Kontrollen görs ändå: en server action är en
 * HTTP-endpoint och ska aldrig anta att den nåtts via sidan.
 */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    return { supabase: null, userId: null, error: "Du måste vara inloggad för att hantera API-nycklar." };
  }
  return { supabase, userId: data.user.id, error: null };
}

/** Demon delas av alla besökare — se src/lib/actions/demo.ts. */
const isDemo = () => process.env.DEMO_MODE === "1";

const issueSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ge integrationen ett namn.")
    .max(120, "Namnet får vara högst 120 tecken."),
  /**
   * Vokabulären prövas mot samma lista som databasens check-villkor. Ett
   * okänt ord ska avvisas här med ett begripligt besked i stället för att
   * slå i ett constraint-fel längre ned.
   */
  scopes: z
    .array(z.enum(API_SCOPES))
    .min(1, "Välj minst en behörighet.")
    .max(API_SCOPES.length),
  note: z.string().trim().max(500, "Anteckningen får vara högst 500 tecken.").optional(),
});

/**
 * Skapar en API-nyckel. Nyckeln returneras EN gång och lagras aldrig — bara
 * dess SHA-256 och de fjorton första tecknen hamnar i databasen. Tappas den
 * bort återkallas raden och en ny utfärdas; det finns ingen väg tillbaka till
 * strängen, och det är avsiktligt.
 */
export async function issueApiKey(input: unknown): Promise<{
  ok?: boolean;
  error?: string;
  key?: string;
}> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { supabase, userId, error: authErr } = await requireUser();
  if (!supabase) return { error: authErr! };

  // Demon delas av alla besökare. En nyckel som utfärdas där är en långlivad
  // åtkomst till någon annans skyltfönster — och med skrivbehörighet dessutom
  // en väg att bokföra i det.
  if (isDemo()) {
    return { error: "API-nycklar kan inte skapas i demon. I din egen installation fungerar knappen." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "SUPABASE_SERVICE_ROLE_KEY saknas i miljön — lägg till den i din hosting "
        + "(Vercel → Environment Variables) för att kunna skapa API-nycklar. "
        + "Se docs/INSTALLATION.md.",
    };
  }

  const nyckel = generateApiKey();

  /**
   * Maskinkontot. Adressen är avsiktligt oanvändbar: `.invalid` är reserverat
   * (RFC 2606) och kan aldrig ta emot post, så kontot går inte att kapa via
   * "glömt lösenord". Inget lösenord sätts heller — den enda vägen in är att
   * visa upp nyckeln i ett Authorization-huvud.
   *
   * Adressen är slumpad och innehåller ingenting ur nyckeln. Prefixet ligger
   * redan i klartext i tabellen, så det hade inte läckt något nytt — men en
   * adress som härleds ur nyckelmaterial är ett mönster som blir fel så fort
   * någon kortar av rutinen.
   */
  const email = `api-${randomUUID()}@api.invalid`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { api_machine_account: true, integration_name: parsed.data.name },
  });
  if (userErr || !created?.user) {
    return { error: `Maskinkontot kunde inte skapas: ${userErr?.message ?? "okänt fel"}` };
  }

  // Raden skrivs med din egen klient: RLS är det som avgör, inte den här
  // funktionen.
  const { error: rowErr } = await supabase.from("api_keys").insert({
    name: parsed.data.name,
    key_hash: nyckel.hash,
    key_prefix: nyckel.prefix,
    scopes: parsed.data.scopes,
    auth_user_id: created.user.id,
    created_by: userId,
    note: parsed.data.note || null,
  });
  if (rowErr) {
    // Ingen rad, inget konto. Ett maskinkonto utan nyckelrad är en inloggning
    // ingen äger — och i den här utgåvan är det värre än så: spärrarna i
    // 20260908000005 känner igen maskinkontot PÅ nyckelraden, så ett konto
    // utan rad hade fallit tillbaka på "authenticated full access".
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: rowErr.message };
  }

  revalidatePath("/installningar");
  return { ok: true, key: nyckel.key };
}

/**
 * Återkallar. `revoked_at` läses av api_has_scope() vid varje fråga, så
 * åtkomsten upphör i samma sekund — även för en session som redan är mintad
 * och ännu inte gått ut. Du ska inte behöva vänta ut någons timeout.
 *
 * Vägen tillbaka finns inte med flit: en återkallad nyckel återupplivas inte,
 * en ny utfärdas. Maskinkontot lämnas kvar så att historiken består — vem som
 * hade åtkomst, när den senast användes och varifrån är ditt kvitto. Kontot
 * är ofarligt: spärrarna gäller ett maskinkonto oavsett om nyckeln lever.
 */
export async function revokeApiKey(id: string): Promise<{ ok?: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) return { error: "Ogiltigt id." };

  const { supabase, userId, error: authErr } = await requireUser();
  if (!supabase) return { error: authErr! };

  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Nyckeln finns inte eller är redan återkallad." };

  revalidatePath("/installningar");
  return { ok: true };
}

/** En rad som listan under Inställningar visar. `key_hash` hämtas aldrig hit. */
export type ApiKeyListRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiScope[];
  rate_limit_per_hour: number;
  created_at: string;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
  note: string | null;
};
