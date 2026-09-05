/**
 * SIE-import (typ 4E/4I): parser för filer från andra bokföringsprogram.
 * Läser #KONTO, #IB/#UB/#RES, #VER/#TRANS. Avkoda med decodeSieBuffer först.
 */
import iconv from "iconv-lite";

export type SieEncoding = "utf-8" | "cp437" | "win1252";

/**
 * SIE 4B 5.8 föreskriver PC8/CP437, men i praktiken förekommer både UTF-8 och
 * ISO-8859-1/Windows-1252 (äldre svenska program). Fel gissning ger teckenmos
 * rakt in i kontoplan, firmanamn och verifikationstexter — räkenskapsinformation
 * som ska bevaras i läsbar form (BFL 7 kap. 1–2 §).
 *
 * 1. Giltig UTF-8 med multibyte-sekvenser → UTF-8 (svenska CP437-tecken som åäö
 *    bildar inte giltiga UTF-8-sekvenser, så provet är säkert).
 * 2. Annars avgör var de höga byten ligger: svensk text i CP437 har åäöÅÄÖ i
 *    0x80–0x9F, medan Latin-1/CP1252 har dem i 0xC0–0xFF.
 * 3. Ren ASCII avkodas identiskt av alla tre.
 */
export function detectSieEncoding(buffer: Buffer): SieEncoding {
  if (!buffer.some((b) => b >= 0x80)) return "utf-8";
  const utf8 = buffer.toString("utf-8");
  if (!utf8.includes("\ufffd")) return "utf-8";
  let cp437Range = 0;
  let latin1Range = 0;
  for (const b of buffer) {
    if (b >= 0x80 && b <= 0x9f) cp437Range++;
    else if (b >= 0xc0) latin1Range++;
  }
  return latin1Range > cp437Range ? "win1252" : "cp437";
}

/** Avkodar en SIE-fil med den kodning detectSieEncoding pekar ut. */
export function decodeSieBuffer(buffer: Buffer): string {
  const encoding = detectSieEncoding(buffer);
  if (encoding === "utf-8") return buffer.toString("utf-8").replace(/^\ufeff/, "");
  return iconv.decode(buffer, encoding);
}

export type ParsedSie = {
  companyName: string | null;
  orgNumber: string | null;
  fiscalYears: { index: number; start: string; end: string }[];
  accounts: { number: number; name: string }[];
  /** #IB 0 — eller, när filen saknar #IB 0, #UB -1 (SIE 4B 5.16). */
  openingBalances: { account: number; amount: number }[];
  /** Varifrån openingBalances kom, så importen kan berätta det. */
  openingBalancesFrom: "ib" | "ub-previous" | null;
  /** #UB 0 — årets utgående balans. Är nästa års IB (ÅRL 2 kap. 4 § 1 st p. 7). */
  closingBalances: { account: number; amount: number }[];
  /** #IB -1 / #UB -1 / #RES 0 — jämförelseår och resultatkonton. */
  previousOpening: { account: number; amount: number }[];
  previousClosing: { account: number; amount: number }[];
  results: { account: number; amount: number }[];
  verifications: {
    series: string;
    number: number | null;
    date: string;
    description: string;
    rows: { account: number; amount: number }[];
  }[];
  warnings: string[];
};

/**
 * Tokeniserar en SIE-rad: citerade strängar med mellanslag, objektlistor och
 * enkla fält. SIE 4B 5.7: citattecken inuti ett fält föregås av bakstreck
 * (ASCII 92) — "Kassa \"special\"" är ETT fält, inte tre. Utan det kapas
 * fältet vid det första maskerade citattecknet.
 */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\{[^}]*\})|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : (m[2] ?? m[3]));
  }
  return tokens;
}

const isoDate = (d8: string) =>
  `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}`;

