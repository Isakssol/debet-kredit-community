/**
 * SIE-import (typ 4E/4I): parser för filer från andra bokföringsprogram.
 * Läser #KONTO, #IB, #VER/#TRANS. CP437-avkodning sker innan parsning.
 */

export type ParsedSie = {
  companyName: string | null;
  orgNumber: string | null;
  fiscalYears: { index: number; start: string; end: string }[];
  accounts: { number: number; name: string }[];
  openingBalances: { account: number; amount: number }[];
  verifications: {
    series: string;
    number: number | null;
    date: string;
    description: string;
    rows: { account: number; amount: number }[];
  }[];
  warnings: string[];
};

/** Tokeniserar en SIE-rad: hanterar citerade strängar med mellanslag */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\{[^}]*\})|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
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
      case "#IB": {
        // #IB 0 konto belopp — endast innevarande år (index 0)
        if (tokens[1] === "0") {
          const account = parseInt(tokens[2]);
          const amount = parseFloat(tokens[3]);
          if (!isNaN(account) && !isNaN(amount) && Math.abs(amount) >= 0.005) {
            result.openingBalances.push({ account, amount });
          }
        }
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

  return result;
}
