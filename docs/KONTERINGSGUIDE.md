# Konteringsguide — vanliga händelser i småföretaget

Snabbreferens för dig som är ny på bokföring. AI-bokföraren kan allt det här
redan, men det är bra att förstå *varför* den föreslår som den gör — och du
godkänner alltid själv. Vid osäkerhet: fråga en redovisningskonsult.

## Momssatserna 2026

| Sats | Gäller |
|---|---|
| 25 % | Nästan allt: varor, tjänster, programvara |
| 12 % | Restaurang, hotell, livsmedel (6 % fr.o.m. 2026-04-01 för livsmedel) |
| 6 % | Böcker, tidskrifter, persontransport (tåg/flyg/taxi), kultur |
| 0 % / momsfritt | Försäkringar, bankavgifter, myndighetsavgifter, sjukvård, hyra (oftast) |

## Vanliga inköp — vilket konto?

| Händelse | Konto | Att tänka på |
|---|---|---|
| Kontorsmaterial | 6110 | |
| Förbrukningsinventarier (verktyg, möbler under gränsen) | 5410 | Över ~29 600 kr exkl. moms + 3 års livslängd → tillgång 1220 |
| Förbrukningsmaterial | 5460 | |
| Mobilabonnemang | 6212 | Delvis privat? Bokför bara verksamhetens andel |
| Bredband | 6230 | |
| Programvara/licenser (svenska) | 5420 | |
| Molntjänster (svenska) | 6540 | |
| Utländska SaaS (Google, Meta, OpenAI…) | 4531/4535 | Omvänd skattskyldighet — se nedan |
| Drivmedel | 5611 | |
| Billeasing | 5615 | **Bara halva momsen** får lyftas på personbilsleasing |
| Trängselskatt (tjänsteresa) | 5616 | Momsfri |
| Tågbiljetter, flyg, taxi | 5810 | 6 % moms |
| Hotell & restaurang på tjänsteresa | 5831 | 12 % moms |
| Milersättning egen bil | 5800 | Schablon 25 kr/mil (2026), momsfri |
| Lokalhyra | 5010 | Oftast momsfri |
| Facklitteratur/branschtidskrift | 6970 | 6 % — allmänna tidningar är privat |
| Företagsförsäkring | 6310 | Momsfri |
| Bankavgifter | 6570 | Momsfria |
| Redovisningskonsult | 6530 | |
| Annonsering (svensk) | 5910 | Google/Meta faktureras från Irland → 4535! |
| Porto | 6250 | |

## Fällorna — det här är INTE avdragsgillt

- **Böter och felparkeringsavgifter** (även kontrollavgift på privat mark) → 6992
- **Vanliga kläder** — bara skydds- och profilkläder (5480) är avdragsgilla
- **Friskvård åt dig själv i enskild firma** (anställda i AB: ok inom gränserna)
- **Kundgåvor** — utom enklare reklamgåvor av mindre värde (≈300 kr)
- **Grundutbildning / utbildning för ny verksamhet** — fortbildning inom
  befintlig verksamhet är däremot ok (6991)
- **Medlemsavgifter** till föreningar (6982) — serviceavgiften (6981) är ok
- **Kostnadsränta på skattekontot** (8423)
- **Representation (måltider)** — sedan 2017 ej avdragsgill kostnad; endast
  momslyft på underlag upp till 300 kr/person

## EU-inköp och omvänd skattskyldighet

Köper du tjänster från EU (Google Ads, Meta, de flesta SaaS) eller utanför EU
kommer fakturan **utan moms**. Då redovisar du själv svensk moms:

- Nettobeloppet → **4535** (EU-tjänst), **4515** (EU-vara) eller **4531** (utanför EU)
- Utgående moms 25 % av netto → kredit **2614**
- Beräknad ingående moms, samma belopp → debet **2645**

Netto noll i momspengar — men rutorna 21/30/48 i deklarationen måste stämma.
**Utländsk moms** på kvittot (tysk VAT, norsk MVA) är *aldrig* avdragsgill som
svensk moms — hela beloppet blir kostnad.

## Betalade du privat?

| Bolagstyp | Kontering |
|---|---|
| Enskild firma | Kreditera **2018** Egna insättningar |
| Aktiebolag | Kreditera **2893** Skuld till aktieägare (och betala ut senare) |
| Handelsbolag | Respektive delägares kapitalkonto (2018/2020) |

Och åt andra hållet — tar du ut pengar: EF → 2013 eget uttag,
AB → **lön eller utdelning** (aldrig "eget uttag"!), HB → delägarens kapitalkonto.

## När kunden inte betalar

1. Troligen förlorad (obetald länge, svarar inte) → **6352** Befarad
   kundförlust, kredit 1510. Ingen momsjustering ännu.
2. Konstaterat förlorad (konkurs, ackord, utmätning) → **6351** och du får
   tillbaka den utgående momsen.

## Skatteverket & F-skatt

F-skatt är aldrig en kostnad: enskild firma bokför den som eget uttag (**2012**),
aktiebolag mot skatteskulder (**2510**). Momsinbetalningar går mot **2650/1630**.
