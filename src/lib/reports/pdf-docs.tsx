import { Document, Text, View } from "@react-pdf/renderer";
import { ReportPage, rs, fmtKr, type ReportMeta } from "@/lib/reports/pdf-shared";
import type { AccountLine, LedgerRow } from "@/lib/reports/data";
import { BOX_LABELS, BOX_ORDER } from "@/lib/vat/report";

/* ---------- Resultatrapport (standarduppställning) ---------- */

const RR_SECTIONS: { title: string; from: number; to: number; sumLabel: string; flip: boolean }[] = [
  { title: "Rörelsens intäkter", from: 3000, to: 3999, sumLabel: "Summa rörelsens intäkter", flip: true },
  { title: "Rörelsens kostnader", from: 4000, to: 7699, sumLabel: "Summa rörelsens kostnader", flip: true },
  { title: "Avskrivningar", from: 7700, to: 7899, sumLabel: "Summa avskrivningar", flip: true },
  { title: "Övriga rörelseposter", from: 7900, to: 8299, sumLabel: "Summa övriga rörelseposter", flip: true },
  { title: "Finansiella poster", from: 8300, to: 8899, sumLabel: "Summa finansiella poster", flip: true },
];

export function ResultReportPdf({
  meta,
  lines,
}: {
  meta: ReportMeta;
  lines: AccountLine[];
}) {
  const resultLines = lines.filter((l) => l.class >= 3 && l.account !== 8999);
  let running = 0;

  return (
    <Document title={meta.title}>
      <ReportPage meta={meta}>
        <View style={rs.tableHead}>
          <Text style={rs.colAccount}>Konto</Text>
          <Text style={rs.colName}>Benämning</Text>
          <Text style={rs.colAmount}>Period</Text>
          <Text style={rs.colAmount}>Ackumulerat</Text>
        </View>

        {RR_SECTIONS.map((section) => {
          const sectionLines = resultLines.filter(
            (l) => l.account >= section.from && l.account <= section.to
              && (Math.abs(l.period) >= 0.005 || Math.abs(l.closing) >= 0.005)
          );
          if (!sectionLines.length) return null;
          const sumPeriod = sectionLines.reduce((s, l) => s - l.period, 0);
          const sumAcc = sectionLines.reduce((s, l) => s - l.closing, 0);
          running += sumAcc;
          return (
            <View key={section.title}>
              <Text style={rs.sectionHeader}>{section.title}</Text>
              {sectionLines.map((l) => (
                <View key={l.account} style={rs.line}>
                  <Text style={rs.colAccount}>{l.account}</Text>
                  <Text style={rs.colName}>{l.name}</Text>
                  <Text style={rs.colAmount}>{fmtKr(-l.period)}</Text>
                  <Text style={rs.colAmount}>{fmtKr(-l.closing)}</Text>
                </View>
              ))}
              <View style={rs.sumLine}>
                <Text style={rs.colAccount} />
                <Text style={rs.colName}>{section.sumLabel}</Text>
                <Text style={rs.colAmount}>{fmtKr(sumPeriod)}</Text>
                <Text style={rs.colAmount}>{fmtKr(sumAcc)}</Text>
              </View>
            </View>
          );
        })}

        <View style={rs.totalLine}>
          <Text style={rs.colAccount} />
          <Text style={rs.colName}>BERÄKNAT RESULTAT</Text>
          <Text style={rs.colAmount}>
            {fmtKr(resultLines.reduce((s, l) => s - l.period, 0))}
          </Text>
          <Text style={rs.colAmount}>{fmtKr(running)}</Text>
        </View>
      </ReportPage>
    </Document>
  );
}

/* ---------- Balansrapport (IB / Period / UB) ---------- */

const BR_SECTIONS: { title: string; sub: { title: string; from: number; to: number }[]; flip: boolean }[] = [
  {
    title: "TILLGÅNGAR",
    flip: false,
    sub: [
      { title: "Anläggningstillgångar", from: 1000, to: 1399 },
      { title: "Omsättningstillgångar", from: 1400, to: 1999 },
    ],
  },
  {
    title: "EGET KAPITAL OCH SKULDER",
    flip: true,
    sub: [
      { title: "Eget kapital", from: 2000, to: 2099 },
      { title: "Obeskattade reserver och avsättningar", from: 2100, to: 2299 },
      { title: "Långfristiga skulder", from: 2300, to: 2399 },
      { title: "Kortfristiga skulder", from: 2400, to: 2999 },
    ],
  },
];

