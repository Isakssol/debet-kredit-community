import { kronorToOre, oreToKronor } from "@/lib/money";

/**
 * Momsdeklarationens rutor beräknas från kontonas momskoder.
 * Underlagsrutor (05, 20–24, 35–42) hämtas från intäkts-/inköpskonton,
 * momsrutor (10–12, 30–32, 48, 49) från momskontona.
 * Beloppen anges i HELA KRONOR i deklarationen (öretal slopas).
 */

export type VatEntry = {
  account: number;
  vat_code: string | null;
  debit: number;
  credit: number;
};

export type VatBoxes = Record<string, number>;

// momskod → underlagsruta
const UNDERLAG_BOX: Record<string, string> = {
  SALES_25: "05", SALES_12: "05", SALES_6: "05",
  SALES_EU_GOODS: "35", SALES_EU_SERVICES: "39",
  SALES_EXPORT: "36", SALES_SERVICES_XEU: "40", SALES_EXEMPT: "42",
  PURCHASE_EU_GOODS: "20", PURCHASE_EU_SERVICES: "21", PURCHASE_SERVICES_XEU: "22",
};

// momskonto → momsruta
const VAT_ACCOUNT_BOX: Record<number, string> = {
  2611: "10", 2621: "11", 2631: "12",
  2614: "30",
  // Hela BAS-familjen för ingående moms — 2641 "Debiterad ingående moms" är
  // standardkontot i Fortnox-/Visma-exporter och måste träffa ruta 48.
  2640: "48", 2641: "48", 2642: "48", 2645: "48", 2647: "48", 2648: "48", 2649: "48",
};

const OUTPUT_BOXES = ["10", "11", "12", "30", "31", "32", "60", "61", "62"];

export function computeVatBoxes(entries: VatEntry[]): {
  boxes: VatBoxes;
  exact: { account: number; balance: number }[]; // exakta saldon för omföringsverifikatet
} {
  const oreBoxes = new Map<string, number>();
  const accountBalances = new Map<number, number>();

  for (const e of entries) {
    const debit = kronorToOre(Number(e.debit));
    const credit = kronorToOre(Number(e.credit));

    // Underlag: intäktskonton (kreditsaldo → positivt), inköpskonton (debetsaldo → positivt)
    if (e.vat_code && UNDERLAG_BOX[e.vat_code]) {
      const box = UNDERLAG_BOX[e.vat_code];
      const isPurchase = e.vat_code.startsWith("PURCHASE");
      const amount = isPurchase ? debit - credit : credit - debit;
      oreBoxes.set(box, (oreBoxes.get(box) ?? 0) + amount);
    }

    // Momskonton: samla exakta saldon + rutbelopp
    if (VAT_ACCOUNT_BOX[e.account]) {
      const box = VAT_ACCOUNT_BOX[e.account];
      const isInput = box === "48";
      const amount = isInput ? debit - credit : credit - debit;
      oreBoxes.set(box, (oreBoxes.get(box) ?? 0) + amount);
      accountBalances.set(e.account, (accountBalances.get(e.account) ?? 0) + debit - credit);
    }
  }

  // Omvänd skattskyldighet: om utgående moms (ruta 30) finns men underlaget
  // inte fångats via 45xx-konton (t.ex. EU-inköp bokfört direkt på 1220 som
  // inventarie) härleds underlaget från momsen och läggs i ruta 20.
  const reverseVat = oreBoxes.get("30") ?? 0;
  const reverseBase = ["20", "21", "22", "23", "24"]
    .reduce((s, b) => s + (oreBoxes.get(b) ?? 0), 0);
  const expectedBase = Math.round(reverseVat / 0.25);
  if (reverseVat > 0 && expectedBase - reverseBase > 100) {
    oreBoxes.set("20", (oreBoxes.get("20") ?? 0) + (expectedBase - reverseBase));
  }

  // Hela kronor, öretal slopas (Skatteverkets regel)
  const boxes: VatBoxes = {};
  for (const [box, ore] of oreBoxes) {
    boxes[box] = Math.trunc(oreToKronor(ore));
  }

  // Ruta 49 = utgående moms − ingående moms
  const output = OUTPUT_BOXES.reduce((s, b) => s + (boxes[b] ?? 0), 0);
  boxes["49"] = output - (boxes["48"] ?? 0);

  return {
    boxes,
    exact: [...accountBalances.entries()].map(([account, ore]) => ({
      account,
      balance: oreToKronor(ore),
    })),
  };
}

