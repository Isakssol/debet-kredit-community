"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LOGO_BUCKET, uploadLogo, validateLogo } from "@/lib/branding/logo";

/**
 * Företagets logotyp — det som står överst i menyn och på varje faktura.
 *
 * ANPASSNING. Licensutgåvan kräver rollen admin här. Den här utgåvan har ingen
 * rollhierarki — en installation, en inloggning — så kontrollen är att någon ÄR
 * inloggad, samma linje som byrånycklarna (src/lib/actions/byra-keys.ts).
 * Kontrollen görs ändå: en server action är en HTTP-endpoint och ska aldrig
 * anta att den nåtts via sidan.
 */

/** Demon delas av alla besökare — se src/lib/actions/demo.ts. */
const isDemo = () => process.env.DEMO_MODE === "1";

const DEMO_MESSAGE =
  "Logotypen är låst i demon — den syns i menyn för alla besökare samtidigt. " +
  "I din egen installation fungerar knappen.";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) {
    return { supabase: null, error: "Du måste vara inloggad för att ändra logotypen." };
  }
  return { supabase, error: null };
}

/**
 * Den gamla filen städas bort efter att den nya sparats, aldrig före: ett
 * avbrott mitt i får inte lämna sidomenyn utan bild.
 */
export async function saveLogo(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  if (isDemo()) return { error: DEMO_MESSAGE };
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Ingen fil vald." };
  const invalid = validateLogo(file);
  if (invalid) return { error: invalid };

  const { supabase, error: authErr } = await requireUser();
  if (!supabase) return { error: authErr! };

  const { data: before } = await supabase.from("settings")
    .select("logo_path").eq("id", 1).single();

  const up = await uploadLogo(supabase, file);
  if ("error" in up) return { error: up.error };

  const { error } = await supabase.from("settings")
    .update({ logo_path: up.path }).eq("id", 1);
  if (error) {
    // Sökvägen sparades inte — lämna ingen föräldralös fil i lagringen.
    await supabase.storage.from(LOGO_BUCKET).remove([up.path]);
    return { error: error.message };
  }

  if (before?.logo_path && before.logo_path !== up.path) {
    await supabase.storage.from(LOGO_BUCKET).remove([before.logo_path]);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Ta bort logotypen och gå tillbaka till standardutseendet. */
export async function removeLogo(): Promise<{ ok?: boolean; error?: string }> {
  if (isDemo()) return { error: DEMO_MESSAGE };
  const { supabase, error: authErr } = await requireUser();
  if (!supabase) return { error: authErr! };

  const { data: before } = await supabase.from("settings")
    .select("logo_path").eq("id", 1).single();
  if (!before?.logo_path) return { ok: true };

  const { error } = await supabase.from("settings")
    .update({ logo_path: null }).eq("id", 1);
  if (error) return { error: error.message };

  await supabase.storage.from(LOGO_BUCKET).remove([before.logo_path]);
  revalidatePath("/", "layout");
  return { ok: true };
}
