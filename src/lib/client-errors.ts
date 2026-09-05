import { sanitizeOutbound } from "@/lib/logging";

/**
 * Klientfelbuffert — vad som faktiskt small i webbläsaren, redo att bifogas
 * en felrapport.
 *
 * Formen är medvetet snäv:
 *
 *  - **Modulminne, ingen persistens.** Inget localStorage: buffrade fel ska
 *    dö med fliken, inte ligga kvar på kundens disk.
 *  - **Vitlistad form, inte svartlistat innehåll.** En post har exakt fem
 *    fält. Ingen `detail`, inga godtyckliga objekt, ingen stack. Det som inte
 *    har ett fält kan inte följa med — och bokföringsdata bor i props och
 *    state, som aldrig passerar hit.
 *  - **Sanerad före buffring, inte före utskick.** Ingenting osanerat ligger
 *    någonsin i minnet, så en framtida bugg i utskickskoden kan inte läcka
 *    något som aldrig fanns där.
 *
 * Stacken utelämnas avsiktligt: minifierad bär den filnamn ur bygget som är
 * värdelösa, och den är den vanligaste vägen för serialiserade argument att
 * slinka med.
 */

export const CLIENT_ERROR_LIMITS = {
  /** Max antal poster i bufferten. Äldst faller ut först. */
  entries: 25,
  /** Max tecken per meddelande respektive källa. */
  messageChars: 400,
  sourceChars: 140,
  /** Tak för hela bufferten, ungefärliga byte. */
  totalBytes: 20_000,
  /** Poster äldre än så räknas bort vid läsning. */
  windowMs: 30 * 60 * 1000,
  /** Identiska fel inom fönstret räknas upp i stället för att fylla bufferten. */
  dedupeMs: 5_000,
} as const;

/**
 * Feltyper. Värdena är engelska som resten av koden; admin-portalen sätter
 * svenska etiketter på dem.
 */
