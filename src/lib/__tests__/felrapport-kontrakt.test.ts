import { describe, it, expect } from "vitest";
import {
  FEEDBACK_ATTACHMENT_LIMITS, FEEDBACK_ENDPOINT, FEEDBACK_HONEYPOT_FIELD,
  buildFeedbackPayload, detectImageType, normalizeRoute, pickTechnical,
  validateFeedbackAttachment,
} from "@/lib/feedback";

/**
 * Kontraktet mot den centrala insamlingen, prövat från AVSÄNDARENS sida.
 *
 * Community-utgåvan äger inte mottagaren — den bor på debea.se. Testerna här
 * är därför exakt de fall ur licensutgåvans endpointtest som gäller det som
 * lämnar en installation. Går de isär har utgåvorna glidit isär, och det är
 * just det man inte upptäcker förrän en rapport redan kommit fram trasig.
 */

/** Enkel PNG- respektive JPEG-inledning. Magiska byte, inget mer. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);

// ---------------------------------------------------------------- kontraktet

describe("normalizeRoute", () => {
  it("mallar bort identifierare men behåller vilken vy det gäller", () => {
    expect(normalizeRoute("/verifikat/9f3a1c2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b")).toBe("/verifikat/:id");
    expect(normalizeRoute("/fakturor/1042/redigera")).toBe("/fakturor/:id/redigera");
    expect(normalizeRoute("/kunder")).toBe("/kunder");
    expect(normalizeRoute("/")).toBe("/");
  });

  it("kastar query och hash — de bär sökord, belopp och id", () => {
    expect(normalizeRoute("/sok?q=Anders%20Ek&belopp=12500")).toBe("/sok");
    expect(normalizeRoute("/rapporter#resultat")).toBe("/rapporter");
  });

  it("faller tillbaka på / i stället för att gissa", () => {
    expect(normalizeRoute(undefined)).toBe("/");
    expect(normalizeRoute("")).toBe("/");
    expect(normalizeRoute(42)).toBe("/");
  });
});

describe("detectImageType — magiska byte, inte påstådd typ", () => {
  it("känner igen PNG och JPEG", () => {
    expect(detectImageType(new Uint8Array(PNG))).toBe("image/png");
    expect(detectImageType(new Uint8Array(JPEG))).toBe("image/jpeg");
  });

  it("avvisar allt annat, hur det än märkts", () => {
    expect(detectImageType(new Uint8Array(ZIP))).toBeNull();
    expect(detectImageType(new Uint8Array([0x00]))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });
});

describe("validateFeedbackAttachment", () => {
  it("säger ja till ett inskick utan bilaga — det är normalfallet", () => {
    expect(validateFeedbackAttachment({})).toBeNull();
    expect(validateFeedbackAttachment({ screenshot: undefined })).toBeNull();
    expect(validateFeedbackAttachment({ screenshot: null })).toBeNull();
  });

  it("kräver ett format vi kan visa", () => {
    expect(validateFeedbackAttachment({
      screenshot: { mimeType: "application/zip", data: "AAAA" },
    })).toContain("PNG");
  });

  it("avvisar en bild över taket", () => {
    const tooBig = "A".repeat(Math.ceil((FEEDBACK_ATTACHMENT_LIMITS.screenshotBytes + 1000) * 4 / 3));
    expect(validateFeedbackAttachment({
      screenshot: { mimeType: "image/jpeg", data: tooBig },
    })).toContain("för stor");
  });
});

describe("pickTechnical — vitlistning", () => {
  it("släpper bara igenom de fält som finns i kontraktet", () => {
    const picked = pickTechnical({
      route: "/fakturor/:id",
      viewport: "1512x982",
      theme: "dark",
      hemligt: "kundens hela reskontra",
      detail: { belopp: 12500 },
    });
    expect(picked).toEqual({
      route: "/fakturor/:id",
      buildSha: undefined,
      viewport: "1512x982",
      theme: "dark",
      locale: undefined,
      tzOffset: undefined,
      clientErrors: undefined,
      appLogExcerpt: undefined,
    });
    expect(JSON.stringify(picked)).not.toContain("reskontra");
    expect(JSON.stringify(picked)).not.toContain("12500");
  });

  it("kapar antalet rader till taken", () => {
    const picked = pickTechnical({
      clientErrors: Array.from({ length: 60 }, (_, i) => ({ at: "", kind: "error", message: `fel ${i}`, source: "", count: 1 })),
      appLogExcerpt: Array.from({ length: 60 }, (_, i) => ({ at: "", level: "warn", source: "cron", message: `rad ${i}` })),
    });
    expect(picked?.clientErrors).toHaveLength(FEEDBACK_ATTACHMENT_LIMITS.clientErrors);
    expect(picked?.appLogExcerpt).toHaveLength(FEEDBACK_ATTACHMENT_LIMITS.appLogLines);
  });

  it("tvättar fritexten även när avsändaren inte gjort det", () => {
    // En äldre eller ombyggd klient kan skicka otvättat. Mottagaren litar inte.
    const picked = pickTechnical({
      clientErrors: [{ at: "", kind: "error", message: "Bokföring av 12 500,00 kr för anna@kund.se sprack", source: "", count: 1 }],
      appLogExcerpt: [{ at: "", level: "error", source: "cron", message: "orgnr 556677-8899 saknas" }],
    });
    expect(picked?.clientErrors?.[0].message).toBe("Bokföring av ••• kr för ••••@••••.se sprack");
    expect(picked?.appLogExcerpt?.[0].message).toBe("orgnr ••••-•••• saknas");
  });

  it("ger undefined när det inte finns något att bifoga", () => {
    expect(pickTechnical(undefined)).toBeUndefined();
    expect(pickTechnical({})).toBeUndefined();
    expect(pickTechnical("nej")).toBeUndefined();
  });
});

describe("buildFeedbackPayload", () => {
  it("är den enda platsen posten byggs — det som visas är det som skickas", () => {
    const payload = buildFeedbackPayload({
      type: "bug",
      title: "  Fakturan på 12 500 kr blev fel  ",
      message: "Kunden 9f3a1c2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b fick fel datum.",
      appVersion: "0.1.0",
    });
    expect(payload.title).toBe("Fakturan på ••• kr blev fel");
    expect(payload.message).toContain("uuid-••••");
    expect(payload.email).toBeUndefined();
    expect(payload.companyName).toBeUndefined();
  });

  it("rör aldrig kundens egen svarsadress", () => {
    const payload = buildFeedbackPayload({
      type: "bug", title: "Rubrik", message: "Beskrivning här.",
      email: " Oliver@Foretaget.se ",
    });
    expect(payload.email).toBe("Oliver@Foretaget.se");
  });

  it("tar bara med företagsnamnet när det skickats in", () => {
    const utan = buildFeedbackPayload({ type: "bug", title: "Rubrik", message: "Beskrivning här." });
    const med = buildFeedbackPayload({
      type: "bug", title: "Rubrik", message: "Beskrivning här.", companyName: "Bokförings AB",
    });
    expect(utan.companyName).toBeUndefined();
    expect(med.companyName).toBe("Bokförings AB");
  });
});

// ------------------------------------------------- community-utgåvan särskilt

describe("community-utgåvan som avsändare", () => {
  it("postar hem, inte till den egna installationen", () => {
    // Insamlingen är central. Går adressen att peka om — till en miljövariabel,
    // till kundens egen domän — hamnar rapporterna någon annanstans än hos den
    // som kan laga felet, och ingen märker det.
    expect(FEEDBACK_ENDPOINT).toBe("https://debea.se/api/feedback");
    expect(new URL(FEEDBACK_ENDPOINT).protocol).toBe("https:");
  });

  it("skickar aldrig loggrader — den här utgåvan har ingen egen systemlogg", () => {
    const payload = buildFeedbackPayload({
      type: "bug",
      title: "Rubrik",
      message: "Beskrivning här.",
      technical: {
        route: "/verifikat/:id",
        buildSha: "abc1234",
        viewport: "1512x982",
        theme: "light",
        locale: "sv-SE",
        tzOffset: -120,
        clientErrors: [{ at: "", kind: "error", message: "TypeError: x", source: "app.js:1:1", count: 1 }],
      },
    });
    expect(payload.technical?.clientErrors).toHaveLength(1);
    expect(payload.technical?.appLogExcerpt).toBeUndefined();
  });

  it("har alltid med honeypotfältet, tomt, så mottagarens skydd fungerar", () => {
    const payload = buildFeedbackPayload({ type: "bug", title: "Rubrik", message: "Beskrivning här." });
    expect(payload[FEEDBACK_HONEYPOT_FIELD]).toBe("");
  });

  it("bär aldrig bokföringsdata ut ur installationen", () => {
    const payload = buildFeedbackPayload({
      type: "bug",
      title: "Kunden Anders fick faktura på 12 500,00 kr",
      message: "Verifikat 9f3a1c2e-4b5d-6e7f-8a9b-0c1d2e3f4a5b, orgnr 556677-8899, bg 5051-6905.",
      technical: {
        clientErrors: [{ at: "", kind: "network", message: "POST /api/fakturor svarade 500 för anna@kund.se", source: "/api/fakturor", count: 2 }],
      },
    });
    const wire = JSON.stringify(payload);
    for (const leak of ["12 500", "9f3a1c2e", "556677-8899", "5051-6905", "anna@kund.se"]) {
      expect(wire).not.toContain(leak);
    }
    // Det som ÄR nyttigt står kvar: vilken vy, vilken status, vilket anrop.
    expect(wire).toContain("POST /api/fakturor svarade 500");
  });
});
