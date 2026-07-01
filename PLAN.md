# Bokföringsprogram för Oliver Isaksson (trimtech) — Komplett funktionsplan

> Enskild firma, en användare, kalenderår, Sverige. Byggs med Next.js + Supabase.
> Referenser analyserade: Fortnox och Visma eEkonomi (Spiris). Regelverk verifierat för inkomstår 2026.
> Ingen bankkoppling i v1 (förberedd i datamodellen).

---

## 1. Grundbeslut (fastställda)

| Beslut | Val |
|---|---|
| Företagsform | Enskild firma → **eget uttag, aldrig lön**. Ingen AGI, inga arbetsgivaravgifter. |
| Bokföringsmetod | **Både faktureringsmetoden och kontantmetoden (bokslutsmetoden)** — inställning per räkenskapsår |
| Momsperiod | **Inställbar**: månad / kvartal / helår (styr momsrapport + deadlines) |
| Räkenskapsår | Kalenderår (lagkrav för EF) |
| Bokslut | Förenklat årsbokslut (K1, BFNAR 2006:1) — tillåtet ≤ 3 mkr omsättning |
| Stack | Next.js (App Router) + Supabase (Postgres, Auth, Storage) |
| Användare | 1 st (Oliver). Ingen RBAC, inget attestflöde. |

---

## 2. Regelverk som styr designen (2026)

### Bokföringslagen & god sed (hårda systemkrav)
- **Verifikat är oföränderliga.** Rättelse sker ALDRIG genom radering/ändring — endast via **ändringsverifikat** som refererar originalet (och originalet refererar tillbaka). Enda tillåtna radering: senaste verifikatet i sin serie (Fortnox-modellen).
- **Obrutna verifikationsnummerserier** per serie och räkenskapsår. Nummer sätts vid bokföring, aldrig återanvänds.
- Verifikatets innehållskrav (BFL 5:7): registreringsdatum, affärshändelsens datum, beskrivning (art + mängd), belopp, motpart, hänvisning till underlag, verifikationsnummer.
- **Periodlåsning**: låst period tillåter inga nya/ändrade verifikat. Godkänd momsrapport låser momsperioden automatiskt.
- **Arkivering 7 år** — digitalt räcker (originalkrav slopat juli 2024). Bilagor lagras i Supabase Storage, får aldrig raderas medan verifikatet finns.
- Dubbel bokföring: varje verifikat måste balansera (Σ debet = Σ kredit) — DB-constraint, inte bara UI-validering.

### Moms 2026
- Satser: **25 / 12 / 6 / 0 %**. **Datumstyrda satser i systemet** (tabell, inte hårdkodat): livsmedel 12 % → 6 % fr.o.m. 2026-04-01 (t.o.m. 2027-12-31). Satsen bestäms av leverans-/affärshändelsedatum.
- Momsdeklarationens rutor 05–62 mappas från konton via **momskod per konto** (se §5).
- Deklarationsdatum: 12:e i andra månaden efter periodens slut (17 jan / 17 aug). Helårsmoms utan EU-handel: 12 maj året efter; med EU-handel: 26 feb.
- Momsbefrielsegräns 120 000 kr (ej aktuell — trimtech är momsregistrerad, men bra att känna till).
- Kontantmetoden: moms redovisas vid betalning; vid årsskiftet ska dock obetalda fordringar/skulder bokföras.
- EU-försäljning av tjänster (ruta 39) kräver **periodisk sammanställning** — flaggas i skattekalendern.

### Enskild firma-specifikt 2026
| Post | Värde |
|---|---|
| Egenavgifter, full sats | **28,97 %** (generell nedsättning 7,5 %, max 15 000 kr/år vid överskott > 40 000 kr) |
| Schablonavdrag egenavgifter (NE R43) | **25 %** |
| Debiterad preliminärskatt (F-skatt) | 12:e varje månad (17 jan/aug). Bokförs **debet 2012 / kredit 1930** = eget uttag, ALDRIG kostnad |
| Periodiseringsfond | **30 %** av justerat resultat, återförs senast år 6. Ren deklarationspost — bokförs INTE vid K1. Ingen schablonintäkt för EF |
| Räntefördelning 2026 | Positiv **8,55 %** (frivillig, kapitalunderlag > 50 000 kr), negativ **3,55 %** (obligatorisk < −50 000 kr) |
| Expansionsfond | Skatt 20,6 %, tak 125,94 % av kapitalunderlaget |
| Prisbasbelopp | **59 200 kr** → direktavdrag inventarier < **29 600 kr** exkl. moms |
| Milersättning egen bil | **25 kr/mil** skattefritt |
| Traktamente inrikes | 300 kr helt / 150 kr halvt |
| Representation måltid | 0 kr avdragsgillt; moms lyfts på underlag ≤ 300 kr/person. Enklare förtäring ≤ 60 kr/person avdragsgill |
| Statlig skatt, skiktgräns | 660 400 kr |

