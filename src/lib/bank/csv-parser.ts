/**
 * CSV-parser för kontoutdrag från svenska banker.
 * Autodetekterar format från kolumnrubrikerna — Swedbank, Nordea, SEB,
 * Handelsbanken och ett generiskt format (datum;text;belopp).
 */

export type ParsedBankTransaction = {
  bookingDate: string; // YYYY-MM-DD
  amount: number;      // positivt = insättning
  description: string;
  balanceAfter: number | null;
};

export type CsvParseResult = {
  bank: string;
  transactions: ParsedBankTransaction[];
  warnings: string[];
};

/** Robust CSV-radsplittning med stöd för citerade fält */
function splitCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseSwedishAmount(raw: string): number {
  // "1 234,56", "-1234.56", "1.234,56 kr"
  const cleaned = raw
    .replace(/kr/gi, "")
    .replace(/\s/g, "")
    .replace(/ /g, "");
  // Om både . och , finns: . är tusentalsavgränsare
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return parseFloat(normalized);
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim().replace(/"/g, "");
  // YYYY-MM-DD eller YYYY/MM/DD
  let m = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD.MM.YYYY eller DD/MM/YYYY (Nordea)
  m = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

type ColumnMap = {
  bank: string;
  date: string[];       // kandidat-rubriker (case-insensitive, delsträng)
  text: string[];
  amount: string[];
  balance: string[];
};

const BANK_FORMATS: ColumnMap[] = [
  {
    bank: "Swedbank",
    date: ["transaktionsdag", "bokföringsdag"],
    text: ["beskrivning", "referens"],
    amount: ["belopp"],
    balance: ["bokfört saldo", "saldo"],
  },
  {
    bank: "Nordea",
    date: ["bokföringsdag", "bokforingsdag", "datum"],
    text: ["rubrik", "titel", "meddelande", "mottagarnamn"],
    amount: ["belopp"],
    balance: ["saldo"],
  },
  {
    bank: "SEB",
    date: ["bokföringsdatum", "bokfdag", "datum"],
    text: ["text", "verifikationsnummer"],
    amount: ["belopp"],
    balance: ["saldo"],
  },
  {
    bank: "Handelsbanken",
    date: ["reskontradatum", "transaktionsdatum", "datum"],
    text: ["text"],
    amount: ["belopp"],
    balance: ["saldo"],
  },
  {
    bank: "Generisk",
    date: ["datum", "date"],
    text: ["text", "beskrivning", "description", "meddelande"],
    amount: ["belopp", "amount", "summa"],
    balance: ["saldo", "balance"],
  },
];

export function parseBankCsv(content: string): CsvParseResult {
  const warnings: string[] = [];
  // Skippa ev. metadata-rader före rubrikraden (Swedbank har några)
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const sep = lines.some((l) => l.includes(";")) ? ";" : ",";

  // Hitta rubrikraden och bankformatet med bäst poäng (flest matchande kolumner)
  let headerIdx = -1;
  let format: ColumnMap | null = null;
  let cols: string[] = [];
  let bestScore = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const candidate = splitCsvLine(lines[i], sep).map((c) => c.toLowerCase().replace(/"/g, ""));
    for (const f of BANK_FORMATS) {
      const hasDate = candidate.some((c) => f.date.some((d) => c.includes(d)));
      const hasAmount = candidate.some((c) => f.amount.some((a) => c.includes(a)));
      if (!hasDate || !hasAmount) continue;
      const textHits = candidate.filter((c) => f.text.some((t) => c.includes(t))).length;
      const balanceHit = candidate.some((c) => f.balance.some((b) => c.includes(b))) ? 1 : 0;
      const score = 2 + textHits * 2 + balanceHit;
      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
        format = f;
        cols = candidate;
      }
    }
    if (format) break; // första raden som matchar något format är rubrikraden
  }

  if (!format || headerIdx < 0) {
    return { bank: "okänd", transactions: [], warnings: ["Kunde inte känna igen kolumnrubrikerna — kontrollera att filen är ett kontoutdrag (CSV) med rubrikrad."] };
  }

  const findCol = (candidates: string[]) =>
    cols.findIndex((c) => candidates.some((k) => c.includes(k)));
  const dateCol = findCol(format.date);
  const amountCol = findCol(format.amount);
  const balanceCol = findCol(format.balance);
  // Text: slå ihop alla textkolumner som matchar
  const textCols = cols
    .map((c, i) => (format!.text.some((t) => c.includes(t)) ? i : -1))
    .filter((i) => i >= 0);

  const transactions: ParsedBankTransaction[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], sep);
    if (fields.length < 2) continue;
    const date = normalizeDate(fields[dateCol] ?? "");
    const amount = parseSwedishAmount(fields[amountCol] ?? "");
    if (!date || isNaN(amount)) {
      if (fields.some((f) => f)) warnings.push(`Rad ${i + 1} kunde inte tolkas — hoppades över.`);
      continue;
    }
    const description = textCols
      .map((c) => fields[c]?.replace(/"/g, "").trim())
      .filter(Boolean)
      .join(" — ") || "Banktransaktion";
    const balanceRaw = balanceCol >= 0 ? parseSwedishAmount(fields[balanceCol] ?? "") : NaN;
    transactions.push({
      bookingDate: date,
      amount,
      description,
      balanceAfter: isNaN(balanceRaw) ? null : balanceRaw,
    });
  }

  return { bank: format.bank, transactions, warnings };
}
