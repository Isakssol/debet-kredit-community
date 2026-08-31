/**
 * AGI — arbetsgivardeklaration på individnivå som XML enligt Skatteverkets
 * schema 1.1 (arbetsgivardeklaration_1.1.xsd). Fältkoder verifierade mot
 * Skatteverkets XSD + exempelfiler:
 *   HU: 201 AgRegistreradId, 006 RedovisningsPeriod, 487 SummaArbAvgSlf, 497 SummaSkatteavdr
 *   IU: 201, 215 BetalningsmottagarId, 006, 570 Specifikationsnummer,
 *       011 KontantErsattningUlagAG, 001 AvdrPrelSkatt, 245/246 arbetsplatsadress
 *
 * Verifiera filen i Skatteverkets testtjänst innan första skarpa inlämningen:
 * https://sso.test.skatteverket.se/agd_tt/da_testtjanst_web/login.do?method=test
 */

export type AgiInput = {
  orgNumber: string;            // arbetsgivarens orgnr (10 eller 12 siffror)
  period: string;               // ÅÅÅÅMM
  programName: string;
  contact: { name: string; phone: string; email: string };
  employee: {
    personalNumber: string;     // 10 eller 12 siffror
    grossSalary: number;        // kontant bruttolön
    taxDeduction: number;       // avdragen preliminärskatt
  };
  employerFee: number;          // summa arbetsgivaravgifter
  workplace?: { address?: string; city?: string };
  created?: Date;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Normalisera till 12 siffror: orgnr får 16-prefix, personnr sekelprefix */
export function to12Digits(id: string, kind: "org" | "person"): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length === 12) return digits;
  if (digits.length !== 10) throw new Error(`Ogiltigt ${kind === "org" ? "organisationsnummer" : "personnummer"}: ${id}`);
  if (kind === "org") return `16${digits}`;
  // Personnummer: gissa sekel utifrån ålder (18–99 år bakåt)
  const yy = parseInt(digits.slice(0, 2), 10);
  const currentYY = new Date().getFullYear() % 100;
  const century = yy <= currentYY - 18 || yy > currentYY ? (yy > currentYY ? "19" : "20") : "20";
  return `${yy > currentYY ? "19" : century}${digits}`;
}

export function buildAgiXml(input: AgiInput): string {
  const org = to12Digits(input.orgNumber, "org");
  const pnr = to12Digits(input.employee.personalNumber, "person");
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(input.period)) {
    throw new Error(`Ogiltig period: ${input.period} (ÅÅÅÅMM)`);
  }
  const kr = (n: number) => String(Math.round(n)); // AGI redovisas i hela kronor
  const created = (input.created ?? new Date()).toISOString().slice(0, 19);
  const c = input.contact;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Skatteverket omrade="Arbetsgivardeklaration"
  xmlns="http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1"
  xmlns:agd="http://xmls.skatteverket.se/se/skatteverket/da/komponent/schema/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1 http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1/arbetsgivardeklaration_1.1.xsd">
  <agd:Avsandare>
    <agd:Programnamn>${esc(input.programName)}</agd:Programnamn>
    <agd:Organisationsnummer>${org}</agd:Organisationsnummer>
    <agd:TekniskKontaktperson>
      <agd:Namn>${esc(c.name)}</agd:Namn>
      <agd:Telefon>${esc(c.phone)}</agd:Telefon>
      <agd:Epostadress>${esc(c.email)}</agd:Epostadress>
    </agd:TekniskKontaktperson>
    <agd:Skapad>${created}</agd:Skapad>
  </agd:Avsandare>
  <agd:Blankettgemensamt>
    <agd:Arbetsgivare>
      <agd:AgRegistreradId>${org}</agd:AgRegistreradId>
      <agd:Kontaktperson>
        <agd:Namn>${esc(c.name)}</agd:Namn>
        <agd:Telefon>${esc(c.phone)}</agd:Telefon>
        <agd:Epostadress>${esc(c.email)}</agd:Epostadress>
      </agd:Kontaktperson>
    </agd:Arbetsgivare>
  </agd:Blankettgemensamt>
  <agd:Blankett>
    <agd:Arendeinformation>
      <agd:Arendeagare>${org}</agd:Arendeagare>
      <agd:Period>${input.period}</agd:Period>
    </agd:Arendeinformation>
    <agd:Blankettinnehall>
      <agd:HU>
        <agd:ArbetsgivareHUGROUP>
          <agd:AgRegistreradId faltkod="201">${org}</agd:AgRegistreradId>
        </agd:ArbetsgivareHUGROUP>
        <agd:RedovisningsPeriod faltkod="006">${input.period}</agd:RedovisningsPeriod>
        <agd:SummaArbAvgSlf faltkod="487">${kr(input.employerFee)}</agd:SummaArbAvgSlf>
        <agd:SummaSkatteavdr faltkod="497">${kr(input.employee.taxDeduction)}</agd:SummaSkatteavdr>
      </agd:HU>
    </agd:Blankettinnehall>
  </agd:Blankett>
  <agd:Blankett>
    <agd:Arendeinformation>
      <agd:Arendeagare>${org}</agd:Arendeagare>
      <agd:Period>${input.period}</agd:Period>
    </agd:Arendeinformation>
    <agd:Blankettinnehall>
      <agd:IU>
        <agd:ArbetsgivareIUGROUP>
          <agd:AgRegistreradId faltkod="201">${org}</agd:AgRegistreradId>
        </agd:ArbetsgivareIUGROUP>
        <agd:BetalningsmottagareIUGROUP>
          <agd:BetalningsmottagareIDChoice>
            <agd:BetalningsmottagarId faltkod="215">${pnr}</agd:BetalningsmottagarId>
          </agd:BetalningsmottagareIDChoice>
        </agd:BetalningsmottagareIUGROUP>
        <agd:RedovisningsPeriod faltkod="006">${input.period}</agd:RedovisningsPeriod>
        <agd:Specifikationsnummer faltkod="570">001</agd:Specifikationsnummer>
        <agd:KontantErsattningUlagAG faltkod="011">${kr(input.employee.grossSalary)}</agd:KontantErsattningUlagAG>
        <agd:AvdrPrelSkatt faltkod="001">${kr(input.employee.taxDeduction)}</agd:AvdrPrelSkatt>${input.workplace?.address ? `
        <agd:ArbetsplatsensGatuadress faltkod="245">${esc(input.workplace.address)}</agd:ArbetsplatsensGatuadress>` : ""}${input.workplace?.city ? `
        <agd:ArbetsplatsensOrt faltkod="246">${esc(input.workplace.city)}</agd:ArbetsplatsensOrt>` : ""}
      </agd:IU>
    </agd:Blankettinnehall>
  </agd:Blankett>
</Skatteverket>
`;
}
