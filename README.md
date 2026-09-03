# Debet & Kredit — Community Edition

> **Det här är den fria Community-versionen** (AGPL-3.0), fryst per
> 2026-09-01. Den fungerar komplett som den är — men koden står stilla.
> Fryst betyder allt som det låter: inga nya funktioner, inga rättelser, inga
> säkerhetsuppdateringar, ingen support, och **inte nästa års regelvärden**
> (basbelopp, avgiftssatser och momsregler ändras varje årsskifte — den som
> bokför på gamla värden bokför fel). Du får koden som den är, med full rätt
> att ändra den själv; underhållet är ditt.
>
> Vill du ha autopiloten — AI-bokföraren som läser kvittot och konterar,
> rådgivaren, bankregler som bokför av sig själva, lön med AGI, offert- och
> orderkedjan, e-faktura (Peppol), attest av leverantörsfakturor, betalfil
> till banken, roller och behörigheter, lokalt LLM-stöd, årets regelvärden
> och support — finns licens (engångspris) och komplett uppsättning:
> **testa demon och läs mer på [debea.se/priser](https://debea.se/priser)**.

**Öppen bokföring för svenska småföretag.** Dubbel bokföring enligt BAS 2026,
momsdeklaration med eSKD-fil, fakturering, bankimport med avstämning och
SIE 4 — självhostat på din egen databas, på konton du äger. Ingen data lämnar
din installation: här finns ingen AI-leverantör, ingen molntjänst och inga
API-nycklar att hålla reda på.

**Allt räknas fram och föreslås — du trycker på knappen. I licensversionen
sker det av sig självt, med AI som gör grovjobbet.** Momsen räknas ihop ruta
för ruta, bankraderna matchas mot fakturor, reglerna pekar ut konteringen,
skatten simuleras och årsavslutet fylls i — men ingenting bokförs förrän du
säger till.

Byggd för enskild firma i första hand; aktiebolag och handelsbolag stöds för
löpande bokföring, moms och rapporter (se [Bolagstyper](#bolagstyper)).

## Kom igång på 20 minuter

Du behöver inte kunna programmera. [Bildguiden på
debea.se](https://debea.se/kom-igang/community) tar dig steg för steg, med
skärmbilder hela vägen, från tomt konto till ett körande bokföringsprogram på
din egen adress.

- **[Bildguiden: kom igång med Community](https://debea.se/kom-igang/community)**
  Skärmbild för skärmbild. Databas, hosting och första inloggningen.
- **[Registrera dig och få guiden i mejlen](https://debea.se/community)**
  Lämnar du din mejladress skickar vi guiden, supportvägen och en kort
  beskrivning av vad som skiljer Community från licensen. Frivilligt: all kod
  ligger här i repot, och du kan klona den utan att lämna någonting.
- **Föredrar du text?** Samma installation beskrivs i
  [docs/INSTALLATION.md](docs/INSTALLATION.md).

Vill du se programmet innan du installerar det: [demon på
debea.se](https://debea.se/demo) kör hela programmet med exempeldata, utan
konto och utan installation.

## Uppgradera till licens — behåll all din bokföring

Uppgraderingen görs på din befintliga installation, mot samma databas:
verifikat, fakturor, kunder, kvitton och saldon följer med, på ungefär en
kvart. Steg för steg i licensrepots `docs/UPPGRADERA-FRAN-COMMUNITY.md`.
Priser och köp: [debea.se/priser](https://debea.se/priser).


> ⚠️ Debet & Kredit är ett verktyg, inte rådgivning. Du ansvarar själv för att din
> bokföring är korrekt. Vid osäkerhet — fråga en redovisningskonsult.

## Funktioner

- **Dubbel bokföring** — oföränderliga verifikat, obrutna nummerserier och
  balanskrav på databasnivå; rättelser via ändringsverifikat (BFNAR).
  Konteringsmallar och snabbhändelser för det som återkommer
- **Moms** — deklaration ruta för ruta (månad/kvartal/helår) + eSKD-fil för
  uppladdning till Skatteverket
- **Fakturering** — PDF-fakturor, e-postutskick (Resend), påminnelser,
  kund- och artikelregister
- **Leverantörsfakturor** — reskontra med förfallobevakning och betalning
- **Bank** — PSD2-koppling (Enable Banking) och CSV-import. Transaktionerna
  matchas mot öppna fakturor och bokförda verifikat, dina egna
  bokföringsregler pekar ut kontering och momssats — och du bokför träffarna
  när du själv trycker på knappen. Pricka av mot bokföringen i avstämningen
- **Underlagsinkorg & kvittoarkiv** — ladda upp kvitton och fakturor nu,
  bokför när du har tid; underlagen kopplas till sina verifikat och arkiveras
  enligt 7-årskravet
- **Rapporter** — resultat, balans, huvudbok; export till PDF, CSV och SIE 4,
  och SIE-import när du flyttar in från ett annat program
- **SRU-export** — inkomstdeklarationen som filer för Skatteverkets
  filöverföringstjänst: NE-bilaga + INK1-utkast (enskild firma) och
  INK2 + INK2R + INK2S (aktiebolag)
- **Årsavslut** (enskild firma) — förenklat årsbokslut K1 + NE-bilaga
- **Årsredovisning K2** (aktiebolag) — komplett utskrivbart dokument:
  förvaltningsberättelse, resultat- och balansräkning, noter
- **Skattekalender & simulator** (enskild firma) — egenavgifter, eget uttag,
  periodiseringsfond, med deadlines i Att göra-listan
- **Körjournal, anläggningsregister** med avskrivningar
- **Översikt med egna nyckeltal** — välj vilka widgets du vill se, teman och
  färgsättning, samt ett läs-API (`/api/stats`) för egna integrationer
- **Mobilapp (PWA)** — installera på hemskärmen och fota kvitton rakt in i
  underlagsinkorgen
- **Arkivexport** — hela räkenskapsåret som zip (SIE + alla underlag)

### Finns inte här — det är licensversionen

AI-bokföraren som läser kvittot och konterar, AI-rådgivaren, förslagskön,
bankregler som bokför av sig själva vid import, lön med AGI-fil, samt
säljdelen (pipeline, offert och order). Community-versionen räknar fram och
föreslår; den agerar aldrig på egen hand.

## Det här behöver du

| Tjänst | Kostnad | Till vad | Krävs? |
|---|---|---|---|
| [Node.js 20+](https://nodejs.org) & [pnpm](https://pnpm.io) | Gratis | Köra appen lokalt | ✅ |
| [Supabase](https://supabase.com)-konto | Gratis (free tier räcker) | Databas, inloggning och kvittolagring | ✅ |
| [Vercel](https://vercel.com)-konto | Gratis (hobby tier räcker) | Köra appen i molnet så du når den från mobilen | Rekommenderas |
| [Resend](https://resend.com)-konto + egen domän | Gratis-nivå finns | Mejla fakturor direkt från appen | Valfritt |

Ingen tidigare bokföringserfarenhet krävs — men läs på om grunderna
(verifikat, moms, BAS-kontoplanen) på [verksamt.se](https://verksamt.se)
och [Skatteverket](https://skatteverket.se).

## Installation (ca 10 minuter)

Snabbversionen står här. Den utförliga guiden — med kontoskapande, Vercel,
felsökning och skärm för skärm — är
[docs/INSTALLATION.md](docs/INSTALLATION.md).

**1. Klona och installera:**
```bash
git clone https://github.com/Isakssol/debet-kredit-community.git && cd debet-kredit-community
pnpm install
```
Klagar `pnpm install` på build-skript (sharp, unrs-resolver): kör
`pnpm approve-builds`, godkänn dem, och kör `pnpm install` igen.

**2. Skapa ett Supabase-projekt** på [supabase.com](https://supabase.com)
(New project → välj region, t.ex. Stockholm `eu-north-1`). Anteckna databas­lösenordet.

**3. Kör databasmigrationerna** (skapar alla tabeller, kontoplanen BAS 2026,
momskoder och regelvärden):
```bash
npx supabase link --project-ref <ditt-projekt-ref>
npx supabase db push
```
Projekt-ref är strängen i din Supabase-URL: `https://<projekt-ref>.supabase.co`.

**4. Kvittoarkivet:** migrationerna försöker skapa lagringsytan (bucketen)
`underlag`. Kontrollera under Supabase-panelen → **Storage** att den finns och
är **privat**. Saknas den: New bucket → namn `underlag`, **Private** (inte
public).

**5. Skapa din inloggning:** Supabase-panelen → Authentication → Users →
Add user → e-post + lösenord (bocka i "Auto confirm"). Appen är
single-tenant: alla användare du skapar ser samma bokföring.

**6. Stäng av självregistrering — gör det innan du deployar:**
Authentication → Sign In / Up → slå AV **Allow new users to sign up**.
Anon-nyckeln är publik och appen är single-tenant, så varje konto som skapas
ser hela din bokföring. Ordningen är: skapa ditt eget konto (steg 5) → stäng
av självregistrering → deploya. Fler användare lägger du sedan upp på samma
sätt som ditt eget, i Supabase-panelen.

**7. Miljövariabler:** skapa `.env.local` i projektroten med värdena från
Supabase-panelen → Project Settings → API:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<projekt-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-nyckeln>
```

**8. Starta och logga in:**
```bash
pnpm dev
```
Öppna [http://localhost:3000](http://localhost:3000), logga in och följ
kom igång-guiden (bolagstyp, företagsuppgifter, momsperiod, startläge —
byter du från Fortnox/Visma/Bokio kan du importera din SIE-fil direkt).

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
| Skattesimulator | ✅ | — | — |
| Årsavslut K1 + NE-bilaga + SRU (NE/INK1) | ✅ | — | — |
| Årsredovisning K2 (dokument) + SRU (INK2/INK2R/INK2S) | — | ✅ | — |

Kvar för handelsbolag: N3A-bilagor. K2-dokumentet skrivs ut och lämnas till
Bolagsverket (digital inlämning via deras e-tjänst är nästa steg). Bidrag
välkomna!

## Ny på bokföring?

Läs [Konteringsguiden](docs/KONTERINGSGUIDE.md) — momssatserna, vanliga
inköp och vilket konto de hör hemma på, avdragsfällorna, EU-inköp med omvänd
skattskyldighet och vad som gäller när du betalat privat.

## Så här är den tänkt att användas

Programmet gör förarbetet: momsrutorna räknas ihop, bankraderna matchas mot
öppna fakturor, bokföringsreglerna pekar ut konto och momssats, avskrivningar
och skatt beräknas, årsavslutet fylls i. Sedan tar du beslutet — inget
verifikat bokförs utan att du klickar. Det är en medveten gräns: du är
ansvarig för bokföringen, alltså ska du också ha sett den.

Vill du att samma arbete ska ske av sig självt — kvitton som läses och
konteras av AI, en förslagskö att bara godkänna, bankregler som bokför direkt
vid import — är det den licensierade versionen som gäller.

## Säkerhet & arkitektur

- Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage)
- All åtkomst kräver inloggning (Supabase Auth); RLS på samtliga tabeller.
  Självregistrering ska vara avstängd i Supabase — anon-nyckeln är publik och
  appen är single-tenant, så varje konto som kan skapas ser hela bokföringen
- Verifikat är oföränderliga — bokning och rättelse sker via databas­funktioner
  som upprätthåller balans och nummerserier atomiskt
- Inga hemligheter i koden — nycklar lever i miljövariabler eller i din databas

## Licens

[AGPL-3.0](LICENSE) med möjlighet till kommersiell licens (dubbellicensiering).

**För dig som självhostar till ditt eget företag:** helt fritt. Använd, ändra,
kör — inga krav utöver licenstexten.

**För dig som vill bygga en kommersiell tjänst på koden** (t.ex. sälja den som
molntjänst till andra): AGPL kräver då att hela din version, inklusive dina
ändringar, publiceras öppet under samma licens. Vill du slippa det kravet och
driva en stängd kommersiell produkt erbjuds en **kommersiell licens** — öppna
ett ärende i repot eller kontakta upphovsrättsinnehavaren, så kommer vi överens
om villkoren.

**Bidrag:** det här repot är fryst och tar inte emot pull requests —
utvecklingen fortsätter i den licensierade versionen. Villkoren för bidrag
står kvar i [CONTRIBUTING.md](CONTRIBUTING.md) för den som forkar och driver
vidare på egen hand, vilket AGPL uttryckligen tillåter.
