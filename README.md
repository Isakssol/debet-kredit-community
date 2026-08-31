# Debet & Kredit

**Öppen bokföring för svenska småföretag.** Dubbel bokföring enligt BAS 2026,
AI-kontering av kvitton, momsdeklaration med eSKD-fil, fakturering, SIE 4 —
självhostat på din egen databas. Din bokföring lämnar aldrig din infrastruktur.

Byggd för enskild firma i första hand; aktiebolag och handelsbolag stöds för
löpande bokföring, moms och rapporter (se [Bolagstyper](#bolagstyper)).

> ⚠️ Debet & Kredit är ett verktyg, inte rådgivning. Du ansvarar själv för att din
> bokföring är korrekt. Vid osäkerhet — fråga en redovisningskonsult.

## Funktioner

- **Dubbel bokföring** — oföränderliga verifikat, obrutna nummerserier och
  balanskrav på databasnivå; rättelser via ändringsverifikat (BFNAR)
- **AI-bokförare** — fota kvittot, AI:n föreslår kontering enligt BAS 2026
  (inkl. omvänd skattskyldighet för EU-inköp), du granskar och godkänner.
  Egen API-nyckel (Anthropic eller OpenAI), valfri modell, egna konteringsregler
  och automatisk dubblettkontroll mot din tidigare bokföring
- **Moms** — deklaration ruta för ruta (månad/kvartal/helår) + eSKD-fil för
  uppladdning till Skatteverket
- **Fakturering** — PDF-fakturor, e-postutskick (Resend), påminnelser,
  kund- och artikelregister
- **Bankimport** — CSV-import som matchar mot fakturor och föreslår bokföring
- **Rapporter** — resultat, balans, huvudbok; export till PDF, CSV och SIE 4
- **Kvittoarkiv** — underlag lagras digitalt enligt 7-årskravet, kopplade
  till sina verifikat, med digital underlagsinkorg
- **Körjournal, anläggningsregister** med avskrivningar, leverantörsreskontra
- **Skattekalender & simulator** (enskild firma) — egenavgifter, eget uttag,
  periodiseringsfond
- **Årsavslut** (enskild firma) — förenklat årsbokslut K1 + NE-bilaga
- **Arkivexport** — hela räkenskapsåret som zip (SIE + alla underlag)

## Kom igång

Du behöver: [Node.js 20+](https://nodejs.org), [pnpm](https://pnpm.io),
ett gratis [Supabase](https://supabase.com)-projekt.

```bash
git clone <repo-url> debet-kredit && cd debet-kredit
pnpm install
```

1. **Skapa ett Supabase-projekt** och kör migrationerna:
   ```bash
   npx supabase link --project-ref <ditt-projekt-ref>
   npx supabase db push
   ```
2. **Skapa storage-bucketen** `underlag` (privat) under Storage i Supabase-panelen.
3. **Skapa en inloggningsanvändare** under Authentication → Users
   (e-post + lösenord). Appen är single-tenant: alla inloggade användare ser
   samma bokföring.
4. **Miljövariabler** — kopiera och fyll i:
   ```bash
   cp .env.example .env.local
   ```
5. **Starta:**
   ```bash
   pnpm dev
   ```
6. Logga in, följ kom igång-guiden och lägg in din AI-nyckel under
   **Inställningar → AI-bokföraren** (valfritt men rekommenderat).

Deploy: fungerar direkt på [Vercel](https://vercel.com) — sätt samma
miljövariabler där.

## Bolagstyper

| | Enskild firma | Aktiebolag | Handelsbolag |
|---|---|---|---|
| Löpande bokföring, verifikat, kvittoarkiv | ✅ | ✅ | ✅ |
| Moms + eSKD | ✅ | ✅ | ✅ |
| Fakturering, bank, rapporter, SIE 4 | ✅ | ✅ | ✅ |
| AI-kontering med typspecifika regler | ✅ | ✅ | ✅ |
| Skattesimulator | ✅ | — | — |
| Årsavslut (K1 + NE-bilaga) | ✅ | — | — |

Aktiebolag behöver årsredovisning enligt K2/K3 och handelsbolag N3A-bilagor —
det görs tills vidare utanför Debet & Kredit (exportera SIE 4 till din konsult).
Bidrag välkomna!

## AI-bokföraren

AI:n får din kontoplan, din bolagstyps regler, dina egna konteringsregler
(fritext under Inställningar) och dina 30 senaste verifikat — för
dubblettvarningar och konsekvent kontering. Den föreslår; **du godkänner varje
verifikat**. Nyckeln lagras i din databas (använd en nyckel med utgiftstak)
eller som miljövariabel. Text i kvitton behandlas som data, aldrig som
instruktioner till modellen.

## Säkerhet & arkitektur

- Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage)
- All åtkomst kräver inloggning (Supabase Auth); RLS på samtliga tabeller
- Verifikat är oföränderliga — bokning och rättelse sker via databas­funktioner
  som upprätthåller balans och nummerserier atomiskt
- Inga hemligheter i koden — nycklar lever i miljövariabler eller i din databas

## Licens

[AGPL-3.0](LICENSE). Fritt att använda, ändra och självhosta. Driver du det
som tjänst åt andra måste din version också vara öppen.