/** Omföringsverifikat: nollställ momskontona mot 2650 */
export function vatClosingRows(
  exact: { account: number; balance: number }[]
): { account: number; debit: number; credit: number; note?: string }[] {
  const rows: { account: number; debit: number; credit: number; note?: string }[] = [];
  let net = 0; // positivt = momsskuld

  for (const { account, balance } of exact) {
    if (Math.abs(balance) < 0.005) continue;
    if (balance < 0) {
      // kreditsaldo (utgående moms) → debiteras bort
      rows.push({ account, debit: -balance, credit: 0 });
      net += -balance;
    } else {
      // debetsaldo (ingående moms) → krediteras bort
      rows.push({ account, debit: 0, credit: balance });
      net -= balance;
    }
  }
  if (rows.length === 0) return [];
  if (net > 0) {
    rows.push({ account: 2650, debit: 0, credit: net, note: "Moms att betala" });
  } else if (net < 0) {
    rows.push({ account: 2650, debit: -net, credit: 0, note: "Moms att få tillbaka" });
  }
  return rows;
}

/** Momsperioder för ett kalenderår utifrån inställningen */
export function vatPeriods(
  year: number,
  vatPeriod: "manad" | "kvartal" | "helar",
  euTrade: boolean
): { start: string; end: string; label: string; dueDate: string }[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

  // Deklarationsdag: 12:e i andra månaden efter periodens slut (17:e i jan/aug)
  const dueFor = (endMonth: number): string => {
    let dy = year, dm = endMonth + 2;
    if (dm > 12) { dm -= 12; dy += 1; }
    const day = dm === 1 || dm === 8 ? 17 : 12;
    return `${dy}-${pad(dm)}-${pad(day)}`;
  };

  if (vatPeriod === "helar") {
    // Utan EU-handel: 12 maj året efter; med EU-handel: 26 februari året efter
    return [{
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: `Helår ${year}`,
      dueDate: euTrade ? `${year + 1}-02-26` : `${year + 1}-05-12`,
    }];
  }
  if (vatPeriod === "kvartal") {
    return [1, 2, 3, 4].map((q) => {
      const startM = (q - 1) * 3 + 1;
      const endM = q * 3;
      return {
        start: `${year}-${pad(startM)}-01`,
        end: `${year}-${pad(endM)}-${pad(lastDay(year, endM))}`,
        label: `Kvartal ${q} ${year}`,
        dueDate: dueFor(endM),
      };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      start: `${year}-${pad(m)}-01`,
      end: `${year}-${pad(m)}-${pad(lastDay(year, m))}`,
      label: `${["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"][i]} ${year}`,
      dueDate: dueFor(m),
    };
  });
}

/**
 * Rimlighetskontroller av momsrapporten (branschstandard):
 * utgående moms ska motsvara momssatsen på underlaget per skattesats.
 */
export function computeVatChecks(entries: VatEntry[]): { label: string; ok: boolean; detail: string }[] {
  const underlagByRate = new Map<number, number>(); // ören, per sats
  const vatByBox = new Map<string, number>();

  for (const e of entries) {
    const debit = kronorToOre(Number(e.debit));
    const credit = kronorToOre(Number(e.credit));
    if (e.vat_code === "SALES_25") underlagByRate.set(25, (underlagByRate.get(25) ?? 0) + credit - debit);
    if (e.vat_code === "SALES_12") underlagByRate.set(12, (underlagByRate.get(12) ?? 0) + credit - debit);
    if (e.vat_code === "SALES_6") underlagByRate.set(6, (underlagByRate.get(6) ?? 0) + credit - debit);
    const box = VAT_ACCOUNT_BOX[e.account];
    if (box) {
      const amount = box === "48" ? debit - credit : credit - debit;
      vatByBox.set(box, (vatByBox.get(box) ?? 0) + amount);
    }
  }

  const checks: { label: string; ok: boolean; detail: string }[] = [];
  const rateBox: [number, string][] = [[25, "10"], [12, "11"], [6, "12"]];
  for (const [rate, box] of rateBox) {
    const underlag = underlagByRate.get(rate) ?? 0;
    const actualVat = vatByBox.get(box) ?? 0;
    if (underlag === 0 && actualVat === 0) continue;
    const expectedVat = Math.round((underlag * rate) / 100);
    const diff = Math.abs(actualVat - expectedVat);
    checks.push({
      label: `Utgående moms ${rate} % stämmer mot underlaget`,
      ok: diff <= 100, // tolerans 1 kr för öresavrundningar
      detail: diff <= 100
        ? `${oreToKronor(actualVat).toLocaleString("sv-SE")} kr = ${rate} % av ${oreToKronor(underlag).toLocaleString("sv-SE")} kr`
        : `Bokförd moms ${oreToKronor(actualVat).toLocaleString("sv-SE")} kr men ${rate} % av underlaget är ${oreToKronor(expectedVat).toLocaleString("sv-SE")} kr — kontrollera konteringen`,
    });
  }

  const ingMoms = vatByBox.get("48") ?? 0;
  if (ingMoms < 0) {
    checks.push({
      label: "Ingående moms är negativ",
      ok: false,
      detail: "Konto 2640/2645 har kreditsaldo — kontrollera felbokningar.",
    });
  }
  return checks;
}

