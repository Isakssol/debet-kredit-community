/**
 * POST /api/v1/kundfakturor — skapa ett fakturautkast, och bokför det om du vill.
 *
 *   Authorization: Bearer dk_live_…        (behörighet: ledger:write)
 *   Idempotency-Key: <8–255 tecken>        obligatoriskt
 *   → 200 { id, status, invoice_number, ocr, net_amount, vat_amount, total_amount, due_date }
 *
 * RUTTEN TAR EN FÄRDIG FAKTURA MOT EN KÄND KUND. Kunden finns redan, raderna
 * bär sina konton, och den som anropar vet vad den vill bokföra. Rutten skapar
 * aldrig kunder: en kund som skapas av en integration är en kund ingen
 * granskat, och kundregistret är samtidigt stängt för skrivning från en
 * API-nyckel — det står i migrationens skrivlista, inte bara här.
 *
 * HÅRD REGEL 1, I PRAKTIKEN. Utkastet skrivs genom `writeInvoiceDraft` — samma
 * väg som fakturaformuläret, med samma prövning av momssatser och
 * totalsumma. Bokföringen går genom `bookInvoiceWith` och därmed genom
 * `book_verification()`, som är security definer och bär avslutade
 * räkenskapsår, periodlåset, balanskravet och den obrutna
 * verifikationsserien. Det finns ingen rå väg förbi: `verifications` och
 * `verification_rows` är stängda för skrivning även med `ledger:write`,
 * vilket är prövat mot en riktig databas.
 *
 * DÄRFÖR ÄR ETT LÅS ETT 422 OCH INTE ETT FEL. Fakturan är mottagen och läst;
 * den gick bara inte att bokföra i en stängd period. Utkastet ligger kvar och
 * svaret säger vilken spärr som gäller, så att den som integrerar kan visa det
 * för sin användare i stället för att försöka igen.
 *
 * FÄLTNAMNEN ÄR API:ETS, INTE TABELLENS. Kolumnen heter `invoice_no` i den
 * här utgåvan och `invoice_number` i licensutgåvan. Svaret säger
 * `invoice_number` i båda, så en integration skriven mot dokumentationen
 * fungerar mot en installation av vardera slaget. Ett API vars fältnamn följer
 * med varje schemaändring är inget kontrakt.
 */