export const CLIENT_ERROR_KINDS = ["error", "rejection", "boundary", "network"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

/** En buffertpost. Fem fält, aldrig fler. */
export type ClientErrorEntry = {
  /** Första förekomsten, ISO-8601. */
  at: string;
  kind: ClientErrorKind;
  /** Sanerat felmeddelande. */
  message: string;
  /** Var det kom ifrån: "app-1234.js:12:5" eller "GET /api/fakturor". */
  source: string;
  /** Antal förekomster. En kastande loop blir en rad, inte tusen. */
  count: number;
};

type Slot = ClientErrorEntry & { firstMs: number; lastMs: number };

let buffer: Slot[] = [];

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Ungefärlig storlek på en post när den serialiserats. */
const slotBytes = (slot: Slot) => slot.message.length + slot.source.length + 60;

function totalBytes(list: Slot[]): number {
  let sum = 0;
  for (const slot of list) sum += slotBytes(slot);
  return sum;
}

/**
 * Lägg en post i bufferten. Anropas från felfångarna och från felgränserna.
 * Saneringen sker här, en gång, innan något lagras.
 */
export function recordClientError(
  input: { kind: ClientErrorKind; message: unknown; source?: unknown },
  now: number = Date.now(),
): void {
  const raw = typeof input.message === "string" ? input.message : String(input.message ?? "");
  const message = clip(sanitizeOutbound(raw).trim(), CLIENT_ERROR_LIMITS.messageChars);
  if (!message) return;
  const rawSource = typeof input.source === "string" ? input.source : "";
  const source = clip(sanitizeOutbound(rawSource).trim(), CLIENT_ERROR_LIMITS.sourceChars);
  const kind: ClientErrorKind = CLIENT_ERROR_KINDS.includes(input.kind) ? input.kind : "error";

  buffer = buffer.filter((slot) => now - slot.lastMs <= CLIENT_ERROR_LIMITS.windowMs);

  const twin = buffer.find(
    (slot) =>
      slot.kind === kind
      && slot.message === message
      && slot.source === source
      && now - slot.lastMs <= CLIENT_ERROR_LIMITS.dedupeMs,
  );
  if (twin) {
    twin.count += 1;
    twin.lastMs = now;
    return;
  }

  buffer.push({
    at: new Date(now).toISOString(),
    kind,
    message,
    source,
    count: 1,
    firstMs: now,
    lastMs: now,
  });

  while (buffer.length > CLIENT_ERROR_LIMITS.entries) buffer.shift();
  while (buffer.length > 1 && totalBytes(buffer) > CLIENT_ERROR_LIMITS.totalBytes) buffer.shift();
}

/** Bufferten som den ska skickas: äldst först, inget utanför tidsfönstret. */
export function readClientErrors(now: number = Date.now()): ClientErrorEntry[] {
  return buffer
    .filter((slot) => now - slot.lastMs <= CLIENT_ERROR_LIMITS.windowMs)
    .map(({ at, kind, message, source, count }) => ({ at, kind, message, source, count }));
}

/** Töm bufferten. Används av testerna och när en rapport skickats. */
export function clearClientErrors(): void {
  buffer = [];
}

/**
 * Sökvägen för ett fetch-anrop som gick mot appens egen origin — utan query.
 * Externa anrop (Supabase, Stripe, den centrala insamlingen) returnerar null
 * och noteras aldrig: de är dels ointressanta för kundens felsökning, dels
 * har de nycklade URL:er.
 */
export function sameOriginPath(input: unknown, origin: string): string | null {
  let href: string;
  if (typeof input === "string") href = input;
  else if (input instanceof URL) href = input.href;
  else if (input && typeof input === "object" && "url" in input
    && typeof (input as { url: unknown }).url === "string") href = (input as { url: string }).url;
  else return null;

  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return url.pathname;
}

let uninstall: (() => void) | null = null;

/**
 * Montera felfångarna. Idempotent: en andra montering gör ingenting, så
 * layouten kan rendera om utan att lager staplas på lager.
 */
export function installClientErrorCapture(): () => void {
  if (typeof window === "undefined") return () => {};
  if (uninstall) return uninstall;

  const onError = (event: ErrorEvent) => {
    const name = event.error instanceof Error ? event.error.name : "";
    // Webbläsaren skriver "Uncaught TypeError: …" i event.message. Prefixet
    // ska bort innan feltypen jämförs, annars blir raden "TypeError: Uncaught
    // TypeError: …" — samma ord tre gånger i en ruta kunden ska kunna läsa.
    const raw = event.message.replace(/^Uncaught(?: \(in promise\))?:?\s*/, "");
    recordClientError({
      kind: "error",
      message: name && !raw.startsWith(name) ? `${name}: ${raw}` : raw,
      source: event.filename
        ? `${event.filename.split("/").pop() ?? ""}:${event.lineno}:${event.colno}`
        : "",
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    const message = reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : typeof reason === "string" ? reason : "Ohanterat avvisat löfte";
    recordClientError({ kind: "rejection", message, source: "" });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  // Tunn wrapper kring fetch: noterar BARA svarsstatus >= 400 mot appens egen
  // origin. Anropet vidarebefordras orört och ett kastat fel får passera.
  const originalFetch = window.fetch;
  const wrapped: typeof window.fetch = async function patchedFetch(this: unknown, ...args) {
    const response = await originalFetch.apply(this as never, args);
    try {
      if (response.status >= 400) {
        const path = sameOriginPath(args[0], window.location.origin);
        if (path) {
          const method = String(
            (args[1] as RequestInit | undefined)?.method
            ?? (args[0] instanceof Request ? args[0].method : "GET"),
          ).toUpperCase();
          recordClientError({
            kind: "network",
            message: `${method} ${path} svarade ${response.status}`,
            source: path,
          });
        }
      }
    } catch {
      // felfångst får aldrig störa anropet
    }
    return response;
  };
  window.fetch = wrapped;

  uninstall = () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    if (window.fetch === wrapped) window.fetch = originalFetch;
    uninstall = null;
  };
  return uninstall;
}
