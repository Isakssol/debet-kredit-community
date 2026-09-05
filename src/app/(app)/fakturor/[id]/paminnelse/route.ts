import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  bold: { fontFamily: "Helvetica-Bold" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  box: { marginTop: 24, padding: 12, borderWidth: 1, borderColor: "#111" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
});

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: inv }, { data: settings }, { data: refRule }] = await Promise.all([
    supabase.from("invoices")
      .select("*, invoice_payments(amount), invoice_reminders(reminder_no, sent_date, fee)")
      .eq("id", id).single(),
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("rule_values").select("value").eq("key", "referensranta")
      .lte("valid_from", today).or(`valid_to.gte.${today},valid_to.is.null`)
      .order("valid_from", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!inv || !settings) return NextResponse.json({ error: "Fakturan finns inte." }, { status: 404 });

  const reminders = (inv.invoice_reminders ?? []) as { reminder_no: number; sent_date: string; fee: number }[];
  const reminder = reminders.sort((a, b) => b.reminder_no - a.reminder_no)[0];
  if (!reminder) return NextResponse.json({ error: "Ingen påminnelse registrerad." }, { status: 404 });

  const paid = ((inv.invoice_payments ?? []) as { amount: number }[])
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(inv.total_amount) - paid;

  // Dröjsmålsränta enligt räntelagen: referensränta + 8 %-enheter (eller avtalad ränta)
  const interestRate = settings.late_interest_rate != null
    ? Number(settings.late_interest_rate)
    : Number(refRule?.value ?? 2.0) + 8;
  const daysLate = Math.max(0, Math.floor(
    (new Date(today).getTime() - new Date(inv.due_date).getTime()) / 86400000));
  const interest = Math.round(remaining * (interestRate / 100) * (daysLate / 365) * 100) / 100;
  const fee = Number(reminder.fee);
  const toPay = Math.round((remaining + interest + fee) * 100) / 100;

  const customer = inv.customer_snapshot as {
    name?: string; address?: string; postal_code?: string; city?: string;
  } | null;

  const element = React.createElement(
    Document, { title: `Betalningspåminnelse ${reminder.reminder_no}` },
    React.createElement(Page, { size: "A4", style: s.page },
      React.createElement(View, { style: s.spaceBetween },
        React.createElement(View, {},
          React.createElement(Text, { style: s.h1 }, settings.company_name),
          React.createElement(Text, {}, settings.address ?? ""),
          React.createElement(Text, {}, `${settings.postal_code ?? ""} ${settings.city ?? ""}`)),
        React.createElement(View, { style: { alignItems: "flex-end" } },
          React.createElement(Text, { style: [s.h1, { fontSize: 14 }] },
            `BETALNINGSPÅMINNELSE ${reminder.reminder_no}`),
          React.createElement(Text, {}, `Datum: ${reminder.sent_date}`))),
      React.createElement(View, { style: { marginTop: 24 } },
        React.createElement(Text, { style: s.bold }, customer?.name ?? ""),
        React.createElement(Text, {}, customer?.address ?? ""),
        React.createElement(Text, {}, `${customer?.postal_code ?? ""} ${customer?.city ?? ""}`)),
      React.createElement(View, { style: { marginTop: 24 } },
        React.createElement(Text, {},
          `Vår faktura ${inv.invoice_no} med förfallodatum ${inv.due_date} är trots tidigare avisering obetald. ` +
          `Vi ber er betala omgående. Har betalning redan skett kan ni bortse från denna påminnelse.`)),
      React.createElement(View, { style: s.box },
        React.createElement(View, { style: s.row },
          React.createElement(Text, {}, `Kvarstående belopp faktura ${inv.invoice_no}`),
          React.createElement(Text, {}, `${fmt(remaining)} kr`)),
        interest > 0 ? React.createElement(View, { style: s.row },
          React.createElement(Text, {},
            `Dröjsmålsränta ${interestRate.toFixed(1).replace(".", ",")} % (${daysLate} dagar)`),
          React.createElement(Text, {}, `${fmt(interest)} kr`)) : null,
        fee > 0 ? React.createElement(View, { style: s.row },
          React.createElement(Text, {}, "Påminnelseavgift"),
          React.createElement(Text, {}, `${fmt(fee)} kr`)) : null,
        React.createElement(View, { style: [s.row, { borderTopWidth: 1, borderTopColor: "#111", marginTop: 4, paddingTop: 4 }] },
          React.createElement(Text, { style: s.bold }, "ATT BETALA"),
          React.createElement(Text, { style: s.bold }, `${fmt(toPay)} kr`))),
      React.createElement(View, { style: { marginTop: 16 } },
        React.createElement(Text, {},
          `Betalas till ${settings.bankgiro ? `bankgiro ${settings.bankgiro}` : `IBAN ${settings.iban ?? ""}`} med OCR/referens ${inv.ocr ?? inv.invoice_no}.`))
    )
  );

  const buffer = await renderToBuffer(element as React.ReactElement<DocumentProps>);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="paminnelse-${inv.invoice_no}-${reminder.reminder_no}.pdf"`,
    },
  });
}
