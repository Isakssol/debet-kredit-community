"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const assetSchema = z.object({
  name: z.string().min(1),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchase_value: z.number().positive(),
  account: z.number().int(),
  contra_account: z.number().int(),
  depreciation_account: z.number().int(),
  useful_life_years: z.number().int().min(3).max(20),
  book_purchase: z.boolean(), // skapa inköpsverifikat direkt (D 1220 + D 2640 / K 1930)
  vat_amount: z.number().min(0).default(0),
});

export async function createAsset(input: unknown) {
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const supabase = await createClient();

  let verificationId: string | null = null;
  if (d.book_purchase) {
    const rows = [
      { account: d.account, debit: d.purchase_value, credit: 0 },
      ...(d.vat_amount > 0 ? [{ account: 2640, debit: d.vat_amount, credit: 0 }] : []),
      { account: 1930, debit: 0, credit: d.purchase_value + d.vat_amount },
    ];
    const { data: ver, error } = await supabase.rpc("book_verification", {
      p_series_code: "A",
      p_date: d.purchase_date,
      p_description: `Inköp inventarie: ${d.name}`,
      p_rows: rows,
      p_source: "manual",
    });
    if (error) return { error: error.message };
    verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;
  }

  const { error } = await supabase.from("assets").insert({
    name: d.name,
    purchase_date: d.purchase_date,
    purchase_value: d.purchase_value,
    account: d.account,
    contra_account: d.contra_account,
    depreciation_account: d.depreciation_account,
    useful_life_years: d.useful_life_years,
    verification_id: verificationId,
  });
  if (error) return { error: error.message };
  revalidatePath("/anlaggningar");
  return { ok: true };
}

/**
 * Räkenskapsenlig avskrivning för året: väljer det lägsta tillåtna restvärdet av
 * 30-regeln (70 % av avskrivningsunderlaget) och 20-regeln (rak 20 %/år),
 * bokför avskrivningen och fördelar den proportionellt per tillgång.
 */
export async function runYearlyDepreciation(year: number) {
  const supabase = await createClient();
  const { data: fy } = await supabase.from("fiscal_years").select("*").eq("year", year).single();
  if (!fy) return { error: "Räkenskapsåret finns inte." };

  const { data: assets } = await supabase.from("assets").select("*, asset_depreciations(amount, fiscal_year_id)")
    .eq("status", "active");
  const active = (assets ?? []).filter((a) => a.purchase_date <= fy.end_date);
  if (!active.length) return { error: "Inga aktiva tillgångar att skriva av." };

  const alreadyRun = active.some((a) =>
    (a.asset_depreciations as { fiscal_year_id: string }[]).some((d) => d.fiscal_year_id === fy.id)
  );
  if (alreadyRun) return { error: "Avskrivningar är redan bokförda för året." };

  // Bokfört värde per tillgång = anskaffningsvärde − ack. avskrivningar
  const values = active.map((a) => ({
    asset: a,
    bookValue: Number(a.purchase_value) - Number(a.acc_depreciation),
    ageYears: Math.max(1, year - parseInt(a.purchase_date.slice(0, 4)) + 1),
  }));
  const totalBookValue = values.reduce((s, v) => s + v.bookValue, 0);
  const totalPurchase = values.reduce((s, v) => s + Number(v.asset.purchase_value), 0);

  // 30-regeln: lägsta värde = 70 % av avskrivningsunderlaget
  const lowest30 = totalBookValue * 0.7;
  // 20-regeln: lägsta värde = anskaffningsvärde × (1 − 20 % × antal år)
  const lowest20 = values.reduce(
    (s, v) => s + Math.max(0, Number(v.asset.purchase_value) * (1 - 0.2 * v.ageYears)), 0);

  const targetValue = Math.min(lowest30, lowest20);
  const depreciation = Math.round((totalBookValue - targetValue) * 100) / 100;
  if (depreciation <= 0) return { error: "Ingen avskrivning krävs (restvärdet är redan lägsta tillåtna)." };

  // Fördela per tillgång proportionellt mot bokfört värde, gruppera verifikatrader per konto
  const perAccount = new Map<string, number>();
  const perAsset: { assetId: string; amount: number }[] = [];
  let allocated = 0;
  values.forEach((v, i) => {
    const isLast = i === values.length - 1;
    const share = isLast
      ? Math.round((depreciation - allocated) * 100) / 100
      : Math.round(depreciation * (v.bookValue / totalBookValue) * 100) / 100;
    allocated += share;
    if (share <= 0) return;
    perAsset.push({ assetId: v.asset.id, amount: share });
    const key = `${v.asset.depreciation_account}:${v.asset.contra_account}`;
    perAccount.set(key, (perAccount.get(key) ?? 0) + share);
  });

  const rows = [...perAccount.entries()].flatMap(([key, amount]) => {
    const [depAcc, contraAcc] = key.split(":").map(Number);
    return [
      { account: depAcc, debit: amount, credit: 0 },
      { account: contraAcc, debit: 0, credit: amount },
    ];
  });

  const { data: ver, error: verErr } = await supabase.rpc("book_verification", {
    p_series_code: "E",
    p_date: fy.end_date,
    p_description: `Avskrivningar ${year} (${lowest30 <= lowest20 ? "30-regeln" : "20-regeln"})`,
    p_rows: rows,
    p_source: "year_end",
  });
  if (verErr) return { error: verErr.message };
  const verificationId = (Array.isArray(ver) ? ver[0] : ver)?.out_id ?? null;

  for (const p of perAsset) {
    await supabase.from("asset_depreciations").insert({
      asset_id: p.assetId,
      fiscal_year_id: fy.id,
      amount: p.amount,
      method: lowest30 <= lowest20 ? "rule_30" : "rule_20",
      verification_id: verificationId,
    });
    const asset = active.find((a) => a.id === p.assetId)!;
    const newAcc = Number(asset.acc_depreciation) + p.amount;
    await supabase.from("assets").update({
      acc_depreciation: newAcc,
      status: newAcc >= Number(asset.purchase_value) - 0.005 ? "fully_depreciated" : "active",
    }).eq("id", p.assetId);
  }

  revalidatePath("/anlaggningar");
  return { ok: true, depreciation, method: lowest30 <= lowest20 ? "30-regeln" : "20-regeln" };
}

