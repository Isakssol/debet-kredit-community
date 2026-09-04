# Sätt upp med Claude Code — AI:n gör installationen

Har du [Claude Code](https://claude.com/claude-code)? Då kan du låta AI:n göra
hela den tekniska uppsättningen åt dig. Du gör kontodelen (ingen AI ska röra
dina lösenord — det är en egenskap, inte en begränsning), sen klistrar du in
instruktionen nedan och lutar dig tillbaka.

Vill du hellre klicka själv: följ [INSTALLATION.md](INSTALLATION.md), eller
bildguiden på [debea.se/kom-igang/community](https://debea.se/kom-igang/community)
som tar samma steg med skärmdumpar — samma resultat.

## Del 1 — det bara du kan göra (~25 minuter från noll, ~10 med konton)

**Har du redan konton på GitHub, Vercel och Supabase?** Hoppa till punkt 2.
Annars: gör kontona i den här ordningen — GitHub först, för både Vercel och
Supabase loggar in med det kontot.

1. **Skapa kontona.**
   - **GitHub** ([github.com/signup](https://github.com/signup)): mejladress,
     lösenord, användarnamn. Bilduppgiften kan komma flera gånger utan att något
     är fel. Verifieringen är en **sifferkod i mejlen**, inte en länk.
     Slå sedan på **tvåstegsinloggning direkt** (Settings → Password and
     authentication → Authenticator app) — GitHub kräver det av alla konton och
     det går inte att stänga av — och **spara reservkoderna medan de visas**.
   - **Vercel** ([vercel.com/signup](https://vercel.com/signup)), om du vill nå
     appen från mobilen: **Continue with GitHub**. Två snarlika rutor kommer i
     rad (Authorize, sedan Install); välj **All repositories** i den andra.
     Plan **Hobby** är gratis för privat bruk, Pro för näringsverksamhet.
   - **Supabase** ([supabase.com](https://supabase.com/dashboard/sign-up)):
     **Continue with GitHub**, skapa **organisationen** (plan Free). Projektet
     kommer i punkt 3.
   - **Inget AI-konto behövs** — community-versionen har ingen AI-bokförare.
2. **Forka repot**: öppna
   [Isakssol/debet-kredit-community](https://github.com/Isakssol/debet-kredit-community)
   och klicka **Fork → Create fork**. Repot är publikt, så du behöver ingen
   inbjudan — men forken behövs för att kunna deploya till Vercel och spara
   dina egna ändringar.
3. **Skapa Supabase-projektet**: New project → välj organisationen från punkt 1
   → döp projektet (t.ex. `bokforing`) → låt Supabase generera
   databaslösenordet (**spara det i lösenordshanteraren innan du klickar
   vidare** — det visas en gång) → region **Stockholm (eu-north-1)**, som inte
   går att ändra i efterhand.
4. **Skapa ditt inloggningskonto och stäng dörren** — i Supabase-panelen:
   - **Authentication → Users → Add user** → din mejl + starkt lösenord →
     bocka i **Auto Confirm User** → Create user.
   - **Authentication → Sign In / Up** → slå AV **Allow new users to sign
     up** → Save. Obligatoriskt: anon-nyckeln är publik och appen är
     single-tenant, så varje konto som kan skapas ser hela din bokföring.
     Ordningen spelar roll — ditt eget konto först, sedan stänger du dörren.
5. **Installera och logga in i verktygen** — kör i Terminalen och följ
   inloggningsflödet i webbläsaren (Node.js LTS ska finnas sedan innan):

   ```bash
   npm install -g pnpm && npx supabase login && git config --global user.name "Ditt Namn"
   ```

   Ska appen även upp på nätet: kör `npm install -g vercel && vercel login`.

## Del 2 — klistra in detta i Claude Code

Öppna Claude Code i en tom mapp och klistra in hela blocket nedan:

```text
Du ska sätta upp bokföringsprogrammet Debet & Kredit Community (min egen
installation) enligt repots docs/INSTALLATION.md. Jag har redan: forkat repot
<MITT-GITHUB-ANVÄNDARNAMN>/debet-kredit-community, skapat ett Supabase-projekt,
skapat mitt inloggningskonto i Supabase-panelen (Auto Confirm), stängt av
"Allow new users to sign up" och loggat in i supabase-CLI:t.
Arbeta metodiskt och verifiera varje steg innan du går vidare.

VIKTIGA REGLER:
- Be mig ALDRIG klistra in lösenord eller nycklar i chatten. När ett kommando
  frågar efter databaslösenordet eller en nyckel skriver JAG in det direkt i
  terminalens prompt.
- Fråga mig när du behöver val (projektnamn, region) i stället för att gissa.
- Om något steg misslyckas: diagnostisera och åtgärda EN sak i taget.

GÖR SÅ HÄR:
1. Klona min fork och gå in i mappen. Läs docs/INSTALLATION.md.
2. Kör `pnpm install`. Klagar den på build-skript (sharp, unrs-resolver):
   kör `pnpm approve-builds`, låt mig godkänna dem, och kör `pnpm install`
   igen.
3. Länka Supabase: kör `npx supabase link` och låt mig välja projektet och
   ange databaslösenordet interaktivt.
4. Kör `npx supabase db push` (jag anger lösenordet; första gången frågar
   npx om det får ladda ner Supabase-CLI:t — det är ok). Verifiera efteråt
   att migrationerna finns med `npx supabase migration list`.
5. Kvittoarkivet: migrationerna skapar storage-bucketen `underlag`.
   Verifiera att den finns och är privat; saknas den, guida mig att skapa
   den i Supabase-panelen (Storage → New bucket → `underlag`, EJ public) och
   vänta tills jag bekräftat.
6. Be mig bekräfta att jag i Supabase-panelen har (a) skapat mitt
   inloggningskonto under Authentication → Users → Add user med Auto Confirm
   och (b) stängt av "Allow new users to sign up" under Authentication →
   Sign In / Up. Gå inte vidare förrän jag bekräftat båda — i den ordningen.
7. Skapa `.env.local` i projektroten med NEXT_PUBLIC_SUPABASE_URL och
   NEXT_PUBLIC_SUPABASE_ANON_KEY. Värdena hämtar jag själv från Supabase
   (Project Settings → API) och skriver in när du frågar efter dem i
   terminalen. Tala om exakt var jag hittar varje värde. Filen är redan
   gitignorerad — kontrollera det och committa den aldrig.
8. Starta appen med `pnpm dev` och ge mig adressen (http://localhost:3000).
   Verifiera att /login svarar 200.
9. Fråga mig om jag vill ha appen på nätet också. Om ja: kör `vercel link`
   (ny app, koppla min fork), lägg upp NEXT_PUBLIC_SUPABASE_URL och
   NEXT_PUBLIC_SUPABASE_ANON_KEY med `vercel env add` en i taget (jag
   klistrar in värdena i terminalprompten), deploya med
   `vercel deploy --prod` och ge mig den slutliga adressen. Påminn mig sedan
   om att sätta Site URL till min Vercel-adress under Authentication → URL
   Configuration i Supabase, och att lägga till https://<min-app>/auth/callback
   under Redirect URLs (krävs för Glömt lösenord?). Om nej: hoppa över — det
   kan göras när som helst senare.
10. Lista vad jag gör härnäst: logga in med kontot jag skapade i panelen och
   gå igenom kom igång-wizarden (bolagstyp, företagsuppgifter, momsperiod,
   räkenskapsår, eventuell SIE-import från mitt gamla program).
11. Avsluta med en punktlista över allt som är uppsatt, var min data bor och
   var backup-ansvaret ligger (min Supabase, mina konton). Påminn mig till sist
   om att läsa avsnittet "Var du förvarar nycklarna" i docs/INSTALLATION.md och
   fylla i nyckelkortet där — särskilt att mina GitHub-reservkoder ska ligga
   sparade, eftersom både Vercel och Supabase loggar in med GitHub-kontot.
```

## Vanliga frågor

- **Är det säkert?** Claude Code visar varje kommando innan det körs och du
  godkänner. Lösenord och nycklar skriver du alltid själv, direkt i
  terminalen — de passerar aldrig chatten.
- **Kostar det något?** Claude Code kräver en Claude-prenumeration. Själva
  driften är som vanligt från 0 kr/mån.
- **Fastnar AI:n?** Felsökningsavsnittet i
  [INSTALLATION.md](INSTALLATION.md) gäller — och du kan alltid fortsätta för
  hand från samma steg där ni är, guiden följer samma ordning.

Vill du ha autopiloten — AI-bokföraren, bankregler som bokför av sig själva
och årets regelvärden — finns den licensierade versionen på
[debea.se/priser](https://debea.se/priser).
