/**
 * SIE 4E-export enligt SIE-gruppens specifikation (sie.se).
 * Textfil i PC8/CP437-kodning — standardformatet som alla svenska
 * bokföringsprogram, revisorer och skatteprogram läser.
 */

export type SieData = {
  companyName: string;
  orgNumber: string;
  generatedDate: string; // YYYYMMDD
  fiscalYear: { year: number; start: string; end: string };
  previousYear?: { year: number; start: string; end: string };
  accounts: { number: number; name: string; sru?: number | null }[];
  openingBalances: { account: number; amount: number }[];   // #IB 0 — balanskonton
  closingBalances: { account: number; amount: number }[];   // #UB 0 — balanskonton
  results: { account: number; amount: number }[];           // #RES 0 — resultatkonton
  previousOpening?: { account: number; amount: number }[];  // #IB -1
  previousClosing?: { account: number; amount: number }[];
  previousResults?: { account: number; amount: number }[];
  verifications: {
    series: string;
    number: number;
    date: string; // YYYYMMDD
    description: string;
    registeredDate: string;
    rows: { account: number; amount: number; note?: string }[];
  }[];
};

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;
const d8 = (iso: string) => iso.replace(/-/g, "");
const amt = (n: number) => n.toFixed(2);

export function generateSie4(data: SieData): string {
  const lines: string[] = [];
  lines.push("#FLAGGA 0");
  lines.push(`#PROGRAM ${q("Debet & Kredit")} 1.0`);
  lines.push("#FORMAT PC8");
  lines.push(`#GEN ${data.generatedDate}`);
  lines.push("#SIETYP 4");
  lines.push(`#FNAMN ${q(data.companyName)}`);
  lines.push(`#ORGNR ${data.orgNumber}`);
  lines.push(`#RAR 0 ${d8(data.fiscalYear.start)} ${d8(data.fiscalYear.end)}`);
  if (data.previousYear) {
    lines.push(`#RAR -1 ${d8(data.previousYear.start)} ${d8(data.previousYear.end)}`);
  }
  lines.push("#KPTYP BAS2026");
  lines.push("");

  for (const a of data.accounts) {
    lines.push(`#KONTO ${a.number} ${q(a.name)}`);
  }
  for (const a of data.accounts) {
    if (a.sru) lines.push(`#SRU ${a.number} ${a.sru}`);
  }
  lines.push("");

  for (const b of data.openingBalances) {
    lines.push(`#IB 0 ${b.account} ${amt(b.amount)}`);
  }
  for (const b of data.closingBalances) {
    lines.push(`#UB 0 ${b.account} ${amt(b.amount)}`);
  }
  for (const r of data.results) {
    lines.push(`#RES 0 ${r.account} ${amt(r.amount)}`);
  }
  if (data.previousOpening) {
    for (const b of data.previousOpening) lines.push(`#IB -1 ${b.account} ${amt(b.amount)}`);
  }
  if (data.previousClosing) {
    for (const b of data.previousClosing) lines.push(`#UB -1 ${b.account} ${amt(b.amount)}`);
  }
  if (data.previousResults) {
    for (const r of data.previousResults) lines.push(`#RES -1 ${r.account} ${amt(r.amount)}`);
  }
  lines.push("");

  for (const v of data.verifications) {
    lines.push(`#VER ${v.series} ${v.number} ${d8(v.date)} ${q(v.description)} ${d8(v.registeredDate)}`);
    lines.push("{");
    for (const row of v.rows) {
      lines.push(`   #TRANS ${row.account} {} ${amt(row.amount)}${row.note ? ` "" ${q(row.note)}` : ""}`);
    }
    lines.push("}");
  }

  return lines.join("\r\n") + "\r\n";
}