/** Avyttring/utrangering: bokför försäljning och vinst (3973) / förlust (7973) */
export async function disposeAsset(input: {
  assetId: string;
  date: string;
  amount: number; // 0 = utrangering
}) {
  const supabase = await createClient();
  const { data: a } = await supabase.from("assets").select("*").eq("id", input.assetId).single();
  if (!a) return { error: "Tillgången finns inte." };
  if (a.status === "sold" || a.status === "scrapped") return { error: "Redan avyttrad." };

  const bookValue = Number(a.purchase_value) - Number(a.acc_depreciation);
  const result = input.amount - bookValue;
  const rows = [
    // Ta bort tillgång och ack. avskrivningar ur balansräkningen
    { account: a.contra_account, debit: Number(a.acc_depreciation), credit: 0 },
    { account: a.account, debit: 0, credit: Number(a.purchase_value) },
  ];
  if (input.amount > 0) {
    // Försäljningslikvid inkl. moms hanteras separat; här förenklat exkl. moms + utgående moms
    const vat = Math.round(input.amount * 0.25 * 100) / 100;
    rows.unshift({ account: 1930, debit: input.amount + vat, credit: 0 });
    rows.push({ account: 2611, debit: 0, credit: vat });
  }
  if (result > 0) rows.push({ account: 3973, debit: 0, credit: result });
  if (result < 0) rows.push({ account: 7973, debit: -result, credit: 0 });

  const { error: verErr } = await supabase.rpc("book_verification", {
    p_series_code: "A",
    p_date: input.date,
    p_description: `${input.amount > 0 ? "Försäljning" : "Utrangering"}: ${a.name}`,
    p_rows: rows,
    p_source: "manual",
  });
  if (verErr) return { error: verErr.message };

  await supabase.from("assets").update({
    status: input.amount > 0 ? "sold" : "scrapped",
    disposal_date: input.date,
    disposal_amount: input.amount,
  }).eq("id", input.assetId);

  revalidatePath("/anlaggningar");
  return { ok: true };
}
