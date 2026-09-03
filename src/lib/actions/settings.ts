"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const settingsSchema = z.object({
  company_name: z.string().min(1),
  org_number: z.string().optional(),
  vat_number: z.string().optional(),
  address: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  bankgiro: z.string().optional(),
  plusgiro: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  vat_period: z.enum(["manad", "kvartal", "helar"]),
  eu_trade: z.boolean(),
  default_payment_terms: z.number().int().min(0).max(90),
  reminder_fee: z.number().min(0),
  late_interest_rate: z.number().nullable(),
  municipal_tax_rate: z.number().min(25).max(40),
});

export async function saveSettings(input: unknown) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Härled VAT-nummer om det saknas. Enskild firma: SE + 12-siffrigt personnummer + 01
  // (10 siffror antas 19xx). Bolag: SE + 10-siffrigt organisationsnummer + 01 (inget sekelprefix).
  const values = { ...parsed.data };
  if (values.org_number && !values.vat_number) {
    const digits = values.org_number.replace(/\D/g, "");
    const supabaseForType = await createClient();
    const { data: s } = await supabaseForType.from("settings")
      .select("company_type").eq("id", 1).single();
    const isEf = (s?.company_type ?? "enskild_firma") === "enskild_firma";
    if (digits.length === 12) values.vat_number = `SE${digits}01`;
    else if (digits.length === 10) {
      values.vat_number = isEf ? `SE19${digits}01` : `SE${digits}01`;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(values).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

const companyTypeSchema = z.object({
  company_type: z.enum(["enskild_firma", "aktiebolag", "handelsbolag"]),
});

/** Bolagstypen — styr moms, skatteberäkning och vilket årsavslut som erbjuds. */
export async function saveCompanyType(input: unknown) {
  const parsed = companyTypeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("settings")
    .update({ company_type: parsed.data.company_type }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Klicka bort ett Kom igång-steg, eller dölj hela checklistan */
export async function dismissChecklist(input: unknown): Promise<{ ok?: boolean; error?: string }> {
  const parsed = z.object({
    step: z.string().max(60).optional(),   // ett steg-id — utelämnat = dölj allt
  }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  if (!parsed.data.step) {
    const { error } = await supabase.from("settings")
      .update({ checklist_hidden: true }).eq("id", 1);
    if (error) return { error: error.message };
  } else {
    const { data: settings } = await supabase.from("settings")
      .select("dismissed_checklist_steps").eq("id", 1).single();
    const current: string[] = Array.isArray(settings?.dismissed_checklist_steps)
      ? settings.dismissed_checklist_steps : [];
    const next = [...new Set([...current, parsed.data.step])].slice(0, 20);
    const { error } = await supabase.from("settings")
      .update({ dismissed_checklist_steps: next }).eq("id", 1);
    if (error) return { error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

/** Spara användarens valda dashboard-widgets (null = standard) */
export async function saveDashboardWidgets(ids: unknown): Promise<{ ok?: boolean; error?: string }> {
  const { sanitizeWidgetIds, DEFAULT_WIDGETS } = await import("@/lib/widgets");
  const valid = sanitizeWidgetIds(ids);
  if (!valid) return { error: "Minst en widget måste vara vald." };
  const isDefault = valid.length === DEFAULT_WIDGETS.length
    && valid.every((id, i) => id === DEFAULT_WIDGETS[i]);
  const supabase = await createClient();
  const { error } = await supabase.from("settings")
    .update({ dashboard_widgets: isDefault ? null : valid }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/** Utseende: accentfärg och bakgrundston (null = standard) */
export async function saveAppearance(input: unknown): Promise<{ ok?: boolean; error?: string }> {
  const parsed = z.object({
    theme_accent: z.string().max(30).nullable(),
    theme_background: z.string().max(30).nullable(),
  }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update(parsed.data).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Första-gången-wizarden: spara grundinställningar och markera onboarding klar */
export async function completeOnboarding(input: unknown): Promise<{ ok?: boolean; error?: string }> {
  // Bolagstypen sparas först — VAT-härledningen i saveSettings beror på den
  const companyType = (input as { company_type?: string })?.company_type;
  const supabase = await createClient();
  if (companyType && ["enskild_firma", "aktiebolag", "handelsbolag"].includes(companyType)) {
    const { error } = await supabase.from("settings")
      .update({ company_type: companyType }).eq("id", 1);
    if (error) return { error: error.message };
  }
  const res = await saveSettings(input);
  if (res.error) return res;
  const { error } = await supabase.from("settings")
    .update({ onboarded_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleAccountingMethod(fiscalYearId: string, method: string) {
  if (!["faktureringsmetoden", "kontantmetoden"].includes(method)) {
    return { error: "Ogiltig metod." };
  }
  const supabase = await createClient();
  // Metodbyte endast om året saknar verifikat (annars blir momsredovisningen fel)
  const { count } = await supabase.from("verifications")
    .select("id", { count: "exact", head: true }).eq("fiscal_year_id", fiscalYearId);
  if ((count ?? 0) > 0) {
    return { error: "Bokföringsmetoden kan inte bytas när året har verifikat." };
  }
  const { error } = await supabase.from("fiscal_years")
    .update({ accounting_method: method }).eq("id", fiscalYearId);
  if (error) return { error: error.message };
  revalidatePath("/installningar");
  return { ok: true };
}

export async function toggleMonthLock(fiscalYearId: string, month: number, lock: boolean) {
  const supabase = await createClient();
  if (lock) {
    const { error } = await supabase.from("period_locks")
      .insert({ fiscal_year_id: fiscalYearId, month, reason: "manual" });
    if (error) return { error: error.message };
  } else {
    // Endast manuella lås får låsas upp — momslåsta perioder är definitiva
    const { data: existing } = await supabase.from("period_locks")
      .select("id, reason").eq("fiscal_year_id", fiscalYearId).eq("month", month).single();
    if (!existing) return { error: "Perioden är inte låst." };
    if (existing.reason !== "manual") {
      return { error: "Perioden är låst av momsrapporten och kan inte låsas upp." };
    }
    const { error } = await supabase.from("period_locks").delete().eq("id", existing.id);
    if (error) return { error: error.message };
  }
  revalidatePath("/installningar");
  return { ok: true };
}

/** Registrera ingående balanser (vid migrering från annat system). */
export async function bookOpeningBalances(input: {
  date: string;
  rows: { account: number; debit: number; credit: number }[];
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_verification", {
    p_series_code: "A",
    p_date: input.date,
    p_description: "Ingående balanser",
    p_rows: input.rows,
    p_source: "opening_balance",
  });
  if (error) return { error: error.message };
  const result = Array.isArray(data) ? data[0] : data;
  revalidatePath("/", "layout");
  return { ok: true, label: `A${result?.out_number}` };
}