### Fakturakrav (momslagen 17 kap.)
Fullständig faktura: utfärdandedatum, **löpnummer** (obruten serie), säljarens VAT-nr (SE + personnr + 01), köparens VAT-nr vid EU/omvänd, namn+adress båda parter, art & mängd, leveransdatum, underlag per momssats, à-pris exkl. moms, rabatt, momssats, momsbelopp i SEK, samt lagtext-hänvisning vid omvänd skattskyldighet/EU-försäljning. Förenklad faktura tillåten ≤ 4 000 kr ink. moms (ej vid EU-handel). Kreditnota kräver otvetydig hänvisning till ursprungsfakturan.

---

## 3. Arkitektur

```
Next.js (App Router, TypeScript, Tailwind + shadcn/ui)
├── Server Actions / Route Handlers → all bokföringslogik körs server-side
├── PDF-generering: @react-pdf/renderer (fakturor, rapporter)
├── E-post: Resend (fakturautskick med PDF-bilaga)
└── Supabase
    ├── Postgres — all data, constraints för balans/serier/låsning
    ├── Auth — en användare (e-post + lösenord/magic link)
    └── Storage — bucket "underlag" (kvitton, fakturabilagor, PDF-arkiv)
```

**Principer:**
- All kontering genereras av en central `posting engine` (ren funktion: händelse in → verifikatrader ut) så att faktura-, moms- och bokslutsmoduler delar samma logik och blir testbar.
- Verifikat skrivs i en Postgres-transaktion med balans-check och serienummer via `SELECT ... FOR UPDATE` (inga hål i serien).
- Immutability enforce:as med triggers: UPDATE/DELETE på bokfört verifikat blockeras (utom "senaste i serien"-radering).
- Belopp lagras som `numeric(12,2)`, aldrig float. Moms beräknas per rad, öresavrundning på totalen mot konto 3740.
- Alla regelvärden (momssatser, basbelopp, egenavgiftssats, räntefördelningsräntor, milersättning) ligger i en `regelvärden`-tabell med giltighetsdatum — nya år = nya rader, ingen kodändring.

---

## 4. Datamodell (Supabase-tabeller)

**Grunddata**
- `settings` — företagsuppgifter (namn, orgnr/personnr, adress, VAT-nr SE...01, bankgiro/IBAN, logotyp), momsmetod, momsperiod, fakturainställningar (betalningsvillkor default, påminnelseavgift, dröjsmålsränta)
- `fiscal_years` — räkenskapsår, status (öppet/avslutat), IB förda ja/nej
- `accounts` — kontoplan (nr, namn, klass, momskod, SRU-kod, NE-ruta, aktiv, spärrmarkering)
- `vat_rates` — momssatser med giltighetsintervall (datumstyrt)
- `rule_values` — basbelopp, egenavgifter, räntor m.m. per år
- `verification_series` — serier (A–…) med beskrivning och nästa nummer per räkenskapsår

**Bokföring**
- `verifications` — id, serie, nummer, verifikationsdatum, registreringsdatum, beskrivning, motpart, status, `corrects_verification_id` / `corrected_by_verification_id` (rättelsekedja), källa (manuell/faktura/moms/bokslut)
- `verification_rows` — konto, debet, kredit, transaktionstext
- `attachments` — koppling verifikat ↔ fil i Storage (typ, filnamn, uppladdningsdatum)
- `period_locks` — låsta perioder (år+månad, låst av momsrapport eller manuellt)

