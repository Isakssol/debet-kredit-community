"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * Demoläget: besökaren loggas in på demokontot bakom kulisserna — inget
 * lösenord, ingen registrering. Namn + företag sparas som intresseanmälan.
 * Aktivt ENDAST när instansen kör med DEMO_MODE=1 + demokontouppgifter i miljön.
 */
export async function enterDemo(input: unknown): Promise<{ error?: string }> {
  if (process.env.DEMO_MODE !== "1") return { error: "Demoläget är inte aktivt på den här instansen." };
  const email = process.env.DEMO_LOGIN_EMAIL;
  const password = process.env.DEMO_LOGIN_PASSWORD;
  if (!email || !password) return { error: "Demokontot är inte konfigurerat." };

  const parsed = z.object({
    name: z.string().min(1).max(100),
    company: z.string().min(1).max(120),
  }).safeParse(input);
  if (!parsed.success) return { error: "Fyll i namn och företagsnamn." };

  const supabase = await createClient();

  // Intresseanmälan — bästa försök, får aldrig stoppa demon
  try {
    await supabase.from("demo_signups").insert({
      name: parsed.data.name,
      company: parsed.data.company,
    });
  } catch { /* tabellen kan saknas — ignorera */ }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Kunde inte starta demon just nu — prova igen om en stund." };

  redirect("/");
}
