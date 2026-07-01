import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * Standardlayout för svenska bokföringsrapporter — samma uppställning som
 * etablerade program: företagsnamn + orgnr i sidhuvud, rapporttitel,
 * räkenskapsår/period, utskriftsdatum, "Sida X (Y)" och senaste vernr.
 */

export const rs = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 8, fontFamily: "Helvetica", color: "#111" },
  headerCompany: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  headerMeta: { color: "#444", fontSize: 7.5 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 10 },
  subTitle: { fontSize: 8.5, color: "#333", marginTop: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  sectionHeader: {
    fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 12, marginBottom: 2,
    textTransform: "uppercase",
  },
  subSectionHeader: { fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 1 },
  tableHead: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111",
    paddingBottom: 2, marginBottom: 2, fontFamily: "Helvetica-Bold",
  },
  line: { flexDirection: "row", paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  sumLine: {
    flexDirection: "row", paddingVertical: 2, borderTopWidth: 0.5,
    borderTopColor: "#111", fontFamily: "Helvetica-Bold", marginTop: 1,
  },
  totalLine: {
    flexDirection: "row", paddingVertical: 3, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: "#111", fontFamily: "Helvetica-Bold", marginTop: 6, fontSize: 9,
  },
  colAccount: { width: 40 },
  colName: { flex: 1 },
  colAmount: { width: 80, textAlign: "right" },
  footer: {
    position: "absolute", bottom: 24, left: 40, right: 40,
    borderTopWidth: 0.5, borderTopColor: "#999", paddingTop: 4,
    fontSize: 7, color: "#555", flexDirection: "row", justifyContent: "space-between",
  },
});

export const fmtKr = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type ReportMeta = {
  companyName: string;
  orgNumber: string;
  title: string;
  period: string;        // "2026-01-01 - 2026-12-31"
  fiscalYearLabel: string; // "Räkenskapsår 2026-01-01 - 2026-12-31"
  printedAt: string;     // "2026-07-01 22:45"
  lastVerNo?: string;    // "A 12  B 8  C 4"
  note?: string;         // t.ex. "Preliminär"
};

export function ReportPage({
  meta,
  children,
}: {
  meta: ReportMeta;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={rs.page}>
      {/* Sidhuvud på varje sida */}
      <View fixed>
        <View style={rs.spaceBetween}>
          <View>
            <Text style={rs.headerCompany}>{meta.companyName}</Text>
            <Text style={rs.headerMeta}>Org.nr: {meta.orgNumber}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={rs.headerMeta}>Utskrivet: {meta.printedAt}</Text>
            <Text style={rs.headerMeta} render={({ pageNumber, totalPages }) =>
              `Sida ${pageNumber} (${totalPages})`} />
            {meta.lastVerNo ? <Text style={rs.headerMeta}>Senaste vernr: {meta.lastVerNo}</Text> : null}
          </View>
        </View>
        <Text style={rs.title}>{meta.title}</Text>
        <View style={rs.spaceBetween}>
          <Text style={rs.subTitle}>{meta.fiscalYearLabel}</Text>
          <Text style={rs.subTitle}>{meta.note ?? ""}</Text>
        </View>
        <Text style={[rs.subTitle, { marginBottom: 8 }]}>Period: {meta.period}</Text>
      </View>

      {children}

      <View style={rs.footer} fixed>
        <Text>{meta.companyName} · Org.nr {meta.orgNumber}</Text>
        <Text>{meta.title} · {meta.period}</Text>
      </View>
    </Page>
  );
}

export { Document, Text, View };
