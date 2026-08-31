/**
 * Import av kund- och artikelregister från CSV-exporter (Fortnox, Visma m.fl.).
 * Tolerant parser: hittar avgränsare (; eller ,), hanterar citattecken och
 * mappar kolumner på rubriknamn oavsett ordning och exakt benämning.
 */

export function parseCsv(content: string): string[][] {
  const text = content.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** Hitta kolumnindex vars rubrik matchar något av mönstren (skiftlägesokänsligt) */
function findColumn(headers: string[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => pattern.test(h.trim().toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export type ImportedCustomer = {
  name: string; org_number: string | null; email: string | null; phone: string | null;
  address: string | null; postal_code: string | null; city: string | null;
};

export function parseCustomersCsv(content: string): { customers: ImportedCustomer[]; error?: string } {
  const rows = parseCsv(content);
  if (rows.length < 2) return { customers: [], error: "Filen verkar tom (rubrikrad + minst en kund krävs)." };
  const headers = rows[0].map((h) => h.toLowerCase());

  const col = {
    name: findColumn(headers, [/^namn$/, /kundnamn/, /^name$/, /företag/]),
    org: findColumn(headers, [/organisationsnummer/, /orgnr/, /org\.?\s*nr/, /personnummer/]),
    email: findColumn(headers, [/e-?post/, /^email$/, /^e-?mail$/]),
    phone: findColumn(headers, [/^telefon/, /^tel$/, /mobil/, /phone/]),
    address: findColumn(headers, [/^adress/, /besöksadress/, /postadress/, /address/]),
    postal: findColumn(headers, [/postnummer/, /postnr/, /zip/]),
    city: findColumn(headers, [/^ort$/, /postort/, /stad/, /city/]),
  };
  if (col.name < 0) return { customers: [], error: "Hittar ingen namnkolumn — exportera kundregistret med rubrikrad." };

  const get = (row: string[], idx: number) => (idx >= 0 ? row[idx]?.trim() || null : null);
  const customers = rows.slice(1)
    .map((row) => ({
      name: row[col.name]?.trim() ?? "",
      org_number: get(row, col.org),
      email: get(row, col.email),
      phone: get(row, col.phone),
      address: get(row, col.address),
      postal_code: get(row, col.postal),
      city: get(row, col.city),
    }))
    .filter((c) => c.name !== "");
  return { customers };
}

export type ImportedArticle = {
  article_no: string; name: string; unit: string; price: number; vat_rate: number;
};

export function parseArticlesCsv(content: string): { articles: ImportedArticle[]; error?: string } {
  const rows = parseCsv(content);
  if (rows.length < 2) return { articles: [], error: "Filen verkar tom (rubrikrad + minst en artikel krävs)." };
  const headers = rows[0].map((h) => h.toLowerCase());

  const col = {
    no: findColumn(headers, [/artikelnummer/, /artikelnr/, /art\.?\s*nr/, /^nummer$/]),
    name: findColumn(headers, [/benämning/, /beskrivning/, /^namn$/, /^name$/]),
    unit: findColumn(headers, [/^enhet$/, /^unit$/]),
    price: findColumn(headers, [/försäljningspris/, /^pris$/, /pris exkl/, /price/]),
    vat: findColumn(headers, [/moms/, /vat/]),
  };
  if (col.name < 0) return { articles: [], error: "Hittar ingen benämningskolumn — exportera artikelregistret med rubrikrad." };

  const num = (v: string | undefined) =>
    parseFloat((v ?? "").replace(/\s/g, "").replace(",", ".")) || 0;

  const articles = rows.slice(1)
    .map((row, i) => ({
      article_no: (col.no >= 0 ? row[col.no]?.trim() : "") || `IMP-${i + 1}`,
      name: row[col.name]?.trim() ?? "",
      unit: (col.unit >= 0 ? row[col.unit]?.trim() : "") || "st",
      price: num(col.price >= 0 ? row[col.price] : undefined),
      vat_rate: col.vat >= 0 ? (num(row[col.vat]) || 25) : 25,
    }))
    .filter((a) => a.name !== "");
  return { articles };
}
