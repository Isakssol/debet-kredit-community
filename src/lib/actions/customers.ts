"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const customerSchema = z.object({
  name: z.string().min(1, "Namn krävs"),
  org_number: z.string().optional(),
  vat_number: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default("SE"),
  payment_terms: z.number().int().min(0).max(90).nullable().optional(),
  vat_type: z.enum(["SE", "EU_REVERSE", "EXPORT"]).default("SE"),
  your_reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveCustomer(id: string | null, input: unknown) {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.vat_type === "EU_REVERSE" && !parsed.data.vat_number) {
    return { error: "EU-kund med omvänd skattskyldighet kräver VAT-nummer." };
  }
  const supabase = await createClient();
  const values = { ...parsed.data, email: parsed.data.email || null };
  const { error } = id
    ? await supabase.from("customers").update(values).eq("id", id)
    : await supabase.from("customers").insert(values);
  if (error) return { error: error.message };
  revalidatePath("/kunder");
  return { ok: true };
}

export async function deactivateCustomer(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ active: false }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/kunder");
  return { ok: true };
}

const articleSchema = z.object({
  article_no: z.string().min(1, "Artikelnummer krävs"),
  name: z.string().min(1, "Benämning krävs"),
  unit: z.string().default("st"),
  price: z.number().min(0),
  vat_rate: z.number(),
  type: z.enum(["service", "goods"]).default("service"),
  sales_account: z.number().int(),
});

export async function saveArticle(id: string | null, input: unknown) {
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("articles").update(parsed.data).eq("id", id)
    : await supabase.from("articles").insert(parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/artiklar");
  return { ok: true };
}

export async function deactivateArticle(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("articles").update({ active: false }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/artiklar");
  return { ok: true };
}