import { type NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { apiError, apiOk, apiThrown, apiHeaders } from "@/lib/api/errors";
import { beslutaIdempotens, type IdempotencyDeps } from "@/lib/api/idempotency";
import { writeInvoiceDraft } from "@/lib/invoicing/draft";
import { bookInvoiceWith } from "@/lib/invoicing/book";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** En faktura är några kilobyte. Taket stoppar en kropp som inte är en. */
const MAX_BYTES = 512 * 1024;

/**
 * Meddelanden som betyder "spärren i databasen sa nej", inte "kroppen var
 * fel". De ska bli 422 med skälet kvar, inte 400.
 *
 * Listan matchar på motorns egna formuleringar ur `book_verification()`:
 * "Perioden 2026-3 är låst.", "Räkenskapsåret 2025 är avslutat.", "Inget
 * räkenskapsår finns för datumet 2030-01-01.". Träffar den inte blir svaret
 * ändå 422 — det är rätt utfall för allt som tar sig förbi prövningen och
 * ändå inte går att bokföra.
 */
const LASMONSTER = /är låst|är avslutat|inget räkenskapsår|bokslut/i;

export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request, "ledger:write");
  if (!auth.ok) return auth.response;
  const { supabase, admin, key, requestId } = auth.ctx;

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return apiError(413, "payload_too_large", `Kroppen är större än ${MAX_BYTES / 1024} kB.`, {
      requestId,
    });
  }

  const idem: IdempotencyDeps = {
    async find(keyId, idempotencyKey) {
      const { data, error } = await admin
        .from("api_idempotency")
        .select("request_hash, response_status, response_body")
        .eq("key_id", keyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async save(keyId, idempotencyKey, requestHash, status, body) {
      await admin.from("api_idempotency").insert({
        key_id: keyId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        response_status: status,
        response_body: body,
      });
    },
  };

  const beslut = await beslutaIdempotens(
    idem,
    key.id,
    request.headers.get("idempotency-key"),
    raw,
    requestId
  );
  if (beslut.kind === "fel") {
    return Response.json(beslut.body, {
      status: beslut.status,
      headers: apiHeaders(requestId),
    });
  }
  if (beslut.kind === "upprepning") {
    /**
     * Samma huvud, samma kropp: det sparade svaret, inte en andra faktura.
     * `Idempotent-Replay` säger att svaret är återspelat — annars kan den som
     * felsöker inte skilja "min omsändning togs emot igen" från "den skapade
     * ytterligare en".
     */
    return Response.json(beslut.body, {
      status: beslut.status,
      headers: apiHeaders(requestId, { "Idempotent-Replay": "true" }),
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, "invalid_request", "Kroppen är inte giltig JSON.", { requestId });
  }

  const { book, ...draft } = (body ?? {}) as Record<string, unknown>;
  if (book !== undefined && typeof book !== "boolean") {
    return apiError(400, "invalid_request", "book ska vara true eller false.", {
      detail: { field: "book" },
      requestId,
    });
  }

  try {
    /**
     * Utkastet skrivs med NYCKELNS session, inte med service-klienten. Därmed
     * gäller RLS: spärren "api bokfor" kräver `ledger:write` i varje fråga, och
     * en nyckel vars scope ändrats sedan sessionen mintades nekas här — inte
     * vid nästa omstart av instansen.
     */
    const skapad = await writeInvoiceDraft(supabase, null, draft);
    if ("error" in skapad) {
      // Prövningen sa nej: fältnivå, alltså 400.
      return apiError(400, "invalid_request", skapad.error, { requestId });
    }

    let invoiceNumber: number | null = null;
    let ocr: string | null = null;
    let status = "draft";

    if (book === true) {
      const bokford = await bookInvoiceWith(supabase, skapad.invoiceId);
      if ("error" in bokford) {
        /**
         * Fakturan finns kvar som utkast. Det är avsiktligt: det som tagits
         * emot försvinner inte för att nästa steg inte gick. Utkastet går att
         * rätta i gränssnittet eller bokföra senare, och svaret säger var det
         * ligger.
         */
        const arLas = LASMONSTER.test(bokford.error);
        return apiError(
          422,
          arLas ? "period_locked" : "unprocessable",
          bokford.error,
          {
            detail: { invoice_id: skapad.invoiceId, status: "draft", booked: false },
            requestId,
          }
        );
      }
      invoiceNumber = bokford.invoiceNo;
      ocr = bokford.ocr;
      status = "booked";
    }

    const { data: sparad } = await supabase
      .from("invoices")
      .select("id, status, invoice_no, ocr, net_amount, vat_amount, total_amount, due_date")
      .eq("id", skapad.invoiceId)
      .single();

    const svar = {
      id: skapad.invoiceId,
      status: sparad?.status ?? status,
      invoice_number: sparad?.invoice_no ?? invoiceNumber,
      ocr: sparad?.ocr ?? ocr,
      net_amount: Number(sparad?.net_amount ?? 0),
      vat_amount: Number(sparad?.vat_amount ?? 0),
      total_amount: Number(sparad?.total_amount ?? 0),
      due_date: sparad?.due_date ?? null,
    };

    /**
     * Svaret sparas EFTER att fakturan skapats. Ett fel här får inte fälla ett
     * anrop som redan lyckats — men det betyder också att ett omförsök i just
     * det glappet kan skapa en andra faktura. Glappet är millisekunder brett
     * och alternativet — att spara före och riskera att lova ett svar som
     * aldrig blev av — är sämre: då hade omförsöket fått ett kvitto på en
     * faktura som inte finns.
     */
    try {
      await idem.save(key.id, beslut.idempotencyKey, beslut.requestHash, 200, svar);
    } catch {
      /* ignoreras med flit */
    }

    return apiOk(svar, requestId);
  } catch (e) {
    return apiThrown(e, requestId, "kundfakturor");
  }
}

/**
 * GET svarar med kontraktet i klartext.
 *
 * Den som sätter upp en koppling provar alltid adressen i en webbläsare först.
 * Ett 405 säger ingenting; det här säger vad rutten väntar sig — utan att
 * avslöja något om installationen, eftersom svaret är statiskt.
 */
export function GET() {
  return Response.json(
    {
      service: "Kundfakturor — skapa utkast och bokför",
      method: "POST",
      authorization: "Bearer <API-nyckel med ledger:write>",
      headers: { "Idempotency-Key": "8–255 tecken du väljer själv, unikt per faktura" },
      accepts: "application/json",
      contract: {
        customerId: "kundens uuid — kunden måste finnas, rutten skapar aldrig kunder",
        invoiceDate: "ÅÅÅÅ-MM-DD",
        paymentTerms: "hela dagar, 0–90",
        yourReference: "kundens referens (valfritt)",
        notes: "fritext på fakturan (valfritt)",
        rows: [
          {
            description: "…",
            quantity: 1,
            unitPrice: 1000,
            vatRate: 25,
            account: 3041,
            unit: "st",
            discountPct: 0,
          },
        ],
        book: "true bokför direkt; utelämnad eller false lämnar fakturan som utkast",
      },
      note:
        "Periodlås, oföränderliga verifikat och avslutade räkenskapsår gäller lika för "
        + "API:et som för gränssnittet. En faktura som inte kan bokföras i en stängd "
        + "period ligger kvar som utkast och svaret säger varför.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