**Fakturering**
- `customers` — kundnr (auto), namn, orgnr, adress, leveransadress, e-post, betalningsvillkor, momstyp (SE / EU omvänd / export), språk, valuta, VAT-nr
- `articles` — artikelnr, benämning, enhet, à-pris, momssats, typ (vara/tjänst), försäljningskonto
- `invoices` — fakturanr (obruten serie), OCR (Luhn + längdsiffra), typ (debet/kredit), datum, förfallodatum, kund-snapshot (namn/adress fryses vid bokföring), status (utkast/bokförd/skickad/delbetald/betald/förfallen/krediterad/makulerad), `credits_invoice_id`, husarbete-fält (v2), verifikat-id
- `invoice_rows` — artikel, text, antal, à-pris, rabatt, momssats, konto
- `invoice_payments` — datum, belopp, verifikat-id (delbetalningar = flera rader)
- `invoice_reminders` — påminnelse nr, datum, avgift
- `recurring_invoices` — mall + intervall + nästa datum (v1.5)

**Leverantörer**
- `suppliers` — namn, orgnr, bankgiro/plusgiro, betalningsvillkor
- `supplier_invoices` — fakturanr, OCR, datum, förfallodatum, belopp, moms, status, verifikat-id, bilaga
- `supplier_payments` — datum, belopp, verifikat-id

**Moms & deklaration**
- `vat_reports` — period, status (utkast/godkänd), belopp per ruta (05–62), omföringsverifikat-id, eSKD-fil
- `tax_deadlines` — genererad skattekalender (typ, datum, status klar/kvar)

**Bokslut & tillgångar**
- `assets` — anläggningsregister: benämning, anskaffningsdatum/-värde, konto, avskrivningsmetod (30/20-regeln), ack. avskrivning, såld/utrangerad
- `year_end_closings` — per år: checklista-status, avskrivningsverifikat, K1-blankettdata, NE-data, periodiseringsfonder (avsättningar/återföringar per år), räntefördelning (sparat utrymme), resultat

---

## 5. Kontoplan — BAS 2026 anpassad för trimtech (tjänsteföretag)

Kontoregistret seedas från **BAS 2026** (bas.se — 272 ändringar mot 2025, främst klass 4; hämta officiella Excel-filen vid implementation). Varje konto får: momskod, SRU-kod (för SIE/deklaration) och NE-ruta. Användaren kan aktivera fler BAS-konton vid behov — nedan är de ~95 som aktiveras från start:

### Tillgångar (klass 1)
`1220` Inventarier · `1229` Ack avskr inventarier · `1250` Datorer · `1259` Ack avskr datorer · `1510` Kundfordringar · `1630` Skattekonto (används normalt ej i EF) · `1650` Momsfordran · `1680` Övriga kortfristiga fordringar · `1710` Förutbet hyra · `1730` Förutbet försäkring · `1790` Övr förutbet kostnader · `1910` Kassa · `1930` Företagskonto · `1940` Övriga bankkonton

### Eget kapital & skulder (klass 2) — EF-hjärtat
`2010` Eget kapital · `2011` Egna varuuttag · `2012` Avräkning skatter/avgifter (**F-skatt = eget uttag**) · `2013` Övriga egna uttag · `2018` Övriga egna insättningar · `2019` Årets resultat · `2440` Leverantörsskulder · `2611` Utg moms 25 % · `2621` Utg moms 12 % · `2631` Utg moms 6 % · `2614` Utg moms omvänd 25 % (EU-inköp) · `2640` Ing moms · `2645` Beräknad ing moms utland · `2650` Momsredovisningskonto · `2890` Övr kortfristiga skulder · `2990` Upplupna kostnader

### Intäkter (klass 3)
`3001` Försäljning 25 % (ruta 05) · `3011/3041` Tjänster 25 % · `3105` Export varor (ruta 36) · `3106` EU-försäljning varor (ruta 35) · `3305` Tjänster utanför EU (ruta 40) · `3308` Tjänster EU omvänd (ruta 39) · `3540` Faktureringsavgifter · `3590` Övr fakturerade kostnader · `3740` Öresutjämning · `3990` Övriga intäkter

### Inköp (klass 4 — ⚠ omgjord i BAS 2026, verifieras mot Excel)
`4010` Inköp material/varor · `4531–4537` Inköp tjänster utland (rutorna 21/22) · `4515–4517` Inköp varor EU (ruta 20) · `4600` Underentreprenader

