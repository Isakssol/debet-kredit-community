/**
 * SRU-export: zip med INFO.SRU + BLANKETTER.SRU (NE + INK1-utkast) för
 * uppladdning i Skatteverkets filöverföringstjänst. Endast enskild firma.
 */
import { NextResponse } from "next/server";
import JSZip from "jszip";
import iconv from "iconv-lite";
import { createClient } from "@/lib/supabase/server";
import { getAccountLines } from "@/lib/reports/data";
import { computeNeFields } from "@/lib/tax/calc";
import { buildInfoSru, buildBlanketterSru, buildInk2Sru, to12Digits } from "@/lib/sru/build";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const yearParam = new URL(req.url).searchParams.get("year");
  const [{ data: settings }, { data: fy }] = await Promise.all([
    supabase.from("settings")
      .select("company_name, company_type, org_number, postal_code, city").eq("id", 1).single(),
    yearParam
      ? supabase.from("fiscal_years").select("*").eq("year", parseInt(yearParam, 10)).single()
      : supabase.from("fiscal_years").select("*").eq("status", "open").order("year").limit(1).single(),
  ]);

  const companyType = settings?.company_type ?? "enskild_firma";
  if (companyType === "handelsbolag") {
    return new NextResponse("SRU-export för handelsbolag (INK4/N3A) stöds inte ännu.", { status: 400 });
  }
  if (!fy) return new NextResponse("Inget räkenskapsår hittades.", { status: 404 });
  if (!settings?.org_number) {
    return new NextResponse(
      companyType === "enskild_firma"
        ? "Ange personnummer under Inställningar först."
        : "Ange organisationsnummer under Inställningar först.",
      { status: 400 });
  }

  let id12: string;
  try {
    id12 = to12Digits(settings.org_number, companyType === "enskild_firma" ? "person" : "org");
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 400 });
  }

  const [lines, { data: neAccounts }] = await Promise.all([
    getAccountLines(fy.id),
    supabase.from("accounts").select("number, ne_field"),
  ]);
  const neFieldByAccount = new Map((neAccounts ?? []).map((a) => [a.number, a.ne_field]));
  const neValues = computeNeFields(lines.map((l) => ({
    account: l.account, name: l.name,
    ne_field: neFieldByAccount.get(l.account) ?? null,
    closing: l.closing,
  })));
  const bookedResult = lines
    .filter((l) => l.class >= 3 && l.account !== 8999)
    .reduce((s, l) => s - l.closing, 0);

  const created = new Date();
  const party = {
    id12,
    name: settings.company_name ?? "Deklarant",
    postalCode: settings.postal_code ?? "00000",
    city: settings.city ?? "Ort",
  };
  const info = buildInfoSru(party, created, "Debet & Kredit");
  const blanketter = companyType === "aktiebolag"
    ? buildInk2Sru({
        taxYear: fy.year,
        org12: id12,
        name: party.name,
        fiscalStart: fy.start_date,
        fiscalEnd: fy.end_date,
        lines: lines.map((l) => ({ account: l.account, closing: l.closing })),
        created,
      })
    : buildBlanketterSru({
        taxYear: fy.year,
        id12,
        name: party.name,
        fiscalStart: fy.start_date,
        fiscalEnd: fy.end_date,
        activityDescription: settings.company_name ?? "Näringsverksamhet",
        neValues,
        bookedResult,
        created,
      });

  const zip = new JSZip();
  zip.file("INFO.SRU", iconv.encode(info, "latin1"));
  zip.file("BLANKETTER.SRU", iconv.encode(blanketter, "latin1"));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="sru-${fy.year}.zip"`,
    },
  });
}
