"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const payrollSchema = z.object({
  period: z.string().regex(/^20\d{2}(0[1-9]|1[0-2])$/, "Period anges som ÅÅÅÅMM"),
  employee_name: z.string().min(1).max(100),
  employee_personal_number: z.string().regex(/^\d{6,8}[-+]?\d{4}$/, "Ogiltigt personnummer"),
  gross_salary: z.number().positive().max(10_000_000),
  tax_deduction: z.number().min(0),
  workplace_address: z.string().max(200).optional(),
  workplace_city: z.string().max(100).optional(),
});

/**
 * Kör en enkel lönekörning (enmans-AB): bokför lönen och sparar underlaget
 * för AGI. Kontering: D 7210 brutto, D 7510 arbetsgivaravgift,
 * K 2710 personalskatt, K 2731 avgifter, K 1930 nettolön.
 */
export async function runPayroll(input: unknown): Promise<{
  ok?: boolean; error?: string; label?: string; employerFee?: number; net?: number;
}> {
  const parsed = payrollSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  if (p.tax_deduction >= p.gross_salary) {
    return { error: "Skatteavdraget kan inte vara större än bruttolönen." };
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: feeRule } = await supabase.from("rule_values").select("value")
    .eq("key", "arbetsgivaravgift_pct").lte("valid_from", today)
    .or(`valid_to.gte.${today},valid_to.is.null`)
    .order("valid_from", { ascending: false }).limit(1).single();
  const feePct = Number(feeRule?.value ?? 31.42);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const employerFee = round2(p.gross_salary * feePct / 100);
  const net = round2(p.gross_salary - p.tax_deduction);

  // Lönedatum: sista dagen i perioden
  const year = parseInt(p.period.slice(0, 4), 10);
  const month = parseInt(p.period.slice(4, 6), 10);
  const payDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("book_verification", {
    p_series_code: "A",
    p_date: payDate,
    p_description: `Lön ${p.period.slice(0, 4)}-${p.period.slice(4)} ${p.employee_name}, brutto ${p.gross_salary.toFixed(2).replace(".", ",")} kr`,
    p_rows: [
      { account: 7210, debit: p.gross_salary, credit: 0, note: "Bruttolön" },
      { account: 7510, debit: employerFee, credit: 0, note: `Arbetsgivaravgift ${feePct} %` },
      { account: 2710, debit: 0, credit: p.tax_deduction, note: "Avdragen preliminärskatt" },
      { account: 2731, debit: 0, credit: employerFee, note: "Arbetsgivaravgift att betala" },
      { account: 1930, debit: 0, credit: net, note: "Nettolön utbetald" },
    ],
    p_counterparty: p.employee_name,
    p_source: "quick_event",
  });
  if (error) return { error: error.message };
  const result = Array.isArray(data) ? data[0] : data;

  const { error: insErr } = await supabase.from("payroll_runs").insert({
    period: p.period,
    employee_name: p.employee_name,
    employee_personal_number: p.employee_personal_number.replace(/\D/g, ""),
    gross_salary: p.gross_salary,
    tax_deduction: p.tax_deduction,
    employer_fee: employerFee,
    workplace_address: p.workplace_address || null,
    workplace_city: p.workplace_city || null,
    verification_id: result?.out_id ?? null,
  });
  if (insErr) {
    return {
      error: insErr.code === "23505"
        ? `Lön för ${p.period} är redan körd för den anställda — rätta via ändringsverifikat i stället.`
        : insErr.message,
    };
  }

  revalidatePath("/lon");
  revalidatePath("/", "layout");
  return { ok: true, label: `${result?.out_series}${result?.out_number}`, employerFee, net };
}
