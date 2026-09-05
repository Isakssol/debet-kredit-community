/**
 * Kontraktet för buggrapporter och funktionsönskemål.
 *
 * Insamlingen är CENTRAL: varje installation (även en kunds egen, på egen
 * domän) postar hem till debea.se. Därför är URL:en hårdkodad här — den ska
 * inte gå att peka om av misstag i en miljövariabel, och mottagaren är alltid
 * samma instans oavsett var avsändaren kör.
 *
 * Samma fil används av avsändaren (klienten) och mottagaren (API-routen) så
 * längdgränserna aldrig kan glida isär.
 *
 * I community-utgåvan finns bara avsändarsidan: mottagaren är debea.se, som
 * den här installationen inte äger. Filen hålls därför ordagrant lika i båda
 * utgåvorna. Ett fält som trimmats bort här hade varit ett fält mottagaren
 * fortsätter vänta sig — och en avvikelse i ett gränssnittskontrakt syns
 * först när den redan kostat en rapport.
 */

import { sanitizeOutbound } from "@/lib/logging";

export const FEEDBACK_ENDPOINT = "https://debea.se/api/feedback";

export const FEEDBACK_TYPES = ["bug", "feature"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/** Maxlängder. Klienten begränsar fälten, routen kapar och avvisar. */
export const FEEDBACK_LIMITS = {
  title: 120,
  message: 4000,
  email: 200,
  companyName: 120,
  appVersion: 40,
  userAgent: 400,
} as const;

export const FEEDBACK_MIN = { title: 3, message: 10 } as const;

/**
 * Honeypot: ett fält som är dolt för människor men lockande för robotar.
 * Är det ifyllt kastas inskicket — utan att avsändaren får veta det.
 *
 * Namnet är medvetet ett som ingen webbläsare autofyller (till skillnad från
 * "website", "company" och liknande): en autofylld honeypot hade tyst kastat
 * en riktig användares rapport.
 */
export const FEEDBACK_HONEYPOT_FIELD = "referens_kod";

/**
 * Tak för den tekniska bilagan.
 *
 * Kontrolleras på BÅDA sidor: klienten för att aldrig skicka mer än så här,
 * routen för att aldrig lita på att den gjorde det.
 */
export const FEEDBACK_ATTACHMENT_LIMITS = {
  /** Skärmbilden efter komprimering. Base64 av detta ryms i postens tak. */
  screenshotBytes: 1_500_000,
  /** Hela JSON-posten. Vercels egen gräns ligger på 4,5 MB. */
  payloadBytes: 3_000_000,
  /** En skärmbild, inte ett album. */
  attachments: 1,
  clientErrors: 25,
  clientErrorChars: 400,
  clientErrorSourceChars: 140,
  appLogLines: 15,
  appLogChars: 500,
  route: 200,
  buildSha: 40,
  viewport: 24,
  theme: 16,
  locale: 24,
  source: 60,
} as const;

/** Bildformat vi tar emot. Kontrolleras på magiska byte, inte på påstådd typ. */
export const FEEDBACK_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;
export type FeedbackImageType = (typeof FEEDBACK_IMAGE_TYPES)[number];

/** En rad ur klientfelbufferten. Samma form som src/lib/client-errors.ts. */
export type FeedbackClientError = {
  at: string;
  kind: string;
  message: string;
  source: string;
  count: number;
};

/**
 * En rad ur en installations egen systemlogg. Fyra fält — aldrig `detail`
 * (godtycklig jsonb) och aldrig `href` (bär objektid).
 *
 * Community-utgåvan har ingen sådan logg och fyller aldrig `appLogExcerpt`.
 * Fältet finns kvar för att mottagaren tar emot det från licensutgåvan: den
 * som porterar en logg hit ska hitta kontraktet redan skrivet.
 */
export type FeedbackLogLine = {
  at: string;
  level: string;
  source: string;
  message: string;
};

/** Det som följer med när kunden kryssat i "Bifoga teknisk information". */
export type FeedbackTechnical = {
  /** Normaliserad sökväg: /verifikat/:id, aldrig med query. */
  route?: string;
  buildSha?: string;
  viewport?: string;
  theme?: string;
  locale?: string;
  tzOffset?: number;
  clientErrors?: FeedbackClientError[];
  appLogExcerpt?: FeedbackLogLine[];
};

/** Skärmbilden, base64 i samma post som resten. */
export type FeedbackScreenshot = {
  mimeType: FeedbackImageType;
  /** Ren base64, utan data:-prefix. */
  data: string;
};

export type FeedbackPayload = {
  type: FeedbackType;
  title: string;
  message: string;
  email?: string;
  appVersion?: string;
  /** Skickas bara när användaren aktivt kryssat i det. */
  companyName?: string;
  /** Följer bara med när kunden kryssat i teknisk information. */
  technical?: FeedbackTechnical;
  /** Följer bara med när kunden tagit en bild och sett den. */
  screenshot?: FeedbackScreenshot;
  [FEEDBACK_HONEYPOT_FIELD]?: string;
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Delad validering. Returnerar ett svenskt felmeddelande eller null.
 * Anropas både innan utskick och på mottagarsidan.
 */
export function validateFeedback(input: {
  type?: unknown;
  title?: unknown;
  message?: unknown;
  email?: unknown;
}): string | null {
  if (typeof input.type !== "string" || !FEEDBACK_TYPES.includes(input.type as FeedbackType)) {
    return "Okänd typ av inskick.";
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (title.length < FEEDBACK_MIN.title) return "Skriv en rubrik på minst några tecken.";
  if (title.length > FEEDBACK_LIMITS.title) return `Rubriken får vara högst ${FEEDBACK_LIMITS.title} tecken.`;
  if (message.length < FEEDBACK_MIN.message) return "Beskriv det med minst några ord.";
  if (message.length > FEEDBACK_LIMITS.message) return `Beskrivningen får vara högst ${FEEDBACK_LIMITS.message} tecken.`;
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email && (email.length > FEEDBACK_LIMITS.email || !EMAIL_PATTERN.test(email))) {
    return "Ange en giltig e-postadress (eller lämna fältet tomt).";
  }
  return null;
}

/**
 * Sökvägen så som den får lämna installationen.
 *
 * usePathname() ger `/verifikat/9f3a…` eller `/kund/4711` — varje segment som
 * är ett UUID eller enbart siffror byts mot `:id`. Kvar blir vilken VY som
 * gick sönder, vilket är hela nyttan, med noll identifierare. Query och hash
 * följer aldrig med: de bär sökord, belopp och id.
 */
export function normalizeRoute(pathname: unknown): string {
  if (typeof pathname !== "string" || !pathname) return "/";
  const path = pathname.split("?")[0].split("#")[0];
  const normalized = path
    .split("/")
    .map((segment) =>
      /^\d+$/.test(segment)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)
        ? ":id"
        : segment)
    .join("/");
  return (normalized || "/").slice(0, FEEDBACK_ATTACHMENT_LIMITS.route);
}

/**
 * Vilket bildformat bytefäljden FAKTISKT är.
 *
 * En klient som påstår image/png men skickar en zip ska avvisas i routen, inte
 * i bucketen — därför läses de magiska byten, aldrig den påstådda mime-typen.
 */
export function detectImageType(bytes: Uint8Array): FeedbackImageType | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

const text = (value: unknown, max: number): string | undefined => {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s.slice(0, max) : undefined;
};

/** Som text(), men tvättad — för allt som är fritext och kan bära kunddata. */
const clean = (value: unknown, max: number): string | undefined => {
  const s = typeof value === "string" ? sanitizeOutbound(value).trim() : "";
  return s ? s.slice(0, max) : undefined;
};

/**
 * Vitlistning av den tekniska bilagan.
 *
 * Kör på BÅDA sidor. Klienten använder den så att det som visas i
 * transparensrutan är exakt det som skickas; routen använder den för att
 * aldrig lita på att avsändaren gjorde det. Fält som inte står här finns inte
 * — ett okänt fält tas inte emot, det försvinner tyst.
 *
 * Fritexten tvättas med sanitizeOutbound() här, inte hos anroparen. Två
 * skäl: klienten och routen kan då aldrig sanera olika, och funktionen är
 * idempotent — en redan tvättad rad ser likadan ut efter en andra tvätt, så
 * en rad som passerar båda sidor tvättas alltid med de nyaste reglerna.
 */
export function pickTechnical(input: unknown): FeedbackTechnical | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const L = FEEDBACK_ATTACHMENT_LIMITS;

  const theme = text(raw.theme, L.theme);
  const tzOffset = typeof raw.tzOffset === "number" && Number.isFinite(raw.tzOffset)
    ? Math.trunc(raw.tzOffset)
    : undefined;

  const clientErrors = Array.isArray(raw.clientErrors)
    ? raw.clientErrors
      .slice(-L.clientErrors)
      .map((row): FeedbackClientError | null => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const message = clean(r.message, L.clientErrorChars);
        if (!message) return null;
        return {
          at: text(r.at, 40) ?? "",
          kind: text(r.kind, 20) ?? "error",
          message,
          source: clean(r.source, L.clientErrorSourceChars) ?? "",
          count: typeof r.count === "number" && r.count > 0 ? Math.min(Math.trunc(r.count), 1_000_000) : 1,
        };
      })
      .filter((row): row is FeedbackClientError => row !== null)
    : undefined;

  const appLogExcerpt = Array.isArray(raw.appLogExcerpt)
    ? raw.appLogExcerpt
      .slice(-L.appLogLines)
      .map((row): FeedbackLogLine | null => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const message = clean(r.message, L.appLogChars);
        if (!message) return null;
        return {
          at: text(r.at, 40) ?? "",
          level: text(r.level, 10) ?? "info",
          source: clean(r.source, L.source) ?? "",
          message,
        };
      })
      .filter((row): row is FeedbackLogLine => row !== null)
    : undefined;

  const picked: FeedbackTechnical = {
    route: clean(raw.route, L.route),
    buildSha: text(raw.buildSha, L.buildSha),
    viewport: text(raw.viewport, L.viewport),
    theme: theme === "dark" || theme === "light" ? theme : undefined,
    locale: text(raw.locale, L.locale),
    tzOffset,
    clientErrors: clientErrors?.length ? clientErrors : undefined,
    appLogExcerpt: appLogExcerpt?.length ? appLogExcerpt : undefined,
  };
  return Object.values(picked).some((v) => v !== undefined) ? picked : undefined;
}

