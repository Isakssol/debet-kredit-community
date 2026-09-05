# Tvåstegsverifiering

Tvåstegsverifiering lägger ett steg till din inloggning: efter lösenordet
skriver du in en sexsiffrig kod från en app i telefonen. Det är samma metod som
din bank, ditt GitHub-konto och Microsoft använder, och den gör lösenordet
ensamt värdelöst för någon annan.

Den är **valfri** och avstängd tills du själv slår på den. Du hittar den under
**Inställningar → Säkerhet**. Funktionen finns i både community- och
licensversionen — säkerhet är ingenting som ska säljas separat.

Nycklarna ligger i din egen Supabase, som allt annat i den här installationen.
Ingen annan kan läsa dem, och ingen annan kan stänga av skyddet åt dig.

---

## Aktivera

Räkna med en minut. Ha telefonen till hands.

1. **Hämta en autentiseringsapp** till telefonen om du inte redan har en.
   Google Authenticator, Microsoft Authenticator, Authy och 1Password fungerar
   alla lika bra — de följer samma standard, så du kan byta app senare.
2. Öppna **Inställningar → Säkerhet** i programmet och klicka **Aktivera
   tvåstegsverifiering**.
3. **Skanna QR-koden** med appen. Kan du inte skanna — till exempel om
   autentiseringsappen sitter på samma dator som skärmen — fäller du ut *Kan du
   inte skanna?*, väljer **Ange nyckel manuellt** i appen och klistrar in
   nyckeln som står där. Väljer appen typ: **Tidsbaserad**.
4. Appen visar nu en **sexsiffrig kod** för Debet & Kredit som byts var
   trettionde sekund. Skriv in den koden och klicka **Aktivera**.
5. Klart. Nästa gång du loggar in kommer ett extra steg efter lösenordet, där
   du skriver in koden som appen visar just då.

### Bra att veta

- **Kravet hålls före appen, inte i den.** En inloggning som stannat vid
  lösenordet når ingen sida alls, oavsett vilken adress som skrivs in. Spärren
  sitter i proxyn framför programmet (`src/proxy.ts` och `src/lib/mfa/aal.ts`)
  och bygger på Supabase Auths egna nivåer `aal1` och `aal2` — samma
  inloggningsmotor som ligger under programmet i övrigt.
- **Faktorn är personlig.** Den hör till inloggningskontot, inte till företaget.
  Kör du med flera konton mot samma installation slår var och en på det själv:
  koden finns bara i den personens telefon, så ingen kan slå på eller stänga av
  åt någon annan.
- **Att stänga av kräver en kod från appen.** Det är avsiktligt — annars skulle
  den som kommit över lösenordet kunna stänga av skyddet, och då vore det inget
  skydd.
- **Byter du telefon:** flytta över kontot i autentiseringsappen *innan* du
  nollställer den gamla. De flesta appar har en export- eller
  överföringsfunktion, och det tar en minut medan du fortfarande har båda
  telefonerna i handen.
- **Inga reservkoder, och det är ett val.** En reservkod är ett lösenord till,
  som ska förvaras någonstans och som kan läcka. Eftersom du äger
  Supabase-panelen har du redan en säkrare väg tillbaka — den står i nästa
  avsnitt.

### Om knappen svarar att tvåstegsverifiering är avstängd i projektet

Då är TOTP avslaget i din Supabase-panel. Öppna projektet, gå till
**Authentication → Sign In / Providers** och slå på **Multi-Factor
Authentication (TOTP)**.

Kör du lokalt står samma inställning i `supabase/config.toml` under
`[auth.mfa.totp]`, och den är påslagen i det här repot:

```toml
[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true
```

Att lämna den påslagen ändrar ingenting för ett konto som aldrig slår på
funktionen — den är opt-in per användare.

---

## Tappat din autentiseringsapp?

Ingen fara, och ingen support att vänta på. Du är din egen administratör i den
här installationen, så du löser det själv på ett par minuter: ta bort din
tvåstegsfaktor i din Supabase-panel, logga in med lösenordet som vanligt och
aktivera tvåstegsverifieringen igen med den nya telefonen.

Bokföringen påverkas inte alls. Det är bara inloggningen som ställs om.

