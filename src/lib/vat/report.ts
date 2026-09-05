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
  // Varuimport från land utanför EU. Momsen påförs vid införseln (tullräkningen
  // från Tullverket eller speditören), inte genom omvänd skattskyldighet, och
  // beskattningsunderlaget redovisas i ruta 50 ["Fylla i momsdeklarationen",
  // fält 50 "Beskattningsunderlag vid import"].
  PURCHASE_IMPORT: "50",
};

// momskonto → momsruta
const VAT_ACCOUNT_BOX: Record<number, string> = {
  2611: "10", 2621: "11", 2631: "12",
  2614: "30",
  // Importmoms enligt tullräkningen — ruta 60–62 ["Fylla i momsdeklarationen"].
  2615: "60", 2625: "61", 2635: "62",
  // Hela BAS-familjen för ingående moms — 2641 "Debiterad ingående moms" är
  // standardkontot i Fortnox-/Visma-exporter och måste träffa ruta 48.
  2640: "48", 2641: "48", 2642: "48", 2645: "48", 2647: "48", 2648: "48", 2649: "48",
};

const OUTPUT_BOXES = ["10", "11", "12", "30", "31", "32", "60", "61", "62"];

/**
 * Verifikatkällor som aldrig redovisar moms i en momsperiod.
 *
 * - vat_report: momsomföringen nollställer 26xx mot 2650. Räknas den med i
 *   periodens underlag redovisas samma moms två gånger.
 * - opening_balance: ingående balanser är föregående års utgående, inte årets
 *   affärshändelser (ÅRL 2 kap. 4 § 1 st p. 7).
 * - year_end: bokslutsverifikatet är daterat räkenskapsårets sista dag och
 *   ligger därför ALLTID i den sista momsperioden. Rör det ett 26xx-konto
 *   hamnade beloppet i deklarationen trots att posten inte är en momspliktig
 *   omsättning.
 */