/**
 * Kontrollerar bilagan i ett inskick. Svenskt felmeddelande eller null.
 *
 * Bakåtkompatibilitet är en förutsättning, inte en artighet: en gammal
 * kundinstallation som inte känner till något av det här ska fortsätta kunna
 * rapportera oförändrat. Saknas fälten är svaret därför alltid null.
 */
export function validateFeedbackAttachment(input: {
  screenshot?: unknown;
  technical?: unknown;
}): string | null {
  const shot = input.screenshot;
  if (shot === undefined || shot === null) return null;
  if (typeof shot !== "object") return "Bilagan gick inte att läsa.";

  const s = shot as Record<string, unknown>;
  if (typeof s.data !== "string" || !s.data) return "Bilagan gick inte att läsa.";
  if (typeof s.mimeType !== "string"
    || !FEEDBACK_IMAGE_TYPES.includes(s.mimeType as FeedbackImageType)) {
    return "Bilagan måste vara en PNG- eller JPEG-bild.";
  }
  // Base64 blir ~4/3 av innehållet; jämför mot bildens tak, inte postens.
  const bytes = Math.floor((s.data.length * 3) / 4);
  if (bytes > FEEDBACK_ATTACHMENT_LIMITS.screenshotBytes) {
    return "Skärmbilden är för stor. Rapporten går att skicka utan den.";
  }
  return null;
}

