# Bidra till Firmabok

Kul att du vill bidra! Några riktlinjer:

## Grundregler

- **Svenska** i UI-texter och dokumentation; **engelska** i kod, variabelnamn
  och commit-meddelanden.
- Bokföringslogik ska följa svensk lag och god redovisningssed (BFL, BFN:s
  vägledningar, BAS-kontoplanen). Ange gärna källa i PR-beskrivningen när du
  ändrar regler — t.ex. momssatser, gränsvärden eller kontering.
- Verifikatens oföränderlighet är helig: ingen kod får uppdatera eller radera
  bokförda verifikat. Rättelser sker alltid via ändringsverifikat.
- Belopp hanteras med två decimaler och ska balansera exakt — inga flyttalsfel
  i bokföringen.

## Praktiskt

- `pnpm dev` startar appen, `pnpm test` kör testerna (vitest).
- Migrationer läggs som nya filer i `supabase/migrations/` — ändra aldrig en
  befintlig migration.
- Nya regelvärden (gränsbelopp, momssatser) läggs i `rule_values`-tabellen med
  giltighetsdatum, inte hårdkodade.
- Håll PR:ar små och fokuserade. Beskriv *varför*, inte bara *vad*.

## Efterlysta bidrag

- Årsredovisning K2 för aktiebolag
- N3A-stöd för handelsbolag
- Fler bankformat i CSV-importen
- Löner (AB): arbetsgivardeklaration på individnivå (AGI)