export function BalanceReportPdf({
  meta,
  lines,
  computedResult,
}: {
  meta: ReportMeta;
  lines: AccountLine[];
  computedResult: number;
}) {
  const balanceLines = lines.filter((l) => l.class <= 2);

  return (
    <Document title={meta.title}>
      <ReportPage meta={meta}>
        <View style={rs.tableHead}>
          <Text style={rs.colAccount}>Konto</Text>
          <Text style={rs.colName}>Benämning</Text>
          <Text style={rs.colAmount}>Ing balans</Text>
          <Text style={rs.colAmount}>Period</Text>
          <Text style={rs.colAmount}>Utg balans</Text>
        </View>

        {BR_SECTIONS.map((section) => {
          const f = section.flip ? -1 : 1;
          let secOpen = 0, secPeriod = 0, secClose = 0;
          const subViews = section.sub.map((sub) => {
            const subLines = balanceLines.filter(
              (l) => l.account >= sub.from && l.account <= sub.to
                && (Math.abs(l.opening) >= 0.005 || Math.abs(l.closing) >= 0.005 || Math.abs(l.period) >= 0.005)
            );
            if (!subLines.length) return null;
            const so = subLines.reduce((s, l) => s + f * l.opening, 0);
            const sp = subLines.reduce((s, l) => s + f * l.period, 0);
            const sc = subLines.reduce((s, l) => s + f * l.closing, 0);
            secOpen += so; secPeriod += sp; secClose += sc;
            return (
              <View key={sub.title}>
                <Text style={rs.subSectionHeader}>{sub.title}</Text>
                {subLines.map((l) => (
                  <View key={l.account} style={rs.line}>
                    <Text style={rs.colAccount}>{l.account}</Text>
                    <Text style={rs.colName}>{l.name}</Text>
                    <Text style={rs.colAmount}>{fmtKr(f * l.opening)}</Text>
                    <Text style={rs.colAmount}>{fmtKr(f * l.period)}</Text>
                    <Text style={rs.colAmount}>{fmtKr(f * l.closing)}</Text>
                  </View>
                ))}
                <View style={rs.sumLine}>
                  <Text style={rs.colAccount} />
                  <Text style={rs.colName}>Summa {sub.title.toLowerCase()}</Text>
                  <Text style={rs.colAmount}>{fmtKr(so)}</Text>
                  <Text style={rs.colAmount}>{fmtKr(sp)}</Text>
                  <Text style={rs.colAmount}>{fmtKr(sc)}</Text>
                </View>
              </View>
            );
          });

          const isEkSection = section.flip;
          return (
            <View key={section.title}>
              <Text style={rs.sectionHeader}>{section.title}</Text>
              {subViews}
              {isEkSection && Math.abs(computedResult) >= 0.005 && (
                <View style={rs.line}>
                  <Text style={rs.colAccount} />
                  <Text style={rs.colName}>Beräknat resultat</Text>
                  <Text style={rs.colAmount}>{fmtKr(0)}</Text>
                  <Text style={rs.colAmount}>{fmtKr(computedResult)}</Text>
                  <Text style={rs.colAmount}>{fmtKr(computedResult)}</Text>
                </View>
              )}
              <View style={rs.totalLine}>
                <Text style={rs.colAccount} />
                <Text style={rs.colName}>SUMMA {section.title}</Text>
                <Text style={rs.colAmount}>{fmtKr(secOpen)}</Text>
                <Text style={rs.colAmount}>{fmtKr(secPeriod + (isEkSection ? computedResult : 0))}</Text>
                <Text style={rs.colAmount}>{fmtKr(secClose + (isEkSection ? computedResult : 0))}</Text>
              </View>
            </View>
          );
        })}
      </ReportPage>
    </Document>
  );
}

/* ---------- Huvudbok ---------- */