/**
 * Bygger den post som faktiskt skickas.
 *
 * Det här är den enda platsen posten byggs. Transparensrutan i formuläret
 * läser samma objekt som går ut på nätet — det är därför den kan lova att
 * visa exakt vad som skickas utan att löftet kan glida isär från koden.
 *
 * Rubrik och beskrivning tvättas med sanitizeOutbound(): belopp,
 * personnummer och främmande e-postadresser ska inte lämna installationen ens
 * när kunden själv skrivit dem. Kundens EGEN e-postadress i e-postfältet rörs
 * inte — den är hela poängen med fältet.
 */
export function buildFeedbackPayload(input: {
  type: FeedbackType;
  title: string;
  message: string;
  email?: string;
  appVersion?: string;
  companyName?: string;
  technical?: FeedbackTechnical;
  screenshot?: FeedbackScreenshot;
  honeypot?: string;
}): FeedbackPayload {
  const payload: FeedbackPayload = {
    type: input.type,
    title: sanitizeOutbound(input.title.trim()).slice(0, FEEDBACK_LIMITS.title),
    message: sanitizeOutbound(input.message.trim()).slice(0, FEEDBACK_LIMITS.message),
    [FEEDBACK_HONEYPOT_FIELD]: input.honeypot ?? "",
  };

  const email = input.email?.trim();
  if (email) payload.email = email.slice(0, FEEDBACK_LIMITS.email);
  const appVersion = input.appVersion?.trim();
  if (appVersion) payload.appVersion = appVersion.slice(0, FEEDBACK_LIMITS.appVersion);
  const companyName = input.companyName?.trim();
  if (companyName) payload.companyName = companyName.slice(0, FEEDBACK_LIMITS.companyName);

  const technical = pickTechnical(input.technical);
  if (technical) payload.technical = technical;
  if (input.screenshot) payload.screenshot = input.screenshot;

  return payload;
}
