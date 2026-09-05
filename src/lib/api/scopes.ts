/**
 * Behörigheterna en API-nyckel kan bära. Två ord, och vokabulären är sluten.
 *
 * VARFÖR TVÅ OCH INTE ETT PER ENDPOINT. Ett scope per rutt hade sett
 * finkornigt ut och varit omöjligt att förklara i en kryssruta. De två orden
 * svarar i stället mot två frågor ägaren faktiskt kan besvara om en
 * integration: får den se mina siffror, får den bokföra? Allt annat är en
 * följd av dem.
 *
 * VARFÖR INTE TRE. Licensutgåvan har ett tredje ord, `intake:write`, som
 * öppnar orderintaget och e-fakturaingången. Den här utgåvan har varken
 * `/api/inbound/order` eller `/api/inbound/peppol` — funktionsytan är fryst.
 * Ett scope utan en väg bakom sig är ett löfte utan täckning: det hade stått
 * i kryssrutan, gått att kryssa i, och inte gjort någonting. Ordet införs den
 * dag vägen införs, i samma migration.
 *
 * VOKABULÄREN ÄR SLUTEN I DATABASEN OCKSÅ. `api_keys.scopes` bär ett
 * check-villkor mot exakt de här två strängarna, så ett tredje värde kräver
 * en migration — och den migrationen måste samtidigt öppna den väg värdet ska
 * ge. Två lås som öppnas i samma andetag är svårare att glömma än ett. Samma
 * tvåstegslogik som byrånycklarnas 'stats:read'.
 *
 * Filen är delad mellan gränssnittet (kryssrutorna), rutterna (grinden) och
 * OpenAPI-specen. En sanning, tre läsare — annars glider texten i kryssrutan
 * isär från vad nyckeln faktiskt kan.
 */

export const API_SCOPES = ["data:read", "ledger:write"] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/**
 * Rubriken i kryssrutan, och beskrivningen under den.
 *
 * Texten är skriven för företagaren som ska välja, inte för utvecklaren som
 * ska integrera: "Bokföra" säger vad som händer, `ledger:write` säger vad det
 * heter i koden. Båda visas — ordet i klartext för valet, maskinkoden för den
 * som sedan läser dokumentationen.
 */
export const SCOPE_LABELS: Record<ApiScope, string> = {
  "data:read": "Läsa",
  "ledger:write": "Bokföra",
};

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "data:read":
    "Hämtar fakturor, kunder, verifikat och nyckeltal. Ändrar ingenting.",
  "ledger:write":
    "Skapar och bokför kundfakturor genom samma spärrar som programmet självt: "
    + "periodlås, avslutade räkenskapsår och balanskravet gäller lika.",
};

/** Förvalet när en nyckel skapas. Läsning är det de flesta integrationer behöver. */
export const DEFAULT_SCOPES: ApiScope[] = ["data:read"];

/**
 * Skrivscopen kräver ett andra medvetet val i utfärdandedialogen.
 *
 * Samma tvåstegslogik som i migrationen, en våning upp: den som klickar
 * "Skapa nyckel" ska inte kunna råka ge bort bokföringsrätt genom att låta
 * ett förval stå kvar.
 */
export const WRITE_SCOPES: ApiScope[] = ["ledger:write"];

export function isWriteScope(scope: ApiScope): boolean {
  return WRITE_SCOPES.includes(scope);
}

/**
 * Meningen som står under kryssrutorna och ändrar sig med valen.
 *
 * Den säger både vad nyckeln KAN och vad den ALDRIG når. Andra halvan är den
 * viktiga: ett löfte om begränsad räckvidd som bara finns i ett avtal är
 * inget löfte, och den här meningen är samma uppräkning som spärren i
 * databasen faktiskt gör.
 */
export function describeScopes(scopes: ApiScope[]): string {
  const valda = API_SCOPES.filter((s) => scopes.includes(s));
  if (valda.length === 0) return "Välj minst en behörighet.";

  const kan = valda.map((s) => SCOPE_LABELS[s].toLowerCase());
  const kanText =
    kan.length === 1 ? kan[0] : `${kan.slice(0, -1).join(", ")} och ${kan.at(-1)}`;

  const saknas = API_SCOPES.filter((s) => !scopes.includes(s)).map((s) =>
    SCOPE_LABELS[s].toLowerCase()
  );
  const saknasText = saknas.length
    ? ` Den kan inte ${saknas.length === 1 ? saknas[0] : `${saknas.slice(0, -1).join(", ")} eller ${saknas.at(-1)}`}.`
    : "";

  return (
    `Den här nyckeln kan ${kanText}.${saknasText}`
    + " Den når aldrig dina företagsuppgifter, dina underlag, banken eller dina sparade nycklar."
  );
}
