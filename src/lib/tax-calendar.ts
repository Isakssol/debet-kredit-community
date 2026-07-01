import { vatPeriods } from "@/lib/vat/report";

export type Deadline = {
  type: "moms" | "f_skatt" | "inkomstdeklaration" | "periodisk_sammanstallning";
  title: string;
  dueDate: string;
  periodStart?: string;
};

/**
 * Skattekalender för enskild firma med kalenderår.
 * Genereras dynamiskt från inställningarna — momsstatus kollas mot vat_reports.
 */
export function taxDeadlines(
  year: number,
  vatPeriod: "manad" | "kvartal" | "helar",
  euTrade: boolean
): Deadline[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const deadlines: Deadline[] = [];

  // Debiterad preliminärskatt: 12:e varje månad (17:e i januari och augusti)
  for (let m = 1; m <= 12; m++) {
    const day = m === 1 || m === 8 ? 17 : 12;
    deadlines.push({
      type: "f_skatt",
      title: "F-skatt (debiterad preliminärskatt)",
      dueDate: `${year}-${pad(m)}-${pad(day)}`,
    });
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
