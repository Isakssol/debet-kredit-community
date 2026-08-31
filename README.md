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

## Det här behöver du

| Tjänst | Kostnad | Till vad | Krävs? |
|---|---|---|---|
| [Node.js 20+](https://nodejs.org) & [pnpm](https://pnpm.io) | Gratis | Köra appen lokalt | ✅ |
| [Supabase](https://supabase.com)-konto | Gratis (free tier räcker) | Databas, inloggning och kvittolagring | ✅ |
| [Vercel](https://vercel.com)-konto | Gratis (hobby tier räcker) | Köra appen i molnet så du når den från mobilen | Rekommenderas |
| [Anthropic](https://console.anthropic.com) API-nyckel | Betala per användning (~kronor/mån) | AI-bokföraren som läser kvitton | Rekommenderas |
| [Resend](https://resend.com)-konto + egen domän | Gratis-nivå finns | Mejla fakturor direkt från appen | Valfritt |

Ingen tidigare bokföringserfarenhet krävs — men läs på om grunderna
(verifikat, moms, BAS-kontoplanen) på [verksamt.se](https://verksamt.se)
och [Skatteverket](https://skatteverket.se).

## Installation (ca 10 minuter)

**1. Klona och installera:**
```bash
git clone https://github.com/Isakssol/debet-kredit.git && cd debet-kredit
pnpm install
```

**2. Skapa ett Supabase-projekt** på [supabase.com](https://supabase.com)
(New project → välj region, t.ex. Stockholm `eu-north-1`). Anteckna databas­lösenordet.

**3. Kör databasmigrationerna** (skapar alla tabeller, kontoplanen BAS 2026,
momskoder och regelvärden):
```bash
npx supabase link --project-ref <ditt-projekt-ref>
npx supabase db push
```
Projekt-ref är strängen i din Supabase-URL: `https://<projekt-ref>.supabase.co`.

**4. Skapa storage-bucketen för kvitton:** Supabase-panelen → Storage →
New bucket → namn `underlag`, **Private** (inte public).

**5. Skapa din inloggning:** Supabase-panelen → Authentication → Users →
Add user → e-post + lösenord (bocka i "Auto confirm"). Appen är
single-tenant: alla användare du skapar ser samma bokföring.

**6. Miljövariabler:**
```bash
cp .env.example .env.local
```
Fyll i `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY`
från Supabase-panelen → Project Settings → API.

**7. Starta och logga in:**
```bash
pnpm dev
```
Öppna [http://localhost:3000](http://localhost:3000), logga in och följ
kom igång-guiden (bolagstyp, företagsuppgifter, momsperiod, startläge —
byter du från Fortnox/Visma/Bokio kan du importera din SIE-fil direkt).

**8. Aktivera AI-bokföraren** (rekommenderas): skapa en API-nyckel på
[console.anthropic.com](https://console.anthropic.com) (sätt gärna ett
utgiftstak) och klistra in den i appen under
**Inställningar → Bolagstyp & AI-bokföraren**. Standardkonteringsregler
för din bolagstyp gäller automatiskt — anpassa dem fritt.

## Deploy till Vercel (valfritt, ca 5 minuter)

1. Forka/pusha repot till ditt eget GitHub-konto.
2. [vercel.com](https://vercel.com) → Add New → Project → importera ditt repo
   (framework upptäcks automatiskt: Next.js).
3. Lägg in samma miljövariabler som i `.env.local` under Environment Variables.
4. Deploy. Varje push till `main` deployar automatiskt.
5. Skydda gärna appen extra: Vercel → Settings → Deployment Protection.

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
