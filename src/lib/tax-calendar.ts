import { vatPeriods } from "@/lib/vat/report";

export type Deadline = {
  type: "moms" | "f_skatt" | "inkomstdeklaration" | "periodisk_sammanstallning";
  title: string;
  dueDate: string;
  periodStart?: string;
};

/**
 * settings.pays_f_tax — har företaget beslut om debiterad preliminärskatt?
 * true = ja, false = nej, null/undefined = frågan är inte besvarad ännu.
 */
export type FTaxAnswer = boolean | null | undefined;

/** Frågan är obesvarad — Att göra visar en mjuk uppmaning i stället för datum. */
export function needsFTaxAnswer(paysFTax: FTaxAnswer): boolean {
  return paysFTax === null || paysFTax === undefined;
}

/** Den mjuka raden i Att göra när F-skattefrågan är obesvarad. */
export const F_TAX_PROMPT = {
  text: "Ange om företaget betalar debiterad preliminärskatt — då visas betalningsdatumen här",
  href: "/installningar#f-skatt",
} as const;

/** Källan bakom kalendern, så ingen tror att datumen är inlagd data. */
export const TAX_CALENDAR_SOURCE =
  "Skattekalendern härleds ur dina företagsinställningar";

/**
 * Skattekalender för enskild firma med kalenderår.
 * Genereras dynamiskt från inställningarna — momsstatus kollas mot vat_reports.
 */
export function taxDeadlines(
  year: number,
  vatPeriod: "manad" | "kvartal" | "helar",
  euTrade: boolean,
  /**
   * settings.pays_f_tax. Endast ett uttryckligt `true` ger F-skattrader:
   * betalningsdatumen gäller den som har ett beslut om debiterad
   * preliminärskatt (55 kap. 2–3 §§ skatteförfarandelagen [2011:1244]), och
   * programmet gissar inte åt någon. Obesvarat läge hanteras av anroparen via
   * needsFTaxAnswer/F_TAX_PROMPT.
   */
  paysFTax?: FTaxAnswer
): Deadline[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const deadlines: Deadline[] = [];

  // Debiterad preliminärskatt: 12:e varje månad (17:e i januari och augusti)
  if (paysFTax === true) {
    for (let m = 1; m <= 12; m++) {
      const day = m === 1 || m === 8 ? 17 : 12;
      deadlines.push({
        type: "f_skatt",
        title: "F-skatt (debiterad preliminärskatt)",
        dueDate: `${year}-${pad(m)}-${pad(day)}`,
      });
    }
  }
  // Januari + augusti året efter fångas av nästa års lista

  // Momsdeklarationer
  for (const p of vatPeriods(year, vatPeriod, euTrade)) {
    deadlines.push({
      type: "moms",
      title: `Momsdeklaration ${p.label}`,
      dueDate: p.dueDate,
      periodStart: p.start,
    });
  }

  // Periodisk sammanställning vid EU-handel (kvartalsvis, 25:e månaden efter kvartalet)
  if (euTrade) {
    for (let q = 1; q <= 4; q++) {
      const endM = q * 3;
      let dy = year, dm = endM + 1;
      if (dm > 12) { dm -= 12; dy += 1; }
      deadlines.push({
        type: "periodisk_sammanstallning",
        title: `Periodisk sammanställning Q${q}`,
        dueDate: `${dy}-${pad(dm)}-25`,
      });
    }
  }

  // Inkomstdeklaration 1 + NE-bilaga: 2 maj året efter beskattningsåret
  deadlines.push({
    type: "inkomstdeklaration",
    title: `Inkomstdeklaration + NE-bilaga (inkomstår ${year})`,
    dueDate: `${year + 1}-05-02`,
  });

  return deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
