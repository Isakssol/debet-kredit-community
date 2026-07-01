import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getReportContext, getAccountLines, getLedgerRows } from "@/lib/reports/data";
import {
  ResultReportPdf, BalanceReportPdf, LedgerPdf, VerificationListPdf,
  ReskontraPdf, VatReportPdf, NeReportPdf, type VerListItem, type ReskontraItem,
} from "@/lib/reports/pdf-docs";
import { computeNeFields } from "@/lib/tax/calc";
import type { ReportMeta } from "@/lib/reports/pdf-shared";
import { getVatEntries } from "@/lib/actions/vat";
import { computeVatBoxes } from "@/lib/vat/report";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const typ = url.searchParams.get("typ") ?? "resultat";
  const yearParam = url.searchParams.get("year");
  const periodStart = url.searchParams.get("from") ?? undefined;
  const periodEnd = url.searchParams.get("to") ?? undefined;

  const ctx = await getReportContext(yearParam ? parseInt(yearParam) : undefined);
  if ("error" in ctx) return NextResponse.json(ctx, { status: 400 });

  const period = `${periodStart ?? ctx.fiscalYear.start} - ${periodEnd ?? ctx.fiscalYear.end}`;
  const baseMeta: Omit<ReportMeta, "title"> = {
    companyName: ctx.companyName,
    orgNumber: ctx.orgNumber,
    period,
    fiscalYearLabel: `Räkenskapsår ${ctx.fiscalYear.start} - ${ctx.fiscalYear.end}`,
    printedAt: ctx.printedAt,
    lastVerNo: ctx.lastVerNo,
  };

  const supabase = await createClient();
  let element: React.ReactElement;
  let filename: string;

  switch (typ) {
    case "resultat": {
      const lines = await getAccountLines(ctx.fiscalYear.id, periodStart, periodEnd);
      element = React.createElement(ResultReportPdf, {
        meta: { ...baseMeta, title: "Resultatrapport" },
        lines,
      });
      filename = `resultatrapport-${ctx.fiscalYear.year}`;
      break;
    }
    case "balans": {
      const lines = await getAccountLines(ctx.fiscalYear.id, periodStart, periodEnd);
      const computedResult = lines.filter((l) => l.class >= 3)
        .reduce((s, l) => s - l.closing, 0);
      element = React.createElement(BalanceReportPdf, {
        meta: { ...baseMeta, title: "Balansrapport" },
        lines,
        computedResult,
      });
      filename = `balansrapport-${ctx.fiscalYear.year}`;
      break;
    }
    case "huvudbok": {
      const rows = await getLedgerRows(ctx.fiscalYear.id);
      const lines = await getAccountLines(ctx.fiscalYear.id);
      const openings = new Map(lines.map((l) => [l.account, 0]));
      element = React.createElement(LedgerPdf, {
        meta: { ...baseMeta, title: "Huvudbok" },
        rows,
        openings,
      });
      filename = `huvudbok-${ctx.fiscalYear.year}`;
      break;
    }
    case "verifikationslista": {
      const { data: vers } = await supabase
        .from("verifications")
        .select("number, verification_date, registered_at, description, verification_series(code), verification_rows(account, debit, credit, row_no, accounts(name))")
        .eq("fiscal_year_id", ctx.fiscalYear.id)
        .order("verification_date");
      const verifications: VerListItem[] = (vers ?? []).map((v) => ({
        ver: `${(v.verification_series as unknown as { code: string })?.code}${v.number}`,
        date: v.verification_date,
        registered: (v.registered_at as string).slice(0, 10),
        description: v.description,
        rows: ((v.verification_rows as unknown as { account: number; debit: number; credit: number; row_no: number; accounts: { name: string } }[]) ?? [])
          .sort((a, b) => a.row_no - b.row_no)
          .map((r) => ({
            account: r.account,
            accountName: r.accounts?.name ?? "",
            debit: Number(r.debit),
            credit: Number(r.credit),
          })),
      }));
      element = React.createElement(VerificationListPdf, {
        meta: { ...baseMeta, title: "Verifikationslista" },
        verifications,
      });
      filename = `verifikationslista-${ctx.fiscalYear.year}`;
      break;
    }
    case "kundreskontra": {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("invoice_no, invoice_date, due_date, total_amount, status, customer_snapshot, customers(name), invoice_payments(amount)")
        .in("status", ["booked", "sent", "partially_paid"])
        .eq("type", "debit")
        .order("due_date");
      const items: ReskontraItem[] = (invoices ?? []).map((i) => {
        const paid = ((i.invoice_payments ?? []) as { amount: number }[])
          .reduce((s, p) => s + Number(p.amount), 0);
        return {
          number: String(i.invoice_no ?? ""),
          counterparty: (i.customer_snapshot as { name?: string })?.name ?? (i.customers as unknown as { name: string } | null)?.name ?? "",
          invoiceDate: i.invoice_date,
          dueDate: i.due_date,
          total: Number(i.total_amount),
          paid,
          remaining: Number(i.total_amount) - paid,
          status: i.status,
        };
      });
      element = React.createElement(ReskontraPdf, {
        meta: { ...baseMeta, title: "Kundreskontra — öppna poster" },
        items,
        kind: "kund",
      });
      filename = `kundreskontra-${ctx.fiscalYear.year}`;
      break;
    }
    case "leverantorsreskontra": {
      const { data: invoices } = await supabase
        .from("supplier_invoices")
        .select("invoice_no, invoice_date, due_date, total_amount, status, suppliers(name), supplier_payments(amount)")
        .neq("status", "paid")
        .order("due_date");
      const items: ReskontraItem[] = (invoices ?? []).map((i) => {
        const paid = ((i.supplier_payments ?? []) as { amount: number }[])
          .reduce((s, p) => s + Number(p.amount), 0);
        return {
          number: i.invoice_no ?? "",
          counterparty: (i.suppliers as unknown as { name: string } | null)?.name ?? "",
          invoiceDate: i.invoice_date,
          dueDate: i.due_date,
          total: Number(i.total_amount),
          paid,
          remaining: Number(i.total_amount) - paid,
          status: i.status,
        };
      });
      element = React.createElement(ReskontraPdf, {
        meta: { ...baseMeta, title: "Leverantörsreskontra — öppna poster" },
        items,
        kind: "leverantör",
      });
      filename = `leverantorsreskontra-${ctx.fiscalYear.year}`;
      break;
    }
    case "moms": {
      if (!periodStart || !periodEnd) {
        return NextResponse.json({ error: "from/to krävs för momsrapport" }, { status: 400 });
      }
      const { data: report } = await supabase.from("vat_reports")
        .select("boxes, status").eq("period_start", periodStart).maybeSingle();
      const boxes = report?.status === "approved"
        ? (report.boxes as Record<string, number>)
        : computeVatBoxes(await getVatEntries(periodStart, periodEnd)).boxes;
      element = React.createElement(VatReportPdf, {
        meta: {
          ...baseMeta,
          title: "Momsrapport",
          period: `${periodStart} - ${periodEnd}`,
          note: report?.status === "approved" ? "Redovisad" : "Preliminär",
        },
        boxes,
      });
      filename = `momsrapport-${periodStart}`;
      break;
    }
    case "ne": {
      const lines = await getAccountLines(ctx.fiscalYear.id);
      const { data: neAccounts } = await supabase.from("accounts").select("number, ne_field");
      const neFieldByAccount = new Map((neAccounts ?? []).map((a) => [a.number, a.ne_field]));
      const ne = computeNeFields(lines.map((l) => ({
        account: l.account, name: l.name,
        ne_field: neFieldByAccount.get(l.account) ?? null, closing: l.closing,
      })));
      const bookedResult = lines.filter((l) => l.class >= 3 && l.account !== 8999)
        .reduce((s, l) => s - l.closing, 0);
      const B: Record<string, string> = {
        B1: "Immateriella anläggningstillgångar", B2: "Byggnader och markanläggningar",
        B4: "Maskiner och inventarier", B6: "Varulager", B7: "Kundfordringar",
        B8: "Övriga fordringar", B9: "Kassa och bank", B10: "Eget kapital",
        B13: "Låneskulder", B14: "Skatteskulder", B15: "Leverantörsskulder", B16: "Övriga skulder",
      };
      const R: Record<string, string> = {
        R1: "Försäljning och utfört arbete m.m. (momspliktig)", R2: "Momsfria intäkter",
        R3: "Bil- och bostadsförmån m.m.", R4: "Ränteintäkter m.m.",
        R5: "Varor, material och tjänster", R6: "Övriga externa kostnader",
        R7: "Anställd personal", R8: "Räntekostnader m.m.",
        R9: "Avskrivningar maskiner och inventarier", R10: "Avskrivningar byggnader",
      };
      element = React.createElement(NeReportPdf, {
        meta: { ...baseMeta, title: "Underlag förenklat årsbokslut & NE-bilaga", note: "Preliminär" },
        bFields: Object.entries(B).map(([field, label]) => ({ field, label, value: ne.get(field) ?? 0 }))
          .filter((f) => f.value !== 0 || ["B9", "B10"].includes(f.field)),
        rFields: Object.entries(R).map(([field, label]) => ({ field, label, value: ne.get(field) ?? 0 }))
          .filter((f) => f.value !== 0 || ["R1", "R6"].includes(f.field)),
        bookedResult,
      });
      filename = `ne-underlag-${ctx.fiscalYear.year}`;
      break;
    }
    default:
      return NextResponse.json({ error: `Okänd rapporttyp: ${typ}` }, { status: 400 });
  }

  const buffer = await renderToBuffer(
    element as React.ReactElement<DocumentProps>
  );
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
    },
  });
}
