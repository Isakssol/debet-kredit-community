# Installationsguide — från noll till egen bokföring

> **Föredrar du en bildguide?** [debea.se/kom-igang/community](https://debea.se/kom-igang/community)
> — samma steg med skärmbilder, kopiera-knappar och en handling per kort.

Den här guiden tar dig hela vägen: från ingenting till ett körande system på
dina egna konton. Räkna med **45–60 minuter** om du redan har konton på GitHub,
Vercel och Supabase, annars **60–75 minuter från noll**. Du behöver inte kunna
programmera, men du kommer att köra några kommandon i terminalen — kopiera och
klistra räcker.

**Det här behöver du innan du börjar:**

- En mejladress du kommer åt just nu (samma på alla konton gör livet enklare)
- En lösenordshanterare. Appen **Lösenord** räcker på Mac och iPhone; har du både
  Mac och Windows är **Bitwarden** gratis och fungerar på båda. Du skapar
  lösenord och nycklar som ALDRIG får slarvas bort
- En telefon med en autentiseringsapp (Google Authenticator, Microsoft
  Authenticator, eller appen Lösenord på iPhone). **GitHub kräver
  tvåstegsinloggning av alla konton och det går inte längre att stänga av**
- En dator med [Node.js](https://nodejs.org) installerat (LTS-versionen)
- **Git** på datorn — det är verktyget som hämtar hem koden i steg 3.
  Kontrollera med `git --version` i terminalen; svarar den med ett versionsnummer
  är du klar.
  - **Windows:** ladda ner från [git-scm.com/download/win](https://git-scm.com/download/win)
    (nedladdningen startar av sig själv), kör filen och klicka **Next** hela
    vägen till **Install** — standardvalen är rätt. Stäng PowerShell och öppna
    ett nytt fönster efteråt, annars hittas inte kommandot.
  - **Mac:** kör `xcode-select --install` i Terminal, klicka **Installera** i
    rutan som dyker upp och vänta några minuter. Git ingår i Apples Command Line
    Tools. Svarar Mac:en att verktygen redan är installerade finns git redan.
- Bankkort behövs **inte** — allt kör på gratisnivåer tills du själv väljer annat

**Kontona du skapar (alla gratis):** GitHub, Vercel och Supabase. Du äger
allihop. Ingen annan har åtkomst — inte ens vi. **Något AI-konto behövs inte:**
community-versionen har ingen AI-bokförare och skickar ingenting till någon
AI-leverantör. Ser du en guide som ber dig skapa ett Anthropic-konto är den
skriven för licensversionen.

---

## Steg 0 — Kontona (gör alla först, ~20 min)

Har du redan alla tre: hoppa till steg 1. Ordningen är inte godtycklig —
**GitHub skapas först och både Vercel och Supabase loggar in med GitHub-kontot.**
Det ger dig två lösenord i stället för fyra.

### 0.1 GitHub — här förvaras din kopia av koden (~10 min)

Ett *repo* är en mapp med kod som ligger på GitHub i stället för på din dator.

1. [github.com/signup](https://github.com/signup) → mejladress → lösenord →
   **användarnamn** (det syns i alla adresser du skapar sedan) → ja/nej på
   produktmejl.
2. **Bilduppgiften.** Kommer den flera gånger betyder det inte att du gjort fel.
   Det finns ett ljudalternativ om bilderna krånglar.
3. **Sifferkoden ("launch code")** mejlas till dig och skrivs in på sidan — leta
   alltså inte efter en länk att klicka på. Kolla skräpposten om den dröjer.
4. **Tvåstegsinloggning, direkt.** GitHub kräver det av alla konton och det går
   sedan september 2026 inte att stänga av. Settings → **Password and
   authentication** → **Two-factor authentication** → **Authenticator app** →
   skanna rutan med telefonen.
5. **Spara reservkoderna (recovery codes) NU**, medan de visas: i
   lösenordshanteraren och gärna på papper. Utan dem och utan telefonen finns
   ingen väg tillbaka in i kontot — och då är även Vercel och Supabase låsta.

### 0.2 Vercel — här körs appen på nätet (~5 min, valfritt men rekommenderat)

Vercel behövs bara om du vill nå appen från mobilen eller från en annan dator.
Ska den bara köra lokalt på din egen dator kan du hoppa över det här kontot och
följa README:s utvecklarväg i stället.

1. [vercel.com/signup](https://vercel.com/signup) → **Continue with GitHub**.
2. **Två rutor kommer efter varandra och liknar varandra.** Först *Authorize
   Vercel*, sedan installationen av Vercels GitHub-app. Att den andra dyker upp
   betyder att den första gick rätt.
3. I den andra rutan: välj **All repositories**. Väljer du *Only select
   repositories* och missar rätt repo syns det inte i Vercels lista senare.
4. **Plan: Hobby** är gratis och kräver inget kort. Vercels villkor säger att
   Hobby bara får användas privat och icke-kommersiellt — ska bokföringen
   tillhöra en näringsverksamhet är **Pro** (~20 USD/mån) det formellt rätta.

### 0.3 Supabase — här bor din bokföring (~5 min)

1. [supabase.com/dashboard/sign-up](https://supabase.com/dashboard/sign-up) →
   **Continue with GitHub** (mejlvägen har en bilduppgift och ett lösenord till).
2. Skapa **organisationen**: namn, plan **Free**.
3. Stanna där. **Organisationen är inte projektet** — själva databasen skapas i
   steg 2, där också regionen väljs, och den går inte att ändra i efterhand.

## Steg 1 — GitHub: hämta koden

1. Logga in med GitHub-kontot från steg 0.1.
2. Öppna [Isakssol/debet-kredit-community](https://github.com/Isakssol/debet-kredit-community)
   och klicka **Fork** (uppe till höger) → **Create fork**.
   Nu har du en egen kopia under ditt konto: `dittnamn/debet-kredit-community`.

> **Obs:** Community-versionen är fryst per 2026-09-01 — den fungerar
> komplett men får inga uppdateringar (nästa års basbelopp, momsregler och
> nya funktioner ingår inte). Den underhållna versionen med support ingår i
> licensen — se prissidan som är länkad i huvud-README:n.

## Steg 2 — Supabase: databasen (här bor din bokföring)

1. Logga in på [supabase.com](https://supabase.com) med kontot från steg 0.3 →
   **New project**.
2. Välj organisation (den du skapade i steg 0.3), döp projektet (t.ex.
   `bokforing`), region **Stockholm (eu-north-1)** — regionen går **inte** att
   ändra i efterhand och bokföringen ska ligga inom EU — och låt Supabase
   generera ett databaslösenord → **spara det i lösenordshanteraren direkt,
   innan du klickar vidare**. Det visas en enda gång.
3. Vänta ~2 min tills projektet är klart.
4. Hämta dina nycklar under **Project Settings → API**. En *API-nyckel* är ett
   långt lösenord som appen visar upp för databasen i stället för att logga in
   som en människa:
   - `Project URL` (ser ut som `https://xxxx.supabase.co`)
   - `anon public`-nyckeln
   Spara båda i lösenordshanteraren.

> **Var sparar du nycklarna?** Nu när du har den första: se
> [avsnittet om nyckelförvaring](#var-du-förvarar-nycklarna) längst ned.

## Steg 3 — Lägg in databasstrukturen

Första raden *klonar* ditt repo, alltså hämtar hem koden från GitHub till en
mapp på din dator. Sista raden kör *migrationerna*: färdigskrivna instruktioner
som bygger upp kontoplanen, momskoderna och alla tabeller. Du skriver dem inte,
du kör dem.

Öppna terminalen (Terminal på Mac, PowerShell på Windows) och kör, rad för rad:

```bash
git clone https://github.com/DITTNAMN/debet-kredit-community.git
cd debet-kredit-community
npx supabase login
npx supabase link --project-ref XXXX
npx supabase db push
```

- `DITTNAMN` = ditt GitHub-användarnamn (din fork).
- `XXXX` = projektreferensen — bokstäverna i din Supabase-URL
  (`https://XXXX.supabase.co`).
- `db push` frågar efter databaslösenordet från steg 2 och skapar sedan hela
  strukturen: kontoplan enligt BAS 2026, momskoder, regelvärden, alltihop.

## Steg 4 — Kvittoarkivet

I Supabase-panelen: **Storage → New bucket** → namn: `underlag` →
lämna **Public bucket** AVSTÄNGD → **Create**. (Bucketen kan redan finnas —
migrationerna försöker skapa den — då är detta steg klart.)

## Steg 5 — Ditt inloggningskonto

I Supabase-panelen: **Authentication → Users → Add user → Create new user** →
din mejl + ett starkt lösenord (lösenordshanteraren!) → **bocka i
"Auto Confirm User"** → **Create user**.
Detta är kontot du loggar in i bokföringen med.

**Bocken är det viktigaste på hela sidan.** Utan den räknas mejladressen som
obekräftad och appen nekar inloggning med "E-postadressen är inte bekräftad".
Missade du den: öppna användaren under Authentication → Users och bekräfta
adressen där, eller radera användaren och skapa om den med bocken i.

## Steg 5b — Stäng av självregistrering (OBLIGATORISKT före deploy)

**Authentication → Sign In / Up** → slå AV **Allow new users to sign up**
→ Save.

Varför det är obligatoriskt och inte bara "rekommenderat": anon-nyckeln som
appen använder är publik (den ligger i webbläsaren hos alla som öppnar
sidan). Med självregistrering på kan vem som helst som hittar din adress
skapa ett konto i din Supabase — och appen är single-tenant, så varje konto
ser hela din bokföring. Ordningen är därför: skapa ditt eget konto
(steg 5) → stäng av självregistrering (detta steg) → deploya (steg 6).

Fler användare lägger du sedan upp på samma sätt som ditt eget: i
Supabase-panelen under Authentication → Users → Add user. Det fungerar även
med självregistrering avstängd. Community-versionen har ingen
användarhantering inne i programmet och inga roller — alla inloggningar ser
samma bokföring med samma rättigheter. Roller (medarbetare, granskare för
revisorn, anställd) och inbjudningar inifrån appen finns i den licensierade
versionen.

## Steg 6 — Vercel: sätt appen på nätet

1. Logga in på [vercel.com](https://vercel.com) med kontot från steg 0.2.
2. **Add New → Project** → välj din fork `debet-kredit-community` → **Import**.
   Syns forken inte i listan: **Adjust GitHub App Permissions** och ge Vercel
   åtkomst (steg 0.2, punkt 3).
3. Innan du klickar Deploy: öppna **Environment Variables** och lägg in dem
   nedan. En *miljövariabel* är ett namn med ett värde som du lägger in hos
   Vercel i stället för i koden — så slipper nycklarna ligga i något som går att
   läsa på GitHub. Namnen måste stavas exakt:

   | Namn | Värde |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | din Project URL från steg 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon-nyckeln från steg 2 |
   | `STATS_API_KEY` | *Valfri.* En slumpsträng du hittar på själv (`openssl rand -base64 32`) som ger externa system läsåtkomst till dina nyckeltal via `/api/stats/*`. Hoppa över om du inte bygger egna integrationer |
   | `SUPABASE_SERVICE_ROLE_KEY` | *Valfri.* Behövs för läs-API:et ovan (tillsammans med `STATS_API_KEY`) och för Byråns åtkomst. Går förbi alla säkerhetsregler — lägg den aldrig någon annanstans än som miljövariabel på servern |

4. **Deploy**. Efter ~1 minut har du en adress i stil med
   `https://debet-kredit-dittnamn.vercel.app`.

## Steg 7 — Logga in och kom igång

Öppna din adress, logga in med kontot från steg 5. Första gången möts du av
**kom igång-wizarden**: företagsuppgifter, momsperiod, räkenskapsår. Fyll i och
bokför din första händelse.

## Valfria tillägg (när du vill)

- **Mejla fakturor**: konto på [resend.com](https://resend.com), verifiera din
  domän, lägg `RESEND_API_KEY` som miljövariabel i Vercel. Fakturor och
  påminnelser skickar du sedan från fakturan med ett klick — det finns ingen
  schemalagd utskicksautomatik i community-versionen.
- **Bankimport**: CSV-export från din internetbank funkar direkt utan
  konfiguration (Bank → Importera CSV). API-koppling via Enable Banking kräver
  egen appregistrering (`ENABLE_BANKING_APP_ID` och
  `ENABLE_BANKING_PRIVATE_KEY`).
- **Byråns åtkomst**: anlitar du en redovisningsbyrå kan de följa din bokföring
  utifrån utan att du delar ut ditt lösenord eller service-nyckeln. Du skapar
  nyckeln under Inställningar → Byråns åtkomst, den visas en enda gång, och du
  kan återkalla den när som helst — byrån tappar åtkomsten i samma sekund, även
  om de är inloggade just då. Kräver `SUPABASE_SERVICE_ROLE_KEY` i miljön.

  Nyckeln ger **läsning av sju siffror och ingenting annat**: antal obokförda
  händelser, omatchade banktransaktioner, verifikat utan underlag, datum för
  senaste verifikatet, till och med vilket datum bokföringen är låst, nästa
  momsdeadline och räkenskapsårets start, slut och status. Inga belopp, inga
  motparter, inga verifikat, inga underlag — och den kan inte bokföra. Det
  upprätthålls av databasen, inte av gränssnittet. Samma siffror kan du hämta
  själv på `/api/stats/byra` med din egen inloggning, om du vill räkna efter.

E-faktura via Peppol, attest av leverantörsfakturor och betalfil till banken
(ISO 20022) ingår inte i community-versionen.

---

## Var du förvarar nycklarna

Kort svar: lösenorden i en lösenordshanterare, nycklarna där de skapas, och en
lapp i byrålådan som säger var allt finns. Du behöver inte välja mellan de tre.

**1. De flesta nycklar behöver du aldrig spara.** En nyckel du klistrat in i
Vercel är redan förvarad — tappar du din kopia skapar du en ny hos leverantören
på två minuter och byter ut den. Det som **inte** går att återskapa är åtkomsten
till kontona: mejladressen, lösenorden och GitHubs reservkoder. Tappar du dem
tappar du allt annat på köpet. Ett undantag ska sparas när det skapas, för det
visas en enda gång: **databaslösenordet** i Supabase (samt Enable Bankings
PEM-fil, om du använder bankkopplingen, och **byrånyckeln** om du ger en
redovisningsbyrå åtkomst — tappas den bort återkallar du raden och skapar en ny,
det finns ingen väg tillbaka till strängen).

**2. Tre sätt att förvara.** Datorns egen hanterare (appen Lösenord, eller den i
Chrome/Edge) är enklast och räcker för kontona — men den är byggd för
webbplatslösenord, och Chromes saknar anteckningsfält för en nyckel utan
inloggningssida. **Bitwarden** (gratis) eller 1Password är bättre för just det
här: fria anteckningar, filer, samma app på Mac och Windows, och du kan dela en
enskild post med redovisningskonsulten i stället för att mejla den. **Papper i
en låst låda** är inte fånigt — hotet mot dig är nätfiske, inte inbrottstjuvar
som letar API-nycklar. Använd papper till reservkoderna och till kartan nedan,
inte till 200 tecken base64.

**3. Vad som aldrig får delas eller mejlas.** `SUPABASE_SERVICE_ROLE_KEY` går
förbi alla säkerhetsspärrar i databasen och ger full läs- och skrivåtkomst till
hela bokföringen. Använder du den (bara tillsammans med `STATS_API_KEY`, för
läs-API:et) ska den bo som miljövariabel på servern och ingen annanstans —
aldrig i mejl, chatt, skärmdump eller supportärende. Ingen konsult och ingen
"medarbetare från Supabase" behöver den; frågar någon efter den är det ett
bedrägeriförsök. Samma regel: `RESEND_API_KEY`, `STATS_API_KEY`, Enable Bankings
privata nyckel och databaslösenordet. **Okej i webbläsaren:** `anon`-nyckeln —
den är gjord för att vara publik och ligger redan i sidans kod hos alla som
öppnar appen. Det som skyddar bokföringen är inloggningen och databasens
radregler (RLS), plus att självregistreringen är avstängd (steg 5b).

**4. Om en nyckel läckt.** Ordningen spelar roll: skapa ny → lägg in den nya →
radera den gamla. Tvärtom står appen stilla under tiden.

| Läckt | Gör så här |
|---|---|
| `anon` eller `service_role` | Project Settings → API → Reset → nytt värde i Vercel (och `.env.local`) → **Redeploy** |
| Databaslösenordet | Project Settings → Database → Reset database password |
| Resend | API Keys → skapa ny → in i Vercel → Redeploy → radera den gamla |
| `STATS_API_KEY` | Den hittar du på själv — byt bara värdet i Vercel och kör Redeploy |
| Allt på en gång (stulen dator) | Mejlkontots lösenord först, sedan GitHub, Supabase och Vercel — och kontrollera att tvåstegsinloggningen sitter på en telefon du har kvar |

**Ditt nyckelkort — skriv ut och fyll i.** Skriv aldrig in själva
nyckelvärdena; kortet ska tåla att ligga i byrålådan. Det säger var sakerna
finns, inte vad de är.

| Konto eller nyckel | Används till | Förvaras i | Senast bytt |
|---|---|---|---|
| Mejladressen | alla konton nedan | | |
| Lösenordshanteraren | huvudlösenord + återställningskod | | |
| GitHub | din kopia av koden | | |
| GitHubs reservkoder | vägen in utan telefonen | papper | |
| Supabase-kontot | databasen | | |
| Databaslösenordet | Supabase, visas en gång | | |
| Vercel-kontot | appen körs här | | |
| Resend | mejlutskick, om du satt upp det | | |
| Enable Banking | bankkopplingen (PEM-fil) | | |

---

## Felsökning — de vanligaste

| Symptom | Orsak & fix |
|---|---|
| `pnpm install` klagar på build-skript (sharp/unrs-resolver) eller vägrar köra | Nyare pnpm kräver att paket med build-skript godkänns — kör `pnpm approve-builds` och välj `sharp` och `unrs-resolver`, kör sedan `pnpm install` igen |
| `db push` säger "failed to connect" | Fel databaslösenord — återställ under Project Settings → Database → Reset database password |
| Vit sida / "Invalid API key" efter deploy | Fel eller skiftad anon-nyckel i Vercel — kolla att URL/nyckel är exakt kopierade, redeploya efter ändring |
| Kan inte logga in / "E-postadressen är inte bekräftad" | Vanligast: bocken **Auto Confirm User** missades när användaren skapades (steg 5) — öppna användaren under Authentication → Users och bekräfta adressen, eller skapa om den med bocken i. Annars: användaren skapad i FEL Supabase-projekt, eller sign-ups avstängda innan du skapade kontot |
| `git` känns inte igen (Windows) eller "command not found: git" (Mac) | Git saknas, eller så öppnades terminalen innan installationen blev klar — installera enligt listan högst upp, stäng terminalfönstret och öppna ett nytt |
| GitHubs bilduppgift kommer om och om igen vid registreringen | Normalt, särskilt i webbläsare med hårda spårningsskydd — prova ljudalternativet eller ett vanligt fönster utan tillägg. Det är samma registrering hela tiden |
| Utelåst från GitHub (ny telefon, borttappad autentiseringsapp) | Använd en av reservkoderna från steg 0.1. Är även de borta återstår GitHubs egen kontoåterställning — och under tiden når du varken Vercel eller Supabase, eftersom de loggar in med GitHub |
| Forken syns inte i Vercels lista vid import | Vercels GitHub-app saknar åtkomst — **Adjust GitHub App Permissions** på importsidan, eller Settings → Git → Manage GitHub App Access, och välj **All repositories** |
| En guide ber mig lägga in `CRON_SECRET` | Den guiden gäller licensversionen. Community-versionen har ingen schemalagd utskicksautomatik och använder bara de två variablerna i steg 6 |
| `db push` avbryts med "policy ... already exists" | Ett tidigare försök hann halvvägs — kör `npx supabase db push` igen; migrationerna tål numera omkörning |
| Appen sover när du öppnar den | Supabase free tier pausar projekt efter 7 dagars inaktivitet — logga in på supabase.com och klicka "Restore". Bokför du varje vecka händer det aldrig. Vill du slippa helt: uppgradera projektet till Pro (~25 USD/mån) |

Kört fast ändå? Bokföringsfrågorna hittar du svar på i
[Konteringsguiden](KONTERINGSGUIDE.md) — och för installationsfrågor,
mejla/DM:a med skärmdump på felet så löser vi det.