export const NON_VAT_TRANSFER_SOURCES = ["vat_report", "opening_balance", "year_end"];

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

  // Deklarationen innehåller bara det som faktiskt är bokfört. Saknas underlaget
  // till en momsruta härleds det INTE — ett gissat belopp i ruta 20 ser rätt ut i
  // filen men saknar motsvarighet i huvudboken, blir alltid 25 % även när
  // omvändningen gäller 12 eller 6 procent, och döljer den felkontering det
  // kompenserar för. I stället flaggar rimlighetskontrollen (computeVatChecks)
  // att underlaget saknas, så konteringen rättas där felet sitter.

  // Hela kronor: öretalen stryks per ruta. Skatteverkets filformat kräver
  // "belopp i heltal utan decimaler" ["Lämna momsdeklaration via fil i
  // e-tjänsten"] men publicerar ingen avrundningsregel för rutorna.
  // Math.trunc (mot noll) väljs medvetet framför Math.round: den stryker
  // öretalen konsekvent även för negativa rutor (kreditnotor), och ruta 49
  // räknas nedan ur de REDAN trunkerade rutorna så att Skatteverkets
  // summeringsformel för fält 49 alltid stämmer i den inlämnade filen. Det är
  // den invarianten som räknas — ändra inte till Math.round, då bryts den.
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
  const baseByBox = new Map<string, number>();      // ören, per underlagsruta

  for (const e of entries) {
    const debit = kronorToOre(Number(e.debit));
    const credit = kronorToOre(Number(e.credit));
    if (e.vat_code && UNDERLAG_BOX[e.vat_code]) {
      const box = UNDERLAG_BOX[e.vat_code];
      const amount = e.vat_code.startsWith("PURCHASE") ? debit - credit : credit - debit;
      baseByBox.set(box, (baseByBox.get(box) ?? 0) + amount);
    }
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

  // Omvänd skattskyldighet: momsen i ruta 30–32 ska ha sitt underlag i ruta 20–24.
  // Ett EU-inköp som bokförts direkt på ett inventariekonto ger moms utan underlag;
  // programmet gissar inte fram beloppet utan säger var det saknas.
  const reverseRates: [string, number][] = [["30", 25], ["31", 12], ["32", 6]];
  const reverseVat = reverseRates.reduce((s, [box]) => s + (vatByBox.get(box) ?? 0), 0);
  if (reverseVat > 0) {
    const expectedBase = reverseRates
      .reduce((s, [box, rate]) => s + ((vatByBox.get(box) ?? 0) * 100) / rate, 0);
    const actualBase = ["20", "21", "22", "23", "24"]
      .reduce((s, b) => s + (baseByBox.get(b) ?? 0), 0);
    const missing = Math.round(expectedBase - actualBase);
    checks.push({
      label: "Underlaget till omvänd skattskyldighet finns i ruta 20–24",
      ok: missing <= 100,
      detail: missing <= 100
        ? `${oreToKronor(actualBase).toLocaleString("sv-SE")} kr underlag mot ${oreToKronor(reverseVat).toLocaleString("sv-SE")} kr moms i ruta 30–32`
        : `Underlag saknas för utgående moms — kontrollera konteringen. Ruta 30–32 har ${oreToKronor(reverseVat).toLocaleString("sv-SE")} kr moms men ruta 20–24 bara ${oreToKronor(actualBase).toLocaleString("sv-SE")} kr underlag, ${oreToKronor(missing).toLocaleString("sv-SE")} kr för lite. Bokför inköpet på ett 45xx-konto med rätt momskod i stället för direkt på tillgångs- eller kostnadskontot.`,
    });
  }

  // Import av varor: den utgående momsen i ruta 60–62 ska ha sitt
  // beskattningsunderlag i ruta 50. Skatteverket, "Fylla i momsdeklarationen",
  // fält 50 "Beskattningsunderlag vid import" och fält 60–62.
  const importRates: [string, number][] = [["60", 25], ["61", 12], ["62", 6]];
  const importVat = importRates.reduce((s, [box]) => s + (vatByBox.get(box) ?? 0), 0);
  const importBase = baseByBox.get("50") ?? 0;
  if (importVat > 0 || importBase > 0) {
    const expectedBase = importRates
      .reduce((s, [box, rate]) => s + ((vatByBox.get(box) ?? 0) * 100) / rate, 0);
    const diff = Math.abs(Math.round(expectedBase - importBase));
    checks.push({
      label: "Underlaget till importmomsen finns i ruta 50",
      ok: diff <= 100,
      detail: diff <= 100
        ? `${oreToKronor(importBase).toLocaleString("sv-SE")} kr underlag mot ${oreToKronor(importVat).toLocaleString("sv-SE")} kr moms i ruta 60–62`
        : `Ruta 50 har ${oreToKronor(importBase).toLocaleString("sv-SE")} kr underlag men momsen i ruta 60–62 svarar mot ${oreToKronor(Math.round(expectedBase)).toLocaleString("sv-SE")} kr. Bokför importen på ett 45xx-konto med rätt momskod.`,
    });
  }

  // Negativ ingående moms är inte ett fel i sig. En period där kreditnotor på
  // inköp överstiger periodens inköp ger ett fullt legitimt kreditsaldo på 2641,
  // och en kreditnota på ett EU-förvärv ger det på 2645. Ruta 48 har inget
  // teckenkrav hos Skatteverket ["Fylla i momsdeklarationen", fält 48] och
  // eSKD-formatet tillåter uttryckligen inledande minustecken ["Lämna
  // momsdeklaration via fil i e-tjänsten"]. Raden är därför en upplysning: ett
  // rött fel ska vara reserverat för något som faktiskt är fel, annars lär sig
  // användaren att "rätta" en korrekt bokföring.
  const ingMoms = vatByBox.get("48") ?? 0;
  if (ingMoms < 0) {
    checks.push({
      label: "Ingående moms är negativ",
      ok: true,
      detail: `Ruta 48 är ${oreToKronor(ingMoms).toLocaleString("sv-SE")} kr. Det är normalt när periodens kreditnotor på inköp är större än inköpen — kontrollera ändå att inget inköp bokförts med omvänt tecken.`,
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

// Rutordning i deklarationen.
// Ordningen är Skatteverkets taggordning i eSKD-filen (import/ruta 50–62 före
// 48/49) ["Lämna momsdeklaration via fil i e-tjänsten", tabellen "Obligatoriska
// uppgifter"]. Samma ordning används på skärmen och i PDF:en, så rapporten och
// filen läses radvis mot varandra.
export const BOX_ORDER = [
  "05", "06", "07", "08", "10", "11", "12",
  "20", "21", "22", "23", "24", "30", "31", "32",
  "35", "36", "37", "38", "39", "40", "41", "42",
  "50", "60", "61", "62", "48", "49",
];

/**
 * Organisationsnumret som eSKD-filen kräver det: "10 siffror enligt formatet
 * xxxxxx-xxxx, med bindestreck" ["Lämna momsdeklaration via fil i e-tjänsten",
 * Rad 3]. Ett tolvsiffrigt personnummer kortas till de tio sista, precis som
 * Skatteverkets egen anvisning. Returnerar null när numret inte går att skriva
 * så — då ska ingen fil skapas.
 *
 * Samma kontroll som orgNumberIssue använder i Inställningar, så de två
 * validerarna aldrig kan vara oense.
 *
 * Eftersom resultatet bara innehåller siffror och ett bindestreck behöver det
 * inte XML-escapas; valideringen är den spärren.
 */
export function formatEskdOrgNr(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (orgNumberIssue(text)) return null;
  const digits = text.replace(/\D/g, "");
  const ten = digits.slice(-10);
  const formatted = `${ten.slice(0, 6)}-${ten.slice(6)}`;
  return /^\d{6}-\d{4}$/.test(formatted) ? formatted : null;
}

/**
 * Kontroll av organisationsnumret redan i Inställningar. Fältet är fritext, och
 * ett nummer som inte går att skriva som xxxxxx-xxxx gör eSKD-filen omöjlig att
 * lämna in — det felet ska upptäckas när numret sparas, inte när
 * momsdeklarationen ska godkännas.
 *
 * Godkänt: tio siffror (organisationsnummer eller personnummer utan sekel) eller
 * tolv med sekelprefix (16 för organisationsnummer, 19/20 för personnummer).
 * Returnerar ett svenskt felmeddelande, annars null.
 *
 * Källa: Skatteverket, "Lämna momsdeklaration via fil i e-tjänsten", Rad 3 samt
 * Avvisande fel: "Den momsregistrerades organisationsnummer (eller motsvarande)
 * har angetts i ett felaktigt format."
 */
export const ORG_NUMBER_ERROR =
  "Organisationsnumret ska ha tio siffror (xxxxxx-xxxx), eller tolv med sekel för personnummer. Skatteverket avvisar eSKD-filen om numret har ett annat format.";

export function orgNumberIssue(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null; // frivilligt fält — spärren ligger i momsgodkännandet
  const digits = text.replace(/\D/g, "");
  if (digits.length === 10) return null;
  if (digits.length === 12 && /^(16|19|20)/.test(digits)) return null;
  return ORG_NUMBER_ERROR;
}

/**
 * Upplysningsfältet i eSKD-filen (Rad 35, <TextUpplysningMoms>) rymmer högst 300
 * tecken ["Lämna momsdeklaration via fil i e-tjänsten", tabellen "Upplysningar"].
 * Filen är ISO-8859-1, och Skatteverket avvisar filer med "otillåtna tecken", så
 * ett tecken som inte finns i ISO-8859-1 (typografiskt tankstreck, emoji) får
 * inte skickas med — det skulle annars tyst bli ett frågetecken i filen.
 *
 * Returnerar ett felmeddelande på svenska när texten inte går att lämna, annars
 * null. Texten kapas aldrig: en upplysning till Skatteverket som klipps av mitt
 * i en mening är värre än en fråga till användaren.
 */
export const ESKD_NOTE_MAX = 300;

/**
 * Upplysningen är ETT XML-element på en rad. Radbrytningar och dubbla mellanslag
 * normaliseras därför bort — texten är kvar, bara sammanpressad till en rad.
 */
export function normalizeEskdNote(note: string | null | undefined): string {
  // JS \s täcker inte U+0085 (NEL) och inte C1-blocket i övrigt, så
  // radbrytningstecken därifrån normaliseras uttryckligen till mellanslag innan
  // resten pressas ihop. Det som blir kvar av C1 fälls av validateEskdNote.
  return (note ?? "").replace(/[\u0085\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
}

export function validateEskdNote(note: string | null | undefined): string | null {
  const text = normalizeEskdNote(note);
  if (!text) return null;
  if (text.length > ESKD_NOTE_MAX) {
    return `Upplysningen får vara högst ${ESKD_NOTE_MAX} tecken i eSKD-filen (din är ${text.length}). Korta ner den.`;
  }
  // Otillåtna kodpunkter i ISO/IEC 8859-1: allt över 255 (finns inte i
  // teckenuppsättningen), C0-kontrollerna 0–31, DEL (127) och C1-blocket
  // 128–159. Positionerna 128–159 är OTILLDELADE kontrollpositioner i
  // ISO/IEC 8859-1 — inga tryckbara tecken — och skrivs ut som råa byte av
  // iconv-lite när filen kodas i /moms/eskd. Skatteverket avvisar filer med
  // "otillåtna tecken" ["Lämna momsdeklaration via fil i e-tjänsten",
  // Kontroll av mottagna uppgifter → Avvisande fel].
  const bad = [...text].filter((c) => {
    const code = c.codePointAt(0)!;
    return code > 255 || code < 32 || code === 127 || (code >= 128 && code <= 159);
  });
  if (bad.length > 0) {
    // Ett osynligt styrtecken går inte att visa — då anges kodpunkten i stället,
    // annars ser felmeddelandet ut att peka på ingenting.
    const shown = [...new Set(bad)].map((c) => {
      const code = c.codePointAt(0)!;
      return code < 32 || code === 127 || (code >= 128 && code <= 159)
        ? `U+${code.toString(16).toUpperCase().padStart(4, "0")}`
        : c;
    });
    return `Upplysningen innehåller tecken som inte finns i eSKD-filens teckenuppsättning ISO-8859-1: ${shown.join(" ")}. Skriv om den med vanliga tecken (bindestreck i stället för tankstreck).`;
  }
  return null;
}

/** &, < och > måste escapas för att filen ska vara giltig XML. */
const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * eSKD-fil för uppladdning på skatteverket.se (Skatteverkets XML-format).
 *
 * `note` är den valfria upplysningen på Rad 35. Skatteverket anvisar fältet för
 * upplysningar, och vid rättelse av en redan inlämnad deklaration — där hela
 * deklarationen görs om — är det vägen att förklara vad som ändrats.
 */
export function generateEskd(orgNr: string, periodEnd: string, boxes: VatBoxes, note?: string | null): string {
  const formattedOrgNr = formatEskdOrgNr(orgNr);
  if (!formattedOrgNr) {
    throw new Error(
      `Organisationsnumret "${orgNr}" kan inte skrivas som xxxxxx-xxxx i eSKD-filen. `
      + "Ange tio siffror (eller ett personnummer) under Inställningar."
    );
  }
  const period = periodEnd.slice(0, 7).replace("-", "");
  const el: Record<string, string> = {
    // Taggnamn enligt Skatteverkets "Lämna momsdeklaration via fil" (eSKDUpload 6.0)
    "05": "ForsMomsEjAnnan", "06": "UttagMoms", "07": "UlagMargbesk",
    "08": "HyrinkomstFriv", "10": "MomsUtgHog", "11": "MomsUtgMedel",
    "12": "MomsUtgLag", "20": "InkopVaruAnnatEg", "21": "InkopTjanstAnnatEg",
    "22": "InkopTjanstUtomEg", "23": "InkopVaruSverige", "24": "InkopTjanstSverige",
    "30": "MomsInkopUtgHog", "31": "MomsInkopUtgMedel", "32": "MomsInkopUtgLag",
    "35": "ForsVaruAnnatEg", "36": "ForsVaruUtomEg", "37": "InkopVaruMellan3p",
    "38": "ForsVaruMellan3p", "39": "ForsTjSkskAnnatEg", "40": "ForsTjOvrUtomEg",
    "41": "ForsKopareSkskSverige", "42": "ForsOvrigt", "48": "MomsIngAvdr",
    "49": "MomsBetala", "50": "MomsUlagImport", "60": "MomsImportUtgHog",
    "61": "MomsImportUtgMedel", "62": "MomsImportUtgLag",
  };
  const lines = BOX_ORDER
    .filter((box) => (boxes[box] ?? 0) !== 0 || box === "49")
    .map((box) => `    <${el[box]}>${boxes[box] ?? 0}</${el[box]}>`);

  // Rad 35: upplysningen sist inuti <Moms>, bara när det finns en.
  const noteError = validateEskdNote(note);
  if (noteError) throw new Error(noteError);
  const noteText = normalizeEskdNote(note);
  if (noteText) {
    lines.push(`    <TextUpplysningMoms>${escapeXml(noteText)}</TextUpplysningMoms>`);
  }

  // Exakt den struktur Skatteverket dokumenterar för "Lämna momsdeklaration via
  // fil i e-tjänsten", tabellen "Obligatoriska uppgifter": Rad 1 är
  // xml-deklarationen, Rad 2 <eSKDUpload Version="6.0">, Rad 3 <OrgNr>, Rad 4
  // <Moms>, Rad 5 <Period> och därefter rutorna i taggordning.
  //
  // INGEN DOCTYPE. Skatteverkets tabell har ingenting mellan Rad 1 och Rad 2,
  // och ingen av deras exempelfiler innehåller en DOCTYPE. Filen kontrolleras
  // mot "En XML-tagg har angetts på ett annat sätt än det format som avsnittet
  // Skapa en fil beskriver" (avvisande fel), och den DTD-adress som tidigare
  // stod här (www1.skatteverket.se/demoeskd/eSKDUpload_6p0.dtd) svarar inte —
  // en validerande parser som försöker hämta den misslyckas.
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<eSKDUpload Version="6.0">
  <OrgNr>${formattedOrgNr}</OrgNr>
  <Moms>
    <Period>${period}</Period>
${lines.join("\n")}
  </Moms>
</eSKDUpload>
`;
}