### Kostnader (klass 5–6)
`5010` Lokalhyra · `5220` Hyra inventarier · `5410` Förbrukningsinventarier (< 29 600 kr) · `5420` Programvaror · `5460` Förbrukningsmaterial · `5611/5612/5613/5615` Bilkostnader · `5800/5810/5831` Resor · `5910` Annonsering · `6071` Representation avdragsgill · `6072` Representation ej avdragsgill · `6110` Kontorsmaterial · `6212` Mobiltelefon · `6230` Bredband/datakommunikation · `6250` Porto · `6310` Företagsförsäkring · `6530` Redovisningstjänster · `6540` IT-tjänster/SaaS · `6550` Konsultarvoden · `6570` Bankkostnader · `6590` Övr externa tjänster · `6970` Facklitteratur · `6981/6982` Föreningsavgifter (avdr/ej avdr) · `6991/6992` Övr kostnader (avdr/ej avdr)

### Avskrivningar & finansiellt (klass 7–8)
`7832` Avskr inventarier · `7835` Avskr datorer · `7973/3973` Förlust/vinst avyttring inventarier · `8310` Ränteintäkter · `8410` Räntekostnader · `8423` Kostnadsränta skattekonto (ej avdr) · `8999` Årets resultat

**OBS:** Inga 7010/7510-lönekonton aktiveras (inga anställda). Egenavgifter bokförs INTE (K1 — hanteras som schablonavdrag i NE-bilagan).

### Momskodsmappning (konto → deklarationsruta)
| Momskod | Rutor | Konton |
|---|---|---|
| Försäljning 25/12/6 % | 05 + 10/11/12 | 30xx → 2611/2621/2631 |
| EU-försäljning tjänster | 39 (+ periodisk sammanställning) | 3308 |
| EU-försäljning varor | 35 | 3106 |
| Export | 36, 40 | 3105, 3305 |
| EU-inköp varor | 20 + 30–32 + 48 | 45xx → 2614 + 2645 |
| Inköp tjänster utland | 21/22 + 30 + 48 | 4531–4537 |
| Ingående moms | 48 | 2640, 2645 |
| Att betala/få tillbaka | 49 | 2650 |

---

## 6. Moduler & funktioner

### Modul A — Dashboard & skattekalender
- Översikt: resultat hittills i år, obetalda kundfakturor (+ förfallna), obetalda leverantörsfakturor, bankkontosaldo enligt bokföringen (1930), momsstatus innevarande period, prognos "din vinst efter skatt/egenavgifter hittills".
- **Att göra-lista**: förfallna fakturor att påminna, momsdeklaration X dagar kvar, F-skatt den 12:e, inkomstdeklaration + NE senast 2 maj, obokförda underlag.
- Skattekalender genereras automatiskt utifrån momsperiod-inställningen och EU-handel ja/nej.

### Modul B — Fakturering
- **Kundregister**: kundnr auto, momstyp (SE / EU omvänd / export) som styr kontering + lagtext på fakturan.
- **Artikelregister**: pris, enhet, momssats, försäljningskonto per artikel. Fria textrader stöds också.
- **Faktura**: autonummer (obruten serie), OCR med Luhn + längdsiffra, förfallodatum från betalningsvillkor, rader med antal/à-pris/rabatt/momssats per rad, moms beräknas per sats och redovisas per sats på fakturan (lagkrav), öresavrundning → 3740. Status utkast (redigerbar) → bokförd (låst, verifikat skapas†).
- **PDF** enligt momslagens fullständiga fakturakrav + logotyp; **e-postutskick** med PDF via Resend; markeras som skickad.
- **Kreditfaktura**: skapas från bokförd faktura, speglar raderna, obligatorisk referens till originalet, kvittas i reskontran.
- **Betalningsregistrering**: manuell (ingen bank ännu) — datum + belopp, delbetalning ger kvarstående öppen post. Verifikat auto†.
- **Påminnelser**: lista förfallna → generera påminnelse-PDF/mail (nr 1, 2...), valfri påminnelseavgift och dröjsmålsränta (referensränta + 8 % default).
- **Kundreskontra**: öppna poster, åldersanalys, avstämning mot 1510.
- v1.5: återkommande fakturor (mall + intervall). v2: offert→faktura, ROT/RUT, e-faktura/Peppol, flervaluta.

† **Konteringslogik styrs av metod:**
- *Faktureringsmetoden:* vid bokföring av faktura: D 1510 / K 30xx / K 26x1. Vid betalning: D 1930 / K 1510.
- *Kontantmetoden:* fakturan bokförs INTE vid utfärdande (ligger endast i reskontran). Vid betalning: D 1930 / K 30xx / K 26x1. Vid årsskiftet: automatiskt förslag som bokför alla obetalda fordringar/skulder (lagkravet i BFL 5:2).

