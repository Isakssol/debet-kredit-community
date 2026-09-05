import {
  Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  // Rimlig maxhöjd: logotypen ska synas utan att tränga undan adressblocket
  logo: { height: 38, maxWidth: 190, objectFit: "contain", marginBottom: 6 },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  section: { marginTop: 16 },
  label: { color: "#666", fontSize: 8 },
  tableHeader: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111",
    paddingBottom: 4, marginTop: 20, fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd",
    paddingVertical: 4,
  },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colUnit: { flex: 0.8, textAlign: "right" },
  colPrice: { flex: 1.4, textAlign: "right" },
  colVat: { flex: 0.8, textAlign: "right" },
  colSum: { flex: 1.6, textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  payBox: {
    marginTop: 24, padding: 12, borderWidth: 1, borderColor: "#111",
    flexDirection: "row", justifyContent: "space-between",
  },
  footer: {
    position: "absolute", bottom: 32, left: 48, right: 48,
    borderTopWidth: 0.5, borderTopColor: "#999", paddingTop: 8,
    fontSize: 7, color: "#555", flexDirection: "row", justifyContent: "space-between",
  },
});

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type InvoicePdfData = {
  type: "debit" | "credit";
  invoiceNo: number;
  ocr: string;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: number;
  creditsInvoiceNo?: number | null;
  vatType: "SE" | "EU_REVERSE" | "EXPORT";
  customer: {
    name: string; org_number?: string | null; vat_number?: string | null;
    address?: string | null; postal_code?: string | null; city?: string | null;
    country?: string | null;
  };
  yourReference?: string | null;
  ourReference?: string | null;
  notes?: string | null;
  rows: {
    description: string; quantity: number; unit: string; unitPrice: number;
    discountPct: number; vatRate: number; isTextRow: boolean;
  }[];
  vatGroups: { rate: number; net: number; vat: number }[];
  net: number;
  vat: number;
  rounding: number;
  total: number;
  company: {
    name: string; org_number?: string | null; vat_number?: string | null;
    address?: string | null; postal_code?: string | null; city?: string | null;
    email?: string | null; phone?: string | null;
    bankgiro?: string | null; plusgiro?: string | null; iban?: string | null; bic?: string | null;
  };
  /**
   * Företagets logotyp som data-URL (PNG/JPG). Saknas den, eller är den en
   * SVG som PDF-motorn inte kan bädda in, skrivs företagsnamnet som förut.
   */
  logoDataUrl?: string | null;
};

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const d = data;
  const title = d.type === "credit" ? "KREDITFAKTURA" : "FAKTURA";
  const lineSum = (r: InvoicePdfData["rows"][number]) =>
    r.quantity * r.unitPrice * (1 - r.discountPct / 100);

  return (
    <Document title={`${title} ${d.invoiceNo}`}>
      <Page size="A4" style={s.page}>
        {/* Huvud */}
        <View style={s.spaceBetween}>
          <View>
            {d.logoDataUrl
              // @react-pdf:s Image är inget HTML-element och tar inget alt
              // eslint-disable-next-line jsx-a11y/alt-text
              ? <Image src={d.logoDataUrl} style={s.logo} />
              : <Text style={s.h1}>{d.company.name}</Text>}
            <Text>{d.company.address}</Text>
            <Text>{d.company.postal_code} {d.company.city}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.h1, { fontSize: 16 }]}>{title}</Text>
            <Text style={s.bold}>Nr {d.invoiceNo}</Text>
            {d.creditsInvoiceNo != null && (
              <Text>Krediterar faktura {d.creditsInvoiceNo}</Text>
            )}
          </View>
        </View>

        {/* Parter & datum */}
        <View style={[s.spaceBetween, s.section]}>
          <View style={{ width: "45%" }}>
            <Text style={s.label}>FAKTURAMOTTAGARE</Text>
            <Text style={s.bold}>{d.customer.name}</Text>
            {d.customer.address ? <Text>{d.customer.address}</Text> : null}
            <Text>{d.customer.postal_code} {d.customer.city}</Text>
            {d.customer.country && d.customer.country !== "SE" ? <Text>{d.customer.country}</Text> : null}
            {d.customer.org_number ? <Text>Org.nr: {d.customer.org_number}</Text> : null}
            {d.customer.vat_number ? <Text>VAT-nr: {d.customer.vat_number}</Text> : null}
          </View>
          <View style={{ width: "45%" }}>
            <View style={s.spaceBetween}><Text style={s.label}>Fakturadatum</Text><Text>{d.invoiceDate}</Text></View>
            <View style={s.spaceBetween}><Text style={s.label}>Förfallodatum</Text><Text style={s.bold}>{d.dueDate}</Text></View>
            <View style={s.spaceBetween}><Text style={s.label}>Betalningsvillkor</Text><Text>{d.paymentTerms} dagar</Text></View>
            <View style={s.spaceBetween}><Text style={s.label}>OCR-nummer</Text><Text>{d.ocr}</Text></View>
            {d.yourReference ? (
              <View style={s.spaceBetween}><Text style={s.label}>Er referens</Text><Text>{d.yourReference}</Text></View>
            ) : null}
            {d.ourReference ? (
              <View style={s.spaceBetween}><Text style={s.label}>Vår referens</Text><Text>{d.ourReference}</Text></View>
            ) : null}
          </View>
        </View>

        {/* Rader */}
        <View style={s.tableHeader}>
          <Text style={s.colDesc}>Beskrivning</Text>
          <Text style={s.colQty}>Antal</Text>
          <Text style={s.colUnit}>Enhet</Text>
          <Text style={s.colPrice}>À-pris</Text>
          <Text style={s.colVat}>Moms</Text>
          <Text style={s.colSum}>Belopp</Text>
        </View>
        {d.rows.map((r, i) =>
          r.isTextRow ? (
            <View key={i} style={s.tableRow}>
              <Text style={s.colDesc}>{r.description}</Text>
            </View>
          ) : (
            <View key={i} style={s.tableRow}>
              <Text style={s.colDesc}>
                {r.description}
                {r.discountPct > 0 ? `  (rabatt ${r.discountPct} %)` : ""}
              </Text>
              <Text style={s.colQty}>{r.quantity}</Text>
              <Text style={s.colUnit}>{r.unit}</Text>
              <Text style={s.colPrice}>{fmt(r.unitPrice)}</Text>
              <Text style={s.colVat}>{r.vatRate} %</Text>
              <Text style={s.colSum}>{fmt(lineSum(r))}</Text>
            </View>
          )
        )}

        {/* Summering med momsspecifikation per sats (momslagens krav) */}
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Netto</Text><Text>{fmt(d.net)} kr</Text>
          </View>
          {d.vatGroups.map((g) => (
            <View key={g.rate} style={s.totalRow}>
              <Text>Moms {g.rate} % (underlag {fmt(g.net)})</Text>
              <Text>{fmt(g.vat)} kr</Text>
            </View>
          ))}
          {d.rounding !== 0 && (
            <View style={s.totalRow}>
              <Text>Öresavrundning</Text><Text>{fmt(d.rounding)} kr</Text>
            </View>
          )}
          <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: "#111", marginTop: 2, paddingTop: 4 }]}>
            <Text style={s.bold}>ATT BETALA</Text>
            <Text style={s.bold}>{fmt(d.total)} kr</Text>
          </View>
        </View>

        {/* Momsfrihets-/omvänd skattskyldighetstext (lagkrav) */}
        {d.vatType === "EU_REVERSE" && (
          <Text style={{ marginTop: 8 }}>
            Omvänd betalningsskyldighet — Reverse charge, Article 196 Council Directive 2006/112/EC.
            Köparens VAT-nr: {d.customer.vat_number}
          </Text>
        )}
        {d.vatType === "EXPORT" && (
          <Text style={{ marginTop: 8 }}>
            Momsfri omsättning utanför EU — Export of services/goods, outside-Community supply.
          </Text>
        )}
        {d.notes ? <Text style={{ marginTop: 8 }}>{d.notes}</Text> : null}

        {/* Betalinfo */}
        {d.type === "debit" && (
          <View style={s.payBox}>
            <View>
              <Text style={s.label}>BETALAS TILL</Text>
              {d.company.bankgiro ? <Text style={s.bold}>Bankgiro: {d.company.bankgiro}</Text> : null}
              {d.company.plusgiro ? <Text>Plusgiro: {d.company.plusgiro}</Text> : null}
              {d.company.iban ? <Text>IBAN: {d.company.iban} {d.company.bic ? `BIC: ${d.company.bic}` : ""}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.label}>OCR</Text>
              <Text style={s.bold}>{d.ocr}</Text>
              <Text style={s.label}>FÖRFALLODATUM</Text>
              <Text style={s.bold}>{d.dueDate}</Text>
            </View>
          </View>
        )}

        {/* Sidfot med lagstadgade företagsuppgifter */}
        <View style={s.footer} fixed>
          <View>
            <Text>{d.company.name}</Text>
            <Text>{d.company.address}, {d.company.postal_code} {d.company.city}</Text>
          </View>
          <View>
            <Text>Org.nr: {d.company.org_number ?? "—"}</Text>
            <Text>VAT-nr: {d.company.vat_number ?? "—"} · Godkänd för F-skatt</Text>
          </View>
          <View>
            <Text>{d.company.email}</Text>
            <Text>{d.company.phone}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
