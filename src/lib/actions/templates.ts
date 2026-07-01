"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TemplateRow = { account: number; side: "debit" | "credit"; share: number };

/** Spara kontering som mall — raderna lagras som andelar av totalbeloppet */
export async function savePostingTemplate(input: {
  name: string;
  rows: { account: number; debit: number; credit: number }[];
}) {
  if (!input.name.trim()) return { error: "Mallen behöver ett namn." };
  const totalDebit = input.rows.reduce((s, r) => s + r.debit, 0);
  if (totalDebit <= 0) return { error: "Raderna måste ha belopp." };

  const templateRows: TemplateRow[] = input.rows
    .filter((r) => r.debit > 0 || r.credit > 0)
    .map((r) => ({
      account: r.account,
      side: r.debit > 0 ? "debit" : "credit",
      share: Math.round(((r.debit || r.credit) / totalDebit) * 10000) / 10000,
    }));

  const supabase = await createClient();
  const { error } = await supabase.from("posting_templates").upsert(
    { name: input.name.trim(), rows: templateRows },
    { onConflict: "name" }
  );
  if (error) return { error: error.message };
  revalidatePath("/verifikat/ny");
  return { ok: true };
}

export async function deletePostingTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("posting_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/verifikat/ny");
  return { ok: true };
}
