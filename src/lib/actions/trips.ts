"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const tripSchema = z.object({
  trip_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from_location: z.string().min(1),
  to_location: z.string().min(1),
  purpose: z.string().min(1, "Syfte krävs (SKV-krav för körjournal)"),
  km: z.number().positive(),
});

export async function addTrip(input: unknown) {
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("trips").insert(parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/korjournal");
  return { ok: true };
}

export async function deleteTrip(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("trips").delete().eq("id", id).is("verification_id", null);
  if (error) return { error: error.message };
  revalidatePath("/korjournal");
  return { ok: true };
}

/** Bokför milersättning för alla obokade resor: D 5800 / K 2018 (skattefri, 25 kr/mil) */
export async function bookMileage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: trips }, { data: rule }] = await Promise.all([
    supabase.from("trips").select("*").is("verification_id", null).order("trip_date"),
    supabase.from("rule_values").select("value").eq("key", "milersattning")
      .lte("valid_from", today).or(`valid_to.gte.${today},valid_to.is.null`)
      .order("valid_from", { ascending: false }).limit(1).single(),
  ]);
  if (!trips?.length) return { error: "Inga obokade resor." };

  const rate = Number(rule?.value ?? 25);
  const totalKm = trips.reduce((s, t) => s + Number(t.km), 0);
  const mil = totalKm / 10;
  const amount = Math.round(mil * rate * 100) / 100;

  const { data: ver, error } = await supabase.rpc("book_verification", {
    p_series_code: "A",
    p_date: today,
    p_description: `Milersättning egen bil: ${mil.toFixed(1)} mil à ${rate} kr (${trips.length} resor)`,
    p_rows: [
      { account: 5800, debit: amount, credit: 0, note: "Skattefri milersättning enligt körjournal" },
      { account: 2018, debit: 0, credit: amount, note: "Egen insättning (ersättning till dig själv)" },
    ],
    p_source: "quick_event",
  });
  if (error) return { error: error.message };
  const verId = (Array.isArray(ver) ? ver[0] : ver)?.out_id;

  for (const t of trips) {
    await supabase.from("trips").update({ verification_id: verId }).eq("id", t.id);
  }
  revalidatePath("/korjournal");
  return { ok: true, amount, mil };
}
