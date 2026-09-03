# Sätta upp den publika demon

Demon är en egen instans av appen med påhittad exempeldata
("Demofirman Bygg & Montage"), knapptryckslogin och nattlig återställning.
Besökarens namn + företag sparas i `demo_signups` — din leadlista.

**Viktigt:** demon ska ha ett HELT EGET Supabase-projekt. Blanda aldrig
med riktig bokföring.

## Steg (ca 15 minuter)

1. **Skapa demo-Supabase-projektet** (t.ex. "debet-kredit-demo", region Stockholm).
   Kör alla vanliga migrationer:
   ```bash
   npx supabase link --project-ref <demo-ref>
   npx supabase db push
   ```
2. **Skapa storage-bucketen** `underlag` (privat) — som i vanliga installationen.
3. **Skapa demoanvändaren:** Authentication → Users → Add user,
   t.ex. `demo@dindoman.se` + ett långt slumpat lösenord (besökare ser det aldrig).
4. **Kör demopaketet:** SQL Editor → klistra in hela `scripts/demo/setup.sql` → Run.
   (Skapar demo_signups, seedar exempeldatan och schemalägger nattlig
   återställning 03:00 via pg_cron.)
5. **Skapa demo-deployen i Vercel:** Add New → Project → importera samma repo
   igen (döp projektet t.ex. `debet-kredit-demo`). Miljövariabler:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<demo-projektets url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<demo-projektets anon-nyckel>
   DEMO_MODE=1
   DEMO_LOGIN_EMAIL=demo@dindoman.se
   DEMO_LOGIN_PASSWORD=<lösenordet från steg 3>
   ```
6. **Klart!** Demolänken är `https://<demo-deployen>/demo` — dela den i
   LinkedIn-inlägg, på hemsidan, i DM.

## Bra att veta

- **Inga AI-nycklar behövs:** Community-versionen har ingen AI-funktion,
  så demon kostar dig ingenting utöver hostingen.
- **Leads:** läs intresseanmälningarna i demo-projektets panel:
  Table Editor → `demo_signups`.
- **Manuell återställning:** SQL Editor → `select demo_reset();`
- **Kostnad:** ett extra Supabase-projekt på Pro-org ≈ 10 USD/mån compute.
  Vercel-deployen ryms i din befintliga plan.
- Demodatan delas av alla samtidiga besökare — det är avsiktligt och
  framgår av bannern i appen.