export function parseSie(content: string): ParsedSie {
  const result: ParsedSie = {
    companyName: null,
    orgNumber: null,
    fiscalYears: [],
    accounts: [],
    openingBalances: [],
    openingBalancesFrom: null,
    closingBalances: [],
    previousOpening: [],
    previousClosing: [],
    results: [],
    verifications: [],
    warnings: [],
  };

  const lines = content.split(/\r?\n/);
  let currentVer: ParsedSie["verifications"][number] | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line === "{") continue;
    if (line === "}") {
      if (currentVer) {
        const sum = currentVer.rows.reduce((s, r) => s + r.amount, 0);
        if (Math.abs(sum) > 0.005) {
          result.warnings.push(
            `Verifikat ${currentVer.series}${currentVer.number ?? "?"} balanserar inte (${sum.toFixed(2)}) — hoppas över.`);
        } else if (currentVer.rows.length >= 2) {
          result.verifications.push(currentVer);
        }
        currentVer = null;
      }
      continue;
    }

    const tokens = tokenize(line);
    const tag = tokens[0];

    switch (tag) {
      case "#FNAMN":
        result.companyName = tokens[1] ?? null;
        break;
      case "#ORGNR":
        result.orgNumber = tokens[1] ?? null;
        break;
      case "#RAR":
        if (tokens[1] != null && tokens[2] && tokens[3]) {
          result.fiscalYears.push({
            index: parseInt(tokens[1]),
            start: isoDate(tokens[2]),
            end: isoDate(tokens[3]),
          });
        }
        break;
      case "#KONTO": {
        const number = parseInt(tokens[1]);
        if (number >= 1000 && number <= 8999) {
          result.accounts.push({ number, name: tokens[2] ?? String(number) });
        }
        break;
      }
      case "#IB":
      case "#UB":
      case "#RES": {
        // "#IB/#UB/#RES årsnr konto saldo" — årsnr 0 = innevarande år, -1 =
        // föregående. Kreditsaldo anges med negativt belopp (SIE 4B).
        const account = parseInt(tokens[2]);
        const amount = parseFloat(tokens[3]);
        if (isNaN(account) || isNaN(amount) || Math.abs(amount) < 0.005) break;
        const bucket =
          tag === "#IB"
            ? tokens[1] === "0" ? result.openingBalances : tokens[1] === "-1" ? result.previousOpening : null
            : tag === "#UB"
              ? tokens[1] === "0" ? result.closingBalances : tokens[1] === "-1" ? result.previousClosing : null
              : tokens[1] === "0" ? result.results : null;
        if (bucket) bucket.push({ account, amount });
        break;
      }
      case "#VER": {
        // #VER serie vernr datum "text" [regdatum]
        const series = tokens[1] ?? "A";
        const number = tokens[2] ? parseInt(tokens[2]) : null;
        const date = tokens[3] ? isoDate(tokens[3]) : "";
        const description = tokens[4] ?? "Importerat verifikat";
        currentVer = { series, number: isNaN(number ?? NaN) ? null : number, date, description, rows: [] };
        break;
      }
      case "#TRANS": {
        // #TRANS konto {dimensioner} belopp [datum] [text]
        if (currentVer) {
          const account = parseInt(tokens[1]);
          // beloppet är första numeriska token efter dimensionsklamrarna
          const amountToken = tokens.find((t, i) => i >= 2 && !t.startsWith("{") && !isNaN(parseFloat(t)));
          const amount = amountToken ? parseFloat(amountToken) : NaN;
          if (!isNaN(account) && !isNaN(amount)) {
            currentVer.rows.push({ account, amount });
          }
        }
        break;
      }
      // #RTRANS/#BTRANS (rättelsemarkeringar) ignoreras — #TRANS innehåller nettot
    }
  }

  // SIE 4B 5.16: "Either #UB for the previous year or #IB for the current year
  // is to be present." Saknar filen #IB 0 är föregående års #UB -1 årets
  // ingående balans (ÅRL 2 kap. 4 § 1 st p. 7) — annars skulle en spec-enlig
  // fil importeras med noll i ingående balans, utan ett ord till användaren.
  if (result.openingBalances.length > 0) {
    result.openingBalancesFrom = "ib";
  } else if (result.previousClosing.length > 0) {
    result.openingBalances = [...result.previousClosing];
    result.openingBalancesFrom = "ub-previous";
  }

  return result;
}