1. Öppna [supabase.com](https://supabase.com) i webbläsaren och logga in på det
   konto du skapade projektet med. Kör du helt lokalt öppnar du i stället din
   egen Supabase Studio, normalt `http://localhost:54323`, och hoppar över
   inloggningen.
2. Välj ditt projekt i listan — det heter oftast samma sak som ditt företag. Du
   landar på projektets översikt.
3. Klicka på **Authentication** i menyn till vänster. Ikonen är en liten person,
   och den ligger ungefär mitt i menyn. Undermenyn öppnas.
4. Välj **Users** i undermenyn. Nu visas en tabell med alla inloggningskonton i
   din installation, en rad per person, med e-postadressen i första kolumnen.
5. Sök upp din egen e-postadress i sökrutan ovanför tabellen och klicka på raden
   så att användarens detaljer öppnas.
6. Leta upp avsnittet **Multi-Factor Authentication** (kan också stå *MFA
   factors*). Där ligger din faktor som en rad, oftast med namnet *Debet &
   Kredit* eller *Authenticator app* och ett datum. Klicka på papperskorgen
   eller **Remove factor** på den raden och bekräfta.
7. Finns inget sådant avsnitt i din version av panelen: klicka på de **tre
   punkterna** längst till höger på användarens rad i tabellen och välj **Remove
   MFA factors** i menyn. Det gör exakt samma sak.
8. Gå tillbaka till programmet och logga in med e-post och lösenord. Nu kommer
   inget kodsteg — faktorn är borta.
9. Öppna **Inställningar → Säkerhet** och aktivera tvåstegsverifieringen igen
   med den nya telefonen.

### Om något inte stämmer med skärmen

| Det här ser du | Så här löser du det |
|---|---|
| Jag hittar inte **Authentication** i menyn | Kontrollera att du står inne i ett projekt och inte på organisationens startsida. Menyn till vänster ska visa Table Editor, SQL Editor, Database, Authentication, Storage. Står det Projects, General och Billing är du en nivå för högt upp — klicka på projektnamnet först |
| Användaren finns inte i listan | Listan visar bara konton i det projekt du har öppet. Har du flera Supabase-projekt: kontrollera att det är samma projekt som appen är kopplad till, alltså samma Project URL som står i `NEXT_PUBLIC_SUPABASE_URL` i din hosting |
| Faktorn är borttagen men kodsteget kommer ändå | Webbläsaren kan sitta kvar på en gammal session. Logga ut helt och logga in på nytt |
| Jag kommer inte in i Supabase-panelen heller | Samma sak som att ha tappat nyckeln till huset: använd **Forgot password** på supabase.com. Har du tvåstegsverifiering även där ligger dina reservkoder från Supabase i lösenordshanteraren eller bland papperen där du sparade dem |
| En kollega har tappat sin app | Har du panelen kan du ta bort hens faktor på precis samma sätt. Ring personen och stäm av att det verkligen är hen som bett om det innan du gör det |

---

## Vanliga frågor

**Måste jag använda tvåstegsverifiering?**
Nej, den är helt frivillig och avstängd tills du själv slår på den. Den
rekommenderas ändå: det är den enskilt största skillnaden mellan ett konto som
skyddas av ett lösenord och ett som skyddas av ett lösenord plus din telefon.

**Koden godkänns inte.**
Koden byts var trettionde sekund — vänta på nästa och skriv in den. Fortsätter
det: kontrollera att telefonens klocka ställs automatiskt. Tidsbaserade koder
räknas ut ur klockan, och några minuters skillnad räcker för att koderna ska
hamna fel.

**Appen visar flera koder — vilken ska jag ta?**
Den som står under namnet på ditt Debet & Kredit-konto, oftast med din
e-postadress under sig. Alla andra rader hör till andra tjänster.

**Jag testade i demon och knappen var låst.**
Demokontot delas av alla som testar samtidigt, så ett kodsteg där skulle stänga
ute nästa besökare. I din egen installation är knappen aktiv.

**Kan jag byta autentiseringsapp?**
Ja. Alla följer samma standard. Antingen flyttar du över kontot i den nya appen
med dess importfunktion, eller så stänger du av tvåstegsverifieringen här och
aktiverar den på nytt med den nya appen.

---

## För dig som läser koden

| Fil | Vad den gör |
|---|---|
| `src/lib/mfa/aal.ts` | Spärrens beslut som rena funktioner: läser `aal` ur access-token, avgör om ett kodsteg återstår, och svarar `ok` / `verify-step` / `on-verify-step` |
| `src/proxy.ts` | Håller kravet före varje sida. Ett gränssnitt går alltid att gå förbi; en proxy gör det inte |
| `src/components/security-settings.tsx` | Kortet under Inställningar → Säkerhet: aktivering i två steg, avstängning mot kod |
| `src/app/login/verifiera/page.tsx` | Kodsteget vid inloggningen. Ligger under `/login` med flit, så spärren slipper ett eget undantag |
| `src/lib/__tests__/mfa-sparr.test.ts` | Prövar spärren från båda hållen — varje läge som ska släppas igenom, och varje läge som inte ska det |
| `src/lib/__tests__/mfa-live.integration.test.ts` | Samma flöde mot en riktig GoTrue, med koder uträknade som telefonen räknar ut dem. Hoppas över utan miljövariabler |

Live-provet kräver en Supabase-stack du kan slänga — aldrig en installation
någon bokför i, eftersom det skapar och tar bort en användare:

```bash
supabase start
MFA_LIVE_URL=http://127.0.0.1:55321 \
MFA_LIVE_ANON_KEY=<anon> MFA_LIVE_SERVICE_KEY=<service_role> \
  npx vitest run src/lib/__tests__/mfa-live.integration.test.ts
```
