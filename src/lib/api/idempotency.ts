import { createHash } from "node:crypto";
import { apiErrorBody, type ApiErrorBody } from "./errors";

/**
 * Idempotens på skrivanrop — kontraktet, utan Next och utan Supabase.
 *
 * VARFÖR HUVUDET ÄR OBLIGATORISKT OCH INTE VALFRITT. Ett nätverk som tappar
 * svaret men inte anropet är det normala felet, inte undantaget: butiken ser
 * en timeout, försöker igen, och kunden får två fakturor. Ett valfritt
 * `Idempotency-Key` sätts av den som redan tänkt på saken — alltså av den som
 * inte behövde det. Att kräva det flyttar frågan till uppsättningen, där den
 * kostar en rad kod, i stället för till bokslutet, där den kostar en rättelse.
 *
 * VAD DET GER OCH INTE GER, UTSKRIVET. Det gör integratörens omförsök säkra
 * och gör ett uppspelat, avlyssnat anrop till en verkningslös upprepning. Det
 * skyddar INTE mot en angripare som håller nyckeln och skriver ett eget huvud
 * — mot den vägen är svaret återkallelse, scope och kvot. Det påståendet ska
 * inte tänjas.
 *
 * SAMMA HUVUD MED ANNAN KROPP ÄR 409, INTE ETT NYTT ANROP. Det är den enda
 * formen som fångar det verkliga misstaget: en klient som återanvänder sitt
 * ordernummer för en annan faktura. Att tyst utföra den andra hade skapat två
 * fakturor under ett löfte om att inte göra det; att tyst svara med den första
 * hade svarat på en fråga ingen ställde.
 */

/** Kolumnens check-villkor: length(idempotency_key) between 8 and 255. */
export const NYCKEL_MIN = 8;
export const NYCKEL_MAX = 255;

export function hashRequestBody(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type SparatSvar = {
  request_hash: string;
  response_status: number;
  response_body: unknown;
};

export type IdempotencyDeps = {
  /** Hämtar ett tidigare svar för (nyckel, huvud). null när det är första gången. */
  find: (keyId: string, idempotencyKey: string) => Promise<SparatSvar | null>;
  /** Sparar svaret. Fel här får inte fälla ett anrop som redan lyckats. */
  save: (
    keyId: string,
    idempotencyKey: string,
    requestHash: string,
    status: number,
    body: unknown
  ) => Promise<void>;
};

export type IdempotencyBeslut =
  | { kind: "kor"; idempotencyKey: string; requestHash: string }
  | { kind: "upprepning"; status: number; body: unknown }
  | { kind: "fel"; status: 400 | 409; body: ApiErrorBody };

export function laesIdempotencyKey(header: string | null | undefined): string | null {
  const v = (header ?? "").trim();
  if (v.length < NYCKEL_MIN || v.length > NYCKEL_MAX) return null;
  return v;
}

/**
 * Avgör vad rutten ska göra: köra, svara med det sparade svaret, eller neka.
 *
 * @param requestId anropets id, så ett felsvar bär samma som resten.
 */
export async function beslutaIdempotens(
  deps: IdempotencyDeps,
  keyId: string,
  header: string | null | undefined,
  rawBody: string,
  requestId?: string
): Promise<IdempotencyBeslut> {
  const idempotencyKey = laesIdempotencyKey(header);
  if (!idempotencyKey) {
    return {
      kind: "fel",
      status: 400,
      body: apiErrorBody(
        "idempotency_required",
        `Skrivanrop kräver huvudet Idempotency-Key med ${NYCKEL_MIN}–${NYCKEL_MAX} tecken som du väljer själv `
          + "— till exempel ditt eget ordernummer. Skickas samma anrop igen får du det första svaret "
          + "i stället för en andra faktura.",
        { detail: { header: "Idempotency-Key", min: NYCKEL_MIN, max: NYCKEL_MAX }, requestId }
      ),
    };
  }

  const requestHash = hashRequestBody(rawBody);

  let tidigare: SparatSvar | null = null;
  try {
    tidigare = await deps.find(keyId, idempotencyKey);
  } catch {
    /**
     * Går uppslaget inte att göra körs anropet. Alternativet vore att neka ett
     * anrop som är helt i sin ordning därför att en hjälptabell krånglar —
     * och en butik som får 500 på en faktura försöker igen, vilket är precis
     * det uppslaget skulle skydda mot.
     */
    return { kind: "kor", idempotencyKey, requestHash };
  }

  if (tidigare) {
    if (tidigare.request_hash !== requestHash) {
      return {
        kind: "fel",
        status: 409,
        body: apiErrorBody(
          "idempotency_conflict",
          "Idempotency-Key är redan använd för ett anrop med ett annat innehåll. "
            + "Välj en ny nyckel för den här fakturan, eller skicka exakt samma kropp igen.",
          { detail: { idempotency_key: idempotencyKey }, requestId }
        ),
      };
    }
    return { kind: "upprepning", status: tidigare.response_status, body: tidigare.response_body };
  }

  return { kind: "kor", idempotencyKey, requestHash };
}