export function LedgerPdf({
  meta,
  rows,
  openings,
}: {
  meta: ReportMeta;
  rows: LedgerRow[];
  openings: Map<number, number>;
}) {
  const byAccount = new Map<number, LedgerRow[]>();
  for (const r of rows) {
    if (!byAccount.has(r.account)) byAccount.set(r.account, []);
    byAccount.get(r.account)!.push(r);
  }

  return (
    <Document title={meta.title}>
      <ReportPage meta={meta}>
        {[...byAccount.entries()].map(([account, accountRows]) => {
          let saldo = openings.get(account) ?? 0;
          const opening = saldo;
          return (
            <View key={account} wrap={false} style={{ marginBottom: 8 }}>
              <Text style={rs.subSectionHeader}>
                {account} {accountRows[0].accountName}
              </Text>
              <View style={rs.tableHead}>
                <Text style={{ width: 50 }}>Ver</Text>
                <Text style={{ width: 55 }}>Datum</Text>
                <Text style={rs.colName}>Text</Text>
                <Text style={rs.colAmount}>Debet</Text>
                <Text style={rs.colAmount}>Kredit</Text>
                <Text style={rs.colAmount}>Saldo</Text>
              </View>
              {opening !== 0 && (
                <View style={rs.line}>
                  <Text style={{ width: 50 }} />
                  <Text style={{ width: 55 }} />
                  <Text style={rs.colName}>Ingående balans</Text>
                  <Text style={rs.colAmount} />
                  <Text style={rs.colAmount} />
                  <Text style={rs.colAmount}>{fmtKr(opening)}</Text>
                </View>
              )}
              {accountRows.map((r, i) => {
                saldo += r.debit - r.credit;
                return (
                  <View key={i} style={rs.line}>
                    <Text style={{ width: 50 }}>{r.ver}</Text>
                    <Text style={{ width: 55 }}>{r.date}</Text>
                    <Text style={rs.colName}>{r.description.slice(0, 45)}</Text>
                    <Text style={rs.colAmount}>{r.debit > 0 ? fmtKr(r.debit) : ""}</Text>
                    <Text style={rs.colAmount}>{r.credit > 0 ? fmtKr(r.credit) : ""}</Text>
                    <Text style={rs.colAmount}>{fmtKr(saldo)}</Text>
                  </View>
                );
              })}
              <View style={rs.sumLine}>
                <Text style={{ width: 50 }} />
                <Text style={{ width: 55 }} />
                <Text style={rs.colName}>Utgående saldo</Text>
                <Text style={rs.colAmount}>
                  {fmtKr(accountRows.reduce((s, r) => s + r.debit, 0))}
                </Text>
                <Text style={rs.colAmount}>
                  {fmtKr(accountRows.reduce((s, r) => s + r.credit, 0))}
                </Text>
                <Text style={rs.colAmount}>{fmtKr(saldo)}</Text>
              </View>
            </View>
          );
        })}
      </ReportPage>
    </Document>
  );
}

/* ---------- Verifikationslista ---------- */

export type VerListItem = {
  ver: string;
  date: string;
  registered: string;
  description: string;
  rows: { account: number; accountName: string; debit: number; credit: number }[];
};

export function VerificationListPdf({
  meta,
  verifications,
}: {
  meta: ReportMeta;
  verifications: VerListItem[];
}) {
  return (
    <Document title={meta.title}>
      <ReportPage meta={meta}>
        {verifications.map((v) => (
          <View key={v.ver} wrap={false} style={{ marginBottom: 6 }}>
            <View style={[rs.row, { backgroundColor: "#f3f3f3", padding: 2 }]}>
              <Text style={[rs.bold, { width: 50 }]}>{v.ver}</Text>
              <Text style={{ width: 60 }}>{v.date}</Text>
              <Text style={rs.colName}>{v.description}</Text>
              <Text style={rs.headerMeta}>Reg: {v.registered}</Text>
            </View>
            {v.rows.map((r, i) => (
              <View key={i} style={rs.line}>
                <Text style={{ width: 50 }} />
                <Text style={rs.colAccount}>{r.account}</Text>
                <Text style={rs.colName}>{r.accountName}</Text>
                <Text style={rs.colAmount}>{r.debit > 0 ? fmtKr(r.debit) : ""}</Text>
                <Text style={rs.colAmount}>{r.credit > 0 ? fmtKr(r.credit) : ""}</Text>
              </View>
            ))}
          </View>
        ))}
      </ReportPage>
    </Document>
  );
}

/* ---------- Kund-/leverantörsreskontra ---------- */

export type ReskontraItem = {
  number: string;
  counterparty: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  paid: number;
  remaining: number;
  status: string;
};