### Modul C — Löpande bokföring
- **Manuellt verifikat**: datum, beskrivning, motpart, rader (konto/debet/kredit/text), bilaga (foto/PDF — drag & drop eller mobilkamera via webben). Balanskontroll live. Momshjälp: ange totalbelopp + momssats → moms delas upp automatiskt.
- **Snabbhändelser** (Visma-mönstret, guld för EF): "Köp mot kvitto", "**Eget uttag**" (D 2013/K 1930), "**Egen insättning**" (D 1930/K 2018), "**F-skatt**" (D 2012/K 1930), "Milersättning egen bil" (D 5800-konto 25 kr/mil × mil, K 2018 — skattefri kostnadsersättning till dig själv), "Representation" (guidad: antal personer → beräknar avdragsgill del 6071 + ej avdragsgill 6072 + korrekt momslyft max 300 kr/person).
- **Konteringsmallar**: egna mallar (t.ex. "Mobilräkning: 6212 + 2640") med procent- eller fastbeloppsfördelning.
- **Verifikationsserier**: A = manuellt, B = kundfakturor, C = leverantörsfakturor, D = moms/omföringar, E = bokslut. Obrutna nummer per serie och år.
- **Rättelse**: knappen "Ändra verifikat" skapar automatiskt (1) ett vändningsverifikat och (2) ett nytt korrekt verifikat, båda korslänkade till originalet med datum + notering (BFNAR 2013:2). Radering tillåten endast för senaste verifikatet i serien. Historik/spårlogg på allt.
- **Periodlåsning**: manuell + automatisk vid godkänd momsrapport. Låst period = inga nya verifikat med datum i perioden.
- **Leverantörsfakturor**: registrering (leverantör, fakturanr, OCR, datum, förfallodatum, belopp, moms, konto, bilaga), reskontra med förfallolistan, manuell betalmarkering. Kontering styrs av metoden (fakturerings: D kostnad + 2640 / K 2440; kontant: bokförs vid betalning).

### Modul D — Moms
- **Momsrapport per period**: beräknar alla rutor 05–62 från momskodade konton, visar underlag per ruta med drill-down till verifikat.
- Rimlighetskontroller: utgående moms ≈ 25/12/6 % av försäljningsunderlaget, ingen moms på låsta perioder, ruta 49-avstämning.
- **Godkännande** skapar omföringsverifikat (2611/2621/2631/2614 + 2640/2645 → 2650) och låser perioden.
- **eSKD-fil** (XML) för uppladdning på skatteverket.se + tydlig "skriv av dessa rutor"-vy.
- Betalning av momsskuld registreras: D 2650 / K 1930.
- Periodisk sammanställning-underlag vid EU-tjänsteförsäljning (ruta 39).

### Modul E — "Lön" för EF: eget uttag & skatt
- **Uttagsöversikt**: alla egna uttag/insättningar under året, netto mot eget kapital.
- **Uttagssimulator**: ange önskat månadsuttag → visar beräknat årsresultat, egenavgifter (28,97 % med nedsättning), schablonavdrag 25 %, kommunalskatt (inställbar sats) + ev. statlig skatt över 660 400 kr → "så mycket kostar ditt uttag, så mycket blir kvar i firman".
- **Preliminärskatt-koll**: registrera SKV:s debiterade F-skatt → jämför löpande mot simulerad faktisk skatt → varning "höj/sänk din preliminärskatt (lämna preliminär inkomstdeklaration)".
- Milersättning och traktamente som snabbhändelser (skattefria ersättningar, aktuella schablonbelopp från regelvärdestabellen).

