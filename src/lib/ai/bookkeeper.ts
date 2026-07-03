/**
 * AI-bokföraren: systemprompt med svensk EF-bokföringskunskap + aktuell
 * kontoplan, samt validering/normalisering av AI:ns konteringsförslag.
 */

export type AiSuggestionRow = {
  account: number;
  debit: number;
  credit: number;
  motivering?: string;
};

export type AiSuggestion = {
  datum: string;
  motpart: string;
  beskrivning: string;
  total_inkl_moms: number;
  moms_belopp: number;
  moms_sats: number;
  betalsatt: "foretagskonto" | "privat" | "okant";
  rader: AiSuggestionRow[];
  varningar: string[];
  fraga: string | null;
  confidence: "hog" | "medel" | "lag";
};

export function buildSystemPrompt(
  accounts: { number: number; name: string; description: string | null }[],
  rules: Record<string, number>,
  today: string
): string {
  const kontoplan = accounts
    .map((a) => `${a.number} ${a.name}${a.description ? ` — ${a.description}` : ""}`)
    .join("\n");

  return `Du är en expert på svensk löpande bokföring för ENSKILD FIRMA (K1, BAS 2026).
Din uppgift: analysera ett inköp (kvitto, leverantörsfaktura eller textbeskrivning)
och föreslå en komplett, korrekt kontering med dubbel bokföring.

DAGENS DATUM: ${today}

KONTOPLAN (använd ENDAST dessa konton):
${kontoplan}

REGLER SOM MÅSTE FÖLJAS:
1. Verifikatet MÅSTE balansera: summa debet = summa kredit, exakt på öret.
2. Moms: dela alltid upp i nettokostnad (debet kostnadskonto) + ingående moms
   (debet 2640). Betalt belopp krediteras 1930 (företagskonto) eller 2018
   (egen insättning om betalt privat/med privat kort).
3. Momssatser: 25 % normalt, 12 % livsmedel/restaurang (6 % livsmedel fr.o.m.
   2026-04-01), 6 % böcker/persontransport, 0 % försäkringar/bank/myndigheter.
4. Representation (måltid med affärskontakt): måltiden är EJ avdragsgill —
   netto + ej avdragsgill moms på 6072. Momslyft (2640) endast på underlag upp
   till ${rules["representation_moms_underlag"] ?? 300} kr/person. Enklare förtäring
   ≤ ${rules["representation_enklare"] ?? 60} kr/person → 6071 avdragsgill.
5. Inventarier ≥ ${rules["direktavdrag_inventarier"] ?? 29600} kr exkl. moms OCH ≥ 3 års
   livslängd → tillgång (1220 datorer→1250) som ska in i anläggningsregistret,
   annars 5410 Förbrukningsinventarier (direktavdrag).
6. Utländska SaaS/tjänster (USA, EU) med omvänd skattskyldighet: netto på 4531
   (utanför EU) eller 4535 (EU), utgående moms 2614 kredit + beräknad ingående
   moms 2645 debet (samma belopp, 25 % av netto). Krediten är 1930/2018 för
   det betalda beloppet (= netto vid reverse charge).
7. Skatteverket/F-skatt: ALDRIG kostnad — debet 2012 (eget uttag).
8. Drivmedel/bil: 5611. Mobilabonnemang: 6212. Bredband: 6230. Programvaror/
   licenser svenska: 5420. Molntjänster svenska: 6540. Kontorsmaterial: 6110.
9. Om kvittot är otydligt eller information saknas: gissa INTE vilt — sätt
   confidence "lag" och ställ en fraga.
10. Belopp i kronor med max 2 decimaler. Datum i YYYY-MM-DD (om kvittots datum
    saknas: använd dagens datum och varna).

SVARA ENDAST MED JSON i exakt detta format:
{
  "datum": "YYYY-MM-DD",
  "motpart": "leverantörens namn",
  "beskrivning": "kort verifikatbeskrivning med art och mängd (BFL 5:7)",
  "total_inkl_moms": 0,
  "moms_belopp": 0,
  "moms_sats": 25,
  "betalsatt": "foretagskonto" | "privat" | "okant",
  "rader": [
    { "account": 6110, "debit": 400, "credit": 0, "motivering": "kort förklaring" },
    { "account": 2640, "debit": 100, "credit": 0, "motivering": "ingående moms 25 %" },
    { "account": 1930, "debit": 0, "credit": 500 }
  ],
  "varningar": ["ev. varningar, t.ex. representation kräver deltagarlista"],
  "fraga": null,
  "confidence": "hog" | "medel" | "lag"
}`;
}

export type ValidatedSuggestion =
  | { ok: true; suggestion: AiSuggestion }
  | { ok: false; error: string };

/** Validera och normalisera AI:ns förslag innan det visas för användaren */
export function validateSuggestion(
  raw: unknown,
  validAccounts: Set<number>
): ValidatedSuggestion {
  const s = raw as Partial<AiSuggestion>;
  if (!s || !Array.isArray(s.rader) || s.rader.length < 2) {
    return { ok: false, error: "AI:n returnerade inga konteringsrader." };
  }

  const rows: AiSuggestionRow[] = [];
  for (const r of s.rader) {
    const account = Math.round(Number(r.account));
    const debit = Math.round((Number(r.debit) || 0) * 100) / 100;
    const credit = Math.round((Number(r.credit) || 0) * 100) / 100;
    if (!validAccounts.has(account)) {
      return { ok: false, error: `AI:n föreslog konto ${account} som inte finns i kontoplanen.` };
    }
    if (debit < 0 || credit < 0) {
      return { ok: false, error: "Negativa belopp i konteringen." };
    }
    if (debit === 0 && credit === 0) continue;
    rows.push({ account, debit, credit, motivering: r.motivering });
  }
  if (rows.length < 2) return { ok: false, error: "För få konteringsrader." };

  // Balanskontroll — öresdiffar upp till 1 kr justeras mot största raden
  const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  if (Math.abs(diff) > 1) {
    return { ok: false, error: `Konteringen balanserar inte (diff ${diff.toFixed(2)} kr).` };
  }
  if (diff !== 0) {
    const biggest = rows.reduce((a, b) =>
      Math.max(b.debit, b.credit) > Math.max(a.debit, a.credit) ? b : a);
    if (biggest.debit > 0) biggest.debit = Math.round((biggest.debit - diff) * 100) / 100;
    else biggest.credit = Math.round((biggest.credit + diff) * 100) / 100;
  }

  const datum = /^\d{4}-\d{2}-\d{2}$/.test(s.datum ?? "")
    ? s.datum!
    : new Date().toISOString().slice(0, 10);

  return {
    ok: true,
    suggestion: {
      datum,
      motpart: String(s.motpart ?? "").slice(0, 100),
      beskrivning: String(s.beskrivning ?? "Inköp").slice(0, 200),
      total_inkl_moms: Number(s.total_inkl_moms) || 0,
      moms_belopp: Number(s.moms_belopp) || 0,
      moms_sats: Number(s.moms_sats) || 0,
      betalsatt: (["foretagskonto", "privat", "okant"] as const)
        .includes(s.betalsatt as never) ? s.betalsatt as AiSuggestion["betalsatt"] : "okant",
      rader: rows,
      varningar: Array.isArray(s.varningar) ? s.varningar.map(String).slice(0, 5) : [],
      fraga: s.fraga ? String(s.fraga) : null,
      confidence: (["hog", "medel", "lag"] as const)
        .includes(s.confidence as never) ? s.confidence as AiSuggestion["confidence"] : "medel",
    },
  };
}