/** Rutornas beskrivningar (för rapportvyn och PDF) */
export const BOX_LABELS: Record<string, string> = {
  "05": "Momspliktig försäljning som inte ingår i ruta 06, 07 eller 08",
  "06": "Momspliktiga uttag",
  "07": "Beskattningsunderlag vid vinstmarginalbeskattning",
  "08": "Hyresinkomster vid frivillig skattskyldighet",
  "10": "Utgående moms 25 %",
  "11": "Utgående moms 12 %",
  "12": "Utgående moms 6 %",
  "20": "Inköp av varor från ett annat EU-land",
  "21": "Inköp av tjänster från ett annat EU-land",
  "22": "Inköp av tjänster från ett land utanför EU",
  "23": "Inköp av varor i Sverige (omvänd skattskyldighet)",
  "24": "Inköp av tjänster i Sverige (omvänd skattskyldighet)",
  "30": "Utgående moms 25 % (ruta 20–24)",
  "31": "Utgående moms 12 % (ruta 20–24)",
  "32": "Utgående moms 6 % (ruta 20–24)",
  "35": "Försäljning av varor till ett annat EU-land",
  "36": "Försäljning av varor utanför EU",
  "37": "Mellanmans inköp av varor vid trepartshandel",
  "38": "Mellanmans försäljning av varor vid trepartshandel",
  "39": "Försäljning av tjänster till näringsidkare i annat EU-land",
  "40": "Övrig försäljning av tjänster omsatta utanför Sverige",
  "41": "Försäljning när köparen är skattskyldig i Sverige",
  "42": "Övrig försäljning m.m. (momsfri)",
  "48": "Ingående moms att dra av",
  "49": "Moms att betala eller få tillbaka",
  "50": "Beskattningsunderlag vid import",
  "60": "Utgående moms 25 % vid import",
  "61": "Utgående moms 12 % vid import",
  "62": "Utgående moms 6 % vid import",
};

// Rutordning i deklarationen
export const BOX_ORDER = [
  "05", "06", "07", "08", "10", "11", "12",
  "20", "21", "22", "23", "24", "30", "31", "32",
  "35", "36", "37", "38", "39", "40", "41", "42",
  "48", "49", "50", "60", "61", "62",
];

/** eSKD-fil för uppladdning på skatteverket.se (Skatteverkets XML-format) */
export function generateEskd(orgNr: string, periodEnd: string, boxes: VatBoxes): string {
  const period = periodEnd.slice(0, 7).replace("-", "");
  const el: Record<string, string> = {
    "05": "ForsMomsEjAnnan", "06": "MomsUlagUttag", "07": "UlagMargbesk",
    "08": "HyrinkomstFrivSkatt", "10": "MomsUtgHog", "11": "MomsUtgMedel",
    "12": "MomsUtgLag", "20": "InkopVaruAnnatEg", "21": "InkopTjanstAnnatEg",
    "22": "InkopTjanstUtomEg", "23": "InkopVaruSverige", "24": "InkopTjanstSverige",
    "30": "MomsInkopUtgHog", "31": "MomsInkopUtgMedel", "32": "MomsInkopUtgLag",
    "35": "ForsVaruAnnatEg", "36": "ForsVaruUtomEg", "37": "InkopGetMellanhand",
    "38": "ForsGetMellanhand", "39": "ForsTjSkskAnnatEg", "40": "ForsTjOvrUtomEg",
    "41": "ForsKopareSkskSverige", "42": "ForsOvrigt", "48": "MomsIngAvdr",
    "49": "MomsBetala", "50": "MomsUlagImport", "60": "MomsImportUtgHog",
    "61": "MomsImportUtgMedel", "62": "MomsImportUtgLag",
  };
  const lines = BOX_ORDER
    .filter((box) => (boxes[box] ?? 0) !== 0 || box === "49")
    .map((box) => `    <${el[box]}>${boxes[box] ?? 0}</${el[box]}>`);

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<!DOCTYPE eSKDUpload PUBLIC "-//Skatteverket, Sweden//DTD Skatteverket eSKDUpload-DTD Version 6.0//SV" "https://www1.skatteverket.se/demoeskd/eSKDUpload_6p0.dtd">
<eSKDUpload Version="6.0">
  <OrgNr>${orgNr}</OrgNr>
  <Moms>
    <Period>${period}</Period>
${lines.join("\n")}
  </Moms>
</eSKDUpload>
`;
}