### Modul F — Rapporter
- **Resultatrapport**: vald period + jämförelse föregående år, ackumulerat, BAS-rubriksstruktur, drill-down rubrik → konto → verifikat.
- **Balansrapport**: IB / förändring / UB per konto.
- **Huvudbok** (per konto, med löpande saldo), **dagbok/verifikationslista** (i registreringsordning).
- **Momsrapporter** historik, **kundreskontra/leverantörsreskontra** med åldersanalys.
- Export: PDF och CSV/Excel på alla rapporter.
- **SIE 4E-export** (hela räkenskapsår: #KONTO, #SRU, #IB/#UB/#RES, #VER/#TRANS, CP437-kodning) — revisorn/skatteprogram kan ta emot allt. SIE-import för ingående balanser vid uppstart (v1.5).

### Modul G — Årsavslut (förenklat årsbokslut + NE)
1. **Checklista** (Visma-mönstret): alla perioder låsta? reskontror stämda mot 1510/2440? 1930 stämt mot kontoutdrag? moms slutredovisad? obetalda poster bokförda (kontantmetoden)? underlag på alla verifikat?
2. **Avskrivningar**: anläggningsregistret räknar 30-regeln vs 20-regeln, väljer optimalt (eller manuellt), skapar avskrivningsverifikat (D 7832 / K 1229). Direktavdragskontroll < 29 600 kr. K1-regeln: hela underlaget ≤ halvt prisbasbelopp → direktavskrivning.
3. **Förenklat årsbokslut (K1)**: genereras automatiskt från bokföringen enligt SKV 2150-strukturen (B1–B16, R1–R12). Signeras och arkiveras (skickas ej in).
4. **Skatteplanering**: kalkylator för periodiseringsfond (30 %, med 6-årsöversikt över fonder), positiv räntefördelning (8,55 % på kapitalunderlag > 50 000 kr, sparat utrymme), expansionsfond — visar skatteeffekt av varje val. Endast deklarationsposter, bokförs ej.
5. **NE-bilaga**: autofylls via konto→NE-ruta-mappningen (B1–B16, R1–R12 + justeringar R13–R48 inkl. R43 schablonavdrag 25 %) → siffror att föra in på skatteverket.se (SRU-filexport som v2).
6. **Årsavslut**: resultat bokförs (8999 → 2019), eget kapital nollställs (2011/2012/2013/2018/2019 → 2010), IB skapas för nytt år, året låses.

### Modul H — Inställningar
Företagsuppgifter, logotyp, momsmetod + momsperiod, fakturadefaults (villkor, påminnelseavgift, ränta), verifikationsserier, kontoplan (aktivera/lägg till BAS-konton, redigera momskod/NE-mappning), regelvärden per år (förifyllda 2026, uppdateras årligen), export av all data (SIE + bilagor som zip = arkiveringstrygghet).

---

## 7. Byggfaser

| Fas | Innehåll | Resultat |
|---|---|---|
| **0. Grund** | Projekt, Supabase-schema, auth, inställningar, räkenskapsår, kontoplan seedad (BAS 2026 + momskoder + NE/SRU-mappning), regelvärdestabell | Tomt men korrekt uppsatt system |
| **1. Bokföringsmotor** | Posting engine, verifikat + serier + balanstriggers, snabbhändelser (uttag/insättning/F-skatt/kvitto), bilagor, rättelselogik, periodlåsning, huvudbok + dagbok + RR/BR | Kan bokföra hela firman manuellt — redan användbart |
| **2. Fakturering** | Kunder, artiklar, faktura → PDF → e-post, OCR, kreditfaktura, betalningsregistrering, reskontra, påminnelser, båda momsmetoderna | Löpande fakturering klar |
| **3. Moms + leverantörer** | Leverantörsreskontra, momsrapport med rutmappning, omföringsverifikat, eSKD, periodlåsning-koppling, skattekalender + dashboard | Momsdeklarationen tar 5 minuter |
| **4. Rapporter + SIE** | Alla rapporter med drill-down, exports, SIE 4E | Revisorssäkert |
| **5. Årsavslut** | Anläggningsregister + avskrivningar, checklista, K1-bokslut, NE-bilaga, skatteplanering, uttagssimulator, årsrullning | Hela året stängs i programmet |

**Medvetet senare (v2+):** bankkoppling (datamodellen förberedd: betalningar är egna entiteter), e-faktura/Peppol, AI-tolkning av kvitton, ROT/RUT, offert→order, återkommande fakturor, SRU-filinlämning, räntefakturor, revisorsinloggning, flervaluta, OSS.

---

## 8. Verifieras vid implementation (flaggat i researchen)
- BAS 2026 klass 4-struktur — bygg kontoseed från officiella Excel-filen (bas.se)
- Exakta NE-radnummer för justeringsposter mot SKV:s blankett för IÅ 2026 (publiceras inför deklarationen 2027)
- SRU-koder per konto (BAS-kopplingstabellen)
- eSKD-filformatets aktuella XML-schema (skatteverket.se)
- Senareläggningsfrister BFNAR 2013:2 (för ev. "bokför senast"-påminnelser)
