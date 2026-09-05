"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSie, decodeSieBuffer } from "@/lib/sie/import";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * Importera SIE-fil (från Fortnox, Visma, Bokio m.fl.):
 * 1. Okända konton skapas i kontoplanen
 * 2. Ingående balanser bokförs (om året saknar IB)
 * 3. Verifikat bokförs i egna importserier (I + ursprungsserie) med obrutna nummer
 */
export async function importSieFile(formData: FormData) {
  const file = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) ?? "allt"; // 'ib' | 'allt'
  if (!file) return { error: "Ingen fil vald." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const content = decodeSieBuffer(buffer);
  if (!content.includes("#SIETYP") && !content.includes("#FLAGGA")) {
    return { error: "Filen ser inte ut som en SIE-fil (saknar #FLAGGA/#SIETYP)." };
  }

  const parsed = parseSie(content);
  const supabase = await createClient();
  const summary = { accountsCreated: 0, ibBooked: false, versImported: 0, skipped: 0 };
  const warnings = [...parsed.warnings];

  // 1. Skapa okända konton
  const { data: existingAccounts } = await supabase.from("accounts").select("number");
  const known = new Set((existingAccounts ?? []).map((a) => a.number));
  const usedAccounts = new Set<number>([
    ...parsed.openingBalances.map((b) => b.account),
    ...parsed.verifications.flatMap((v) => v.rows.map((r) => r.account)),
  ]);
  for (const acc of parsed.accounts) {
    if (!known.has(acc.number) && usedAccounts.has(acc.number)) {
      const { error } = await supabase.from("accounts").insert({
        number: acc.number,
        name: acc.name,
        description: "Skapad vid SIE-import",
      });
      if (!error) {
        summary.accountsCreated++;
        known.add(acc.number);
      }
    }
  }
  // Konton som används men saknar #KONTO-rad
  for (const number of usedAccounts) {
    if (!known.has(number)) {
      await supabase.from("accounts").insert({
        number, name: `Konto ${number} (SIE-import)`, description: "Skapad vid SIE-import",
      });
      summary.accountsCreated++;
      known.add(number);
    }
  }

  // 2. Ingående balanser
  if (parsed.openingBalances.length > 0) {
    const { data: existingIb } = await supabase.from("verifications")
      .select("id").eq("source", "opening_balance").limit(1);
    if (existingIb?.length) {
      warnings.push("Ingående balanser finns redan — hoppade över IB från filen.");
    } else {
      const fyStart = parsed.fiscalYears.find((f) => f.index === 0)?.start ?? "2026-01-01";
      const rows = parsed.openingBalances.map((b) => ({
        account: b.account,
        debit: b.amount > 0 ? b.amount : 0,
        credit: b.amount < 0 ? -b.amount : 0,
      }));
      const sum = rows.reduce((s, r) => s + r.debit - r.credit, 0);
      if (Math.abs(sum) > 0.005) {
        warnings.push(`IB balanserar inte (diff ${sum.toFixed(2)} kr) — bokfördes inte.`);
      } else {
        const { error } = await supabase.rpc("book_verification", {
          p_series_code: "A",
          p_date: fyStart,
          p_description: `Ingående balanser (SIE-import: ${parsed.companyName ?? file.name})`,
          p_rows: rows,
          p_source: "opening_balance",
        });
        if (error) warnings.push(`IB-bokningen misslyckades: ${error.message}`);
        else {
          summary.ibBooked = true;
          // Utan ib_booked-flaggan tror appen fortfarande att ingående balanser saknas
          const { data: targetFy } = await supabase.from("fiscal_years").select("id")
            .lte("start_date", fyStart).gte("end_date", fyStart).maybeSingle();
          const { data: marked, error: ibErr } = targetFy
            ? await supabase.from("fiscal_years")
                .update({ ib_booked: true }).eq("id", targetFy.id).select("id")
            : { data: null, error: null };
          if (ibErr || !marked?.length) {
            warnings.push(`Ingående balanser är bokförda men räkenskapsåret kunde inte markeras som IB-klart${ibErr ? ` (${ibErr.message})` : ""} — kontrollera under Inställningar → Räkenskapsår.`);
          }
        }
      }
    }
  }

  // 3. Verifikat — importeras i egna serier (I<ursprungsserie>) för spårbarhet.
  // Idempotent: ett verifikat vars ursprungsnummer redan finns i importserien
  // hoppas över, så samma fil kan köras om (eller återupptas efter avbrott)
  // utan dubbletter.
  let alreadyImported = 0;
  if (mode === "allt" && parsed.verifications.length > 0) {
    const { data: fys } = await supabase.from("fiscal_years").select("*");
    const seriesCreated = new Set<string>();
    const existingKeys = new Set<string>();
    for (const fy of fys ?? []) {
      const rows = await fetchAll<{ description: string | null; verification_series: unknown }>((f, t) =>
        supabase.from("verifications").select("description, verification_series!inner(code)")
          .eq("fiscal_year_id", fy.id).like("verification_series.code", "I%").order("id").range(f, t));
      for (const r of rows) {
        const m = (r.description ?? "").match(/\(imp\. ([A-ZÅÄÖ0-9]+?)(\d+)\)$/);
        if (m) existingKeys.add(`${fy.id}:${m[1]}${m[2]}`);
      }
    }

    for (const ver of parsed.verifications.sort((a, b) => a.date.localeCompare(b.date))) {
      const fy = (fys ?? []).find((f) => ver.date >= f.start_date && ver.date <= f.end_date);
      if (!fy) {
        summary.skipped++;
        continue;
      }
      if (ver.number != null && existingKeys.has(`${fy.id}:${ver.series}${ver.number}`)) {
        alreadyImported++;
        continue;
      }
      // Fortnox m.fl. skriver ut oanvända mallkonton som nollrader — utan
      // bokföringsmässig betydelse, och otillåtna som rader hos oss.
      const rows = ver.rows.filter((r) => Math.abs(r.amount) >= 0.005);
      if (rows.length < 2) {
        summary.skipped++;
        if (warnings.length < 10) warnings.push(`${ver.series}${ver.number}: endast nollrader — hoppades över.`);
        continue;
      }
      const seriesCode = `I${ver.series}`.slice(0, 2);
      if (!seriesCreated.has(`${fy.id}:${seriesCode}`)) {
        await supabase.from("verification_series").upsert({
          fiscal_year_id: fy.id,
          code: seriesCode,
          name: `Import serie ${ver.series}`,
          manual_entry: false,
        }, { onConflict: "fiscal_year_id,code", ignoreDuplicates: true });
        seriesCreated.add(`${fy.id}:${seriesCode}`);
      }
      const { error } = await supabase.rpc("book_verification", {
        p_series_code: seriesCode,
        p_date: ver.date,
        p_description: `${ver.description} (imp. ${ver.series}${ver.number ?? ""})`,
        p_rows: rows.map((r) => ({
          account: r.account,
          debit: r.amount > 0 ? r.amount : 0,
          credit: r.amount < 0 ? -r.amount : 0,
        })),
        p_source: "manual",
      });
      if (error) {
        summary.skipped++;
        if (warnings.length < 10) warnings.push(`${ver.series}${ver.number}: ${error.message}`);
      } else {
        summary.versImported++;
      }
    }
  }

  if (alreadyImported > 0) {
    warnings.unshift(`${alreadyImported} verifikat fanns redan i importserien och hoppades över (samma fil importerad tidigare, eller fortsättning efter avbrott).`);
  }
  revalidatePath("/", "layout");
  return { ok: true, summary, warnings, company: parsed.companyName };
}
