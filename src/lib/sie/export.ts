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

/**
 * PC8/CP437 (SIE 4B 5.8: "The character set used in the file is to be IBM PC
 * 8-bits extended ASCII (Codepage 437)"). Filen kodas med iconv till CP437 när
 * den skrivs (export/sie och export/arkiv) — tecken som saknas i CP437 blir då
 * tyst "?". Räkenskapsinformation ska bevaras i läsbar form (BFL 7 kap. 1–2 §),
 * så vi translittererar medvetet HÄR i stället, innan raderna byggs. Då är
 * kodningen förlustfri per konstruktion.
 */
const CP437_HIGH =
  "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5" +
  "\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192" +
  "\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb" +
  "\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510" +
  "\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567" +
  "\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580" +
  "\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229" +
  "\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0";

const PC8_CHARS = new Set<string>(CP437_HIGH.split(""));
for (let c = 32; c < 127; c++) PC8_CHARS.add(String.fromCharCode(c));

/** Typografiska tecken som saknas i CP437 men har en entydig PC8-motsvarighet. */
const PC8_SUBSTITUTIONS: [RegExp, string][] = [
  [/[\u2010-\u2015\u2212]/g, "-"],                    // bindestreck, tankstreck, minus
  [/[\u2018\u2019\u201a\u201b\u2032]/g, "'"],        // enkla typografiska citattecken
  [/[\u201c\u201d\u201e\u201f\u2033]/g, '"'],        // dubbla typografiska citattecken
  [/\u2026/g, "..."],
  [/\u20ac/g, "EUR"],
  [/\u00a0|[\u2000-\u200a]|\u202f/g, " "],            // hårda och typografiska mellanslag
  [/[\u200b-\u200d\ufeff]/g, ""],                     // nollbreddstecken
  [/\u00c6/g, "AE"], [/\u00e6/g, "ae"],
  [/\u0152/g, "OE"], [/\u0153/g, "oe"],
  [/\u00d8/g, "O"], [/\u00f8/g, "o"],
  [/\u0141/g, "L"], [/\u0142/g, "l"],
  [/\u0110/g, "D"], [/\u0111/g, "d"],
  [/\u00de/g, "TH"], [/\u00fe/g, "th"],
  [/\u00d0/g, "D"], [/\u00f0/g, "d"],
];

/**
 * Translittererar en textsträng till tecken som ryms i PC8/CP437.
 * Radbrytningar och tabb lämnas orörda — de är postavskiljare i filen, inte
 * innehåll; q() rensar dem ur textfälten.
 */
export function toPc8(text: string): string {
  let out = text;
  for (const [re, to] of PC8_SUBSTITUTIONS) out = out.replace(re, to);
  // Kvarvarande latinska bokstäver med diakriter som CP437 saknar (ā, ć, ž …)
  // tappar sitt diakritiska tecken i stället för hela bokstaven.
  return [...out]
    .map((ch) => {
      if (PC8_CHARS.has(ch) || ch === "\r" || ch === "\n" || ch === "\t") return ch;
      const stripped = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return stripped.length > 0 && [...stripped].every((c) => PC8_CHARS.has(c)) ? stripped : "?";
    })
    .join("");
}

/**
 * Citerat textfält. SIE 4B 5.7: "Quotation marks in export fields are to be
 * preceded by a backslash (ASCII 92)." Specens eget exempel (10.15):
 * #KONTO 1915 "Kassa \"special\"". Att i stället BYTA UT citattecknet mot en
 * apostrof förvanskar räkenskapsinformationen (BFL 7 kap. 1–2 §).
 */
const q = (s: string) =>
  `"${toPc8(s)
    // SIE 5.7: "There are to be no control characters in text strings."
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;
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

  // Skyddsnät: även fält som inte går genom q() (orgnr m.m.) ska rymmas i PC8.
  return toPc8(lines.join("\r\n") + "\r\n");
}
