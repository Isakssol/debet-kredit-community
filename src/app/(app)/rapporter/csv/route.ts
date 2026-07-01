import { NextResponse } from "next/server";
import { getReportContext, getAccountLines, getLedgerRows } from "@/lib/reports/data";

/** CSV-export (semikolonseparerad, svensk Excel-standard, decimalkomma) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const typ = url.searchParams.get("typ") ?? "resultat";
  const yearParam = url.searchParams.get("year");

  const ctx = await getReportContext(yearParam ? parseInt(yearParam) : undefined);
  if ("error" in ctx) return NextResponse.json(ctx, { status: 400 });

  const num = (n: number) => n.toFixed(2).replace(".", ",");
  let rows: string[][];
  let filename: string;

  if (typ === "huvudbok") {
    const ledger = await getLedgerRows(ctx.fiscalYear.id);
    rows = [
      ["Konto", "Kontonamn", "Verifikat", "Datum", "Text", "Debet", "Kredit"],
      ...ledger.map((r) => [
        String(r.account), r.accountName, r.ver, r.date, r.description,
        num(r.debit), num(r.credit),
      ]),
    ];
    filename = `huvudbok-${ctx.fiscalYear.year}`;
  } else {
    const lines = await getAccountLines(ctx.fiscalYear.id);
    const filtered = typ === "balans"
      ? lines.filter((l) => l.class <= 2)
      : lines.filter((l) => l.class >= 3);
    rows = [
      ["Konto", "Benämning", "Ingående balans", "Period", "Utgående saldo"],
      ...filtered.map((l) => [
        String(l.account), l.name, num(l.opening), num(l.period), num(l.closing),
      ]),
    ];
    filename = `${typ}-${ctx.fiscalYear.year}`;
  }

  const csv = "﻿" + rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
