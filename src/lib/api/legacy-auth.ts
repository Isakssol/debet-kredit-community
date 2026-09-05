import { timingSafeEqual } from "node:crypto";
import { bearerToken, isApiKey } from "./keys";

/**
 * Den andra vägen in på de rutter som redan fanns.
 *
 * v1 införs BAKÅTKOMPATIBELT. `STATS_API_KEY` fortsätter fungera oförändrat —
 * en installation som redan har ett Excel-ark eller en adminpanel uppkopplad
 * mot /api/stats ska inte behöva röra den för att uppgradera. Det nya är att
 * samma rutter OCKSÅ tar emot en `dk_live_`-nyckel, och att den vägen har
 * identitet, scope, lista och en återkallningsknapp.
 *
 * Filen svarar på en enda fråga: bär det här anropet en API-nyckel, eller den
 * gamla miljösträngen? Svaret avgör vilken kontroll rutten ska köra, och
 * ingenting annat.
 *
 * VARFÖR EN GISSNING ÄR SÄKER HÄR. De två formaten är disjunkta:
 * `dk_live_` + 43 tecken base64url kan aldrig vara en miljösträng någon satt
 * själv, och skulle någon välja exakt det formatet som sin `STATS_API_KEY`
 * skulle uppslaget i `api_keys` ändå ge tomt och anropet avvisas — inte
 * släppas igenom. Gissningen kan alltså kosta ett 401 för en absurt vald
 * miljösträng, aldrig en öppning.
 */

/** Ser anropet ut att bära en API-nyckel? Avgör vilken auth-väg rutten kör. */
export function presenterarApiNyckel(request: Request): boolean {
  return isApiKey(bearerToken(request.headers.get("authorization")));
}

/**
 * Den gamla vägen: en delad sträng ur miljön, jämförd i konstant tid.
 *
 * Jämförelsen görs på lika långa buffertar; skiljer sig längden avvisas
 * anropet utan jämförelse, precis som förut. Beteendet är oförändrat från
 * `src/app/api/stats/_shared.ts` — funktionen är flyttad hit för att kunna
 * delas, inte omskriven.
 */
export function miljonyckelStammer(request: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const presented = bearerToken(request.headers.get("authorization"));
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
