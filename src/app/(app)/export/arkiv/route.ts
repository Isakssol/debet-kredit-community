import { NextResponse } from "next/server";
import React from "react";
import JSZip from "jszip";
import iconv from "iconv-lite";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { buildSieForYear } from "@/lib/sie/build";
import { getReportContext, getAccountLines, getLedgerRows } from "@/lib/reports/data";
import { ResultReportPdf, BalanceReportPdf, LedgerPdf } from "@/lib/reports/pdf-docs";

/**
 * Arkivexport: komplett zip per räkenskapsår — SIE-fil, rapporter och alla
 * underlag. Uppfyller 7-årsarkiveringen oberoende av databasen.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? "");
  if (!year) return NextResponse.json({ error: "year saknas" }, { status: 400 });

  const ctx = await getReportContext(year);
  if ("error" in ctx) return NextResponse.json(ctx, { status: 400 });

  const zip = new JSZip();
  const supabase = await createClient();

  // 1. SIE-fil
  const sie = await buildSieForYear(year);
  if ("sie" in sie) {
    zip.file(`bokforing-${year}.se`, iconv.encode(sie.sie, "cp437"));
  }

  // 2. Rapport-PDF:er
  const meta = {
    companyName: ctx.companyName,
    orgNumber: ctx.orgNumber,
    period: `${ctx.fiscalYear.start} - ${ctx.fiscalYear.end}`,
    fiscalYearLabel: `Räkenskapsår ${ctx.fiscalYear.start} - ${ctx.fiscalYear.end}`,
    printedAt: ctx.printedAt,
    lastVerNo: ctx.lastVerNo,
  };
  const lines = await getAccountLines(ctx.fiscalYear.id);
  const ledgerRows = await getLedgerRows(ctx.fiscalYear.id);
  const computedResult = lines.filter((l) => l.class >= 3).reduce((s, l) => s - l.closing, 0);

  const docs: [string, React.ReactElement][] = [
    ["resultatrapport.pdf", React.createElement(ResultReportPdf, {
      meta: { ...meta, title: "Resultatrapport" }, lines })],
    ["balansrapport.pdf", React.createElement(BalanceReportPdf, {
      meta: { ...meta, title: "Balansrapport" }, lines, computedResult })],
    ["huvudbok.pdf", React.createElement(LedgerPdf, {
      meta: { ...meta, title: "Huvudbok" }, rows: ledgerRows, openings: new Map() })],
  ];
  for (const [name, element] of docs) {
    const buf = await renderToBuffer(element as React.ReactElement<DocumentProps>);
    zip.file(name, buf);
  }

  // 3. Alla underlag (kvitton/fakturabilagor) för året
  const { data: attachments } = await supabase
    .from("attachments")
    .select("storage_path, file_name, verifications!inner(fiscal_year_id, number, verification_series(code))")
    .eq("verifications.fiscal_year_id", ctx.fiscalYear.id);

  const underlagFolder = zip.folder("underlag");
  for (const a of attachments ?? []) {
    const { data: file } = await supabase.storage.from("underlag").download(a.storage_path);
    if (file) {
      const ver = a.verifications as unknown as {
        number: number; verification_series: { code: string };
      };
      const prefix = ver ? `${ver.verification_series?.code}${ver.number}-` : "";
      underlagFolder?.file(`${prefix}${a.file_name}`, await file.arrayBuffer());
    }
  }

  const blob = await zip.generateAsync({ type: "uint8array" });
  return new NextResponse(Buffer.from(blob), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="bokforing-arkiv-${year}.zip"`,
    },
  });
}