export function ReskontraPdf({
  meta,
  items,
  kind,
}: {
  meta: ReportMeta;
  items: ReskontraItem[];
  kind: "kund" | "leverantör";
}) {
  const totalRemaining = items.reduce((s, i) => s + i.remaining, 0);
  return (
    <Document title={meta.title}>
      <ReportPage meta={meta}>
        <View style={rs.tableHead}>
          <Text style={{ width: 50 }}>{kind === "kund" ? "Fakt.nr" : "Fakt.nr"}</Text>
          <Text style={rs.colName}>{kind === "kund" ? "Kund" : "Leverantör"}</Text>
          <Text style={{ width: 55 }}>Fakt.datum</Text>
          <Text style={{ width: 55 }}>Förfaller</Text>
          <Text style={rs.colAmount}>Belopp</Text>
          <Text style={rs.colAmount}>Betalt</Text>
          <Text style={rs.colAmount}>Rest</Text>
        </View>
        {items.map((i, idx) => (
          <View key={idx} style={rs.line}>
            <Text style={{ width: 50 }}>{i.number}</Text>
            <Text style={rs.colName}>{i.counterparty}</Text>
            <Text style={{ width: 55 }}>{i.invoiceDate}</Text>
            <Text style={{ width: 55 }}>{i.dueDate}</Text>
            <Text style={rs.colAmount}>{fmtKr(i.total)}</Text>
            <Text style={rs.colAmount}>{fmtKr(i.paid)}</Text>
            <Text style={rs.colAmount}>{fmtKr(i.remaining)}</Text>
          </View>
        ))}
        <View style={rs.totalLine}>
          <Text style={rs.colName}>SUMMA UTESTÅENDE</Text>
          <Text style={rs.colAmount}>{fmtKr(totalRemaining)}</Text>
        </View>
      </ReportPage>
    </Document>
  );
}

/* ---------- NE-underlag (förenklat årsbokslut + NE-bilagans huvudposter) ---------- */

export function NeReportPdf({
  meta,
  bFields,
  rFields,
  bookedResult,
}: {
  meta: ReportMeta;
  bFields: { field: string; label: string; value: number }[];
  rFields: { field: string; label: string; value: number }[];
  bookedResult: number;
}) {
  const kr = (n: number) => Math.round(n).toLocaleString("sv-SE");
  return (
    <Document title={meta.title}>
      <ReportPage meta={meta}>
        <Text style={rs.sectionHeader}>Balansräkning (förenklat årsbokslut / NE sid 1)</Text>
        <View style={rs.tableHead}>
          <Text style={{ width: 40 }}>Ruta</Text>
          <Text style={rs.colName}>Post</Text>
          <Text style={rs.colAmount}>Belopp (kr)</Text>
        </View>
        {bFields.map((f) => (
          <View key={f.field} style={rs.line}>
            <Text style={{ width: 40 }}>{f.field}</Text>
            <Text style={rs.colName}>{f.label}</Text>
            <Text style={rs.colAmount}>{kr(f.value)}</Text>
          </View>
        ))}

        <Text style={rs.sectionHeader}>Resultaträkning</Text>
        <View style={rs.tableHead}>
          <Text style={{ width: 40 }}>Ruta</Text>
          <Text style={rs.colName}>Post</Text>
          <Text style={rs.colAmount}>Belopp (kr)</Text>
        </View>
        {rFields.map((f) => (
          <View key={f.field} style={rs.line}>
            <Text style={{ width: 40 }}>{f.field}</Text>
            <Text style={rs.colName}>{f.label}</Text>
            <Text style={rs.colAmount}>{kr(f.value)}</Text>
          </View>
        ))}
        <View style={rs.totalLine}>
          <Text style={{ width: 40 }}>R11</Text>
          <Text style={rs.colName}>BOKFÖRT RESULTAT</Text>
          <Text style={rs.colAmount}>{kr(bookedResult)}</Text>
        </View>

        <Text style={[rs.headerMeta, { marginTop: 12 }]}>
          Skattemässiga justeringar (R13–R48) inkl. periodiseringsfond, räntefördelning och
          schablonavdrag för egenavgifter (R43, 25 %) förs in i NE-bilagan på skatteverket.se.
          Underlaget ovan motsvarar blankett SKV 2150 (förenklat årsbokslut) och NE sid 1–2.
        </Text>
      </ReportPage>
    </Document>
  );
}

/* ---------- Momsrapport ---------- */

export function VatReportPdf({
  meta,
  boxes,
}: {
  meta: ReportMeta;
  boxes: Record<string, number>;
}) {
  return (
    <Document title={meta.title}>
      <ReportPage meta={meta}>
        <View style={rs.tableHead}>
          <Text style={{ width: 40 }}>Ruta</Text>
          <Text style={rs.colName}>Beskrivning</Text>
          <Text style={rs.colAmount}>Belopp (kr)</Text>
        </View>
        {BOX_ORDER.filter((b) => (boxes[b] ?? 0) !== 0 || b === "49").map((box) => (
          <View key={box} style={box === "49" ? rs.totalLine : rs.line}>
            <Text style={{ width: 40 }}>{box}</Text>
            <Text style={rs.colName}>{BOX_LABELS[box]}</Text>
            <Text style={rs.colAmount}>{(boxes[box] ?? 0).toLocaleString("sv-SE")}</Text>
          </View>
        ))}
      </ReportPage>
    </Document>
  );
}
