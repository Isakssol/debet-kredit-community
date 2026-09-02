# Installationsguide — från noll till egen bokföring

Den här guiden tar dig hela vägen: från ingenting till ett körande system på
dina egna konton. Räkna med **30–60 minuter**. Du behöver inte kunna programmera,
men du kommer att köra några kommandon i terminalen — kopiera och klistra räcker.

**Det här behöver du innan du börjar:**

- En mejladress (samma på alla konton gör livet enklare)
- En lösenordshanterare (1Password, Bitwarden, iCloud-nyckelring…) — du kommer
  skapa flera lösenord och nycklar som ALDRIG får slarvas bort
- En dator med [Node.js](https://nodejs.org) installerat (LTS-versionen)
- Bankkort behövs **inte** — allt kör på gratisnivåer tills du själv väljer annat

**Kontona du skapar (alla gratis):** GitHub, Supabase, Vercel, och valfritt
Anthropic (AI-nyckel). Du äger allihop. Ingen annan har åtkomst — inte ens vi.

---

## Steg 1 — GitHub: hämta koden

1. Skapa konto på [github.com](https://github.com) om du saknar ett.
2. Öppna [Isakssol/debet-kredit-community](https://github.com/Isakssol/debet-kredit-community)
   och klicka **Fork** (uppe till höger) → **Create fork**.
   Nu har du en egen kopia under ditt konto: `dittnamn/debet-kredit-community`.

> **Obs:** Community-versionen är fryst per 2026-09-01 — den fungerar
> komplett men får inga uppdateringar (nästa års basbelopp, momsregler och
> nya funktioner ingår inte). Den underhållna versionen med support ingår i
> licensen — se prissidan som är länkad i huvud-README:n.

## Steg 2 — Supabase: databasen (här bor din bokföring)

1. Skapa konto på [supabase.com](https://supabase.com) → **New project**.
2. Välj organisation (din egen), döp projektet (t.ex. `bokforing`),
   region **Stockholm (eu-north-1)**, och låt Supabase generera ett
   databaslösenord → **spara det i lösenordshanteraren direkt**.
3. Vänta ~2 min tills projektet är klart.
4. Hämta dina nycklar under **Project Settings → API**:
   - `Project URL` (ser ut som `https://xxxx.supabase.co`)
   - `anon public`-nyckeln
   Spara båda i lösenordshanteraren.

## Steg 3 — Lägg in databasstrukturen

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

I Supabase-panelen: **Authentication → Users → Add user** →
din mejl + ett starkt lösenord (lösenordshanteraren!) → **Create user**.
Detta är kontot du loggar in i bokföringen med.

Rekommenderat: under **Authentication → Sign In / Up**, stäng av
**Allow new users to sign up** — då kan ingen annan skapa konton i din instans.

## Steg 6 — Vercel: sätt appen på nätet

1. Skapa konto på [vercel.com](https://vercel.com) — välj **Continue with
   GitHub** så hänger allt ihop.
2. **Add New → Project** → välj din fork `debet-kredit-community` → **Import**.
3. Innan du klickar Deploy: öppna **Environment Variables** och lägg in:

   | Namn | Värde |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | din Project URL från steg 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon-nyckeln från steg 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role`-nyckeln från steg 2 (behövs för att kunna skapa fler användare inifrån appen — hoppa över om du alltid kör ensam) |

4. **Deploy**. Efter ~1 minut har du en adress i stil med
   `https://debet-kredit-dittnamn.vercel.app`.

## Steg 7 — Logga in och kom igång

Öppna din adress, logga in med kontot från steg 5. Första gången möts du av
**kom igång-wizarden**: företagsuppgifter, momsperiod, räkenskapsår. Fyll i och
bokför din första händelse.

## Steg 8 (valfritt men rekommenderat) — AI:n

Två vägar, välj en:

**A. Anthropic-nyckel (enklast, bäst — läser även PDF-kvitton):**
1. Skapa konto på [console.anthropic.com](https://console.anthropic.com).
2. **Sätt ett utgiftstak först**: Settings → Limits → t.ex. 10 USD/månad.
   En normal månads bokföring kostar 10–50 kr — taket är din krockkudde.
3. Skapa en API-nyckel (börjar med `sk-ant-`) och klistra in den i appen under
   **Inställningar → Bolagstyp & AI-bokföraren**.

**B. Lokal modell (gratis, datan lämnar aldrig din dator/server):**
1. Installera [Ollama](https://ollama.com) och kör t.ex. `ollama pull llama3.1`.
2. I appen under Inställningar: fältet **Egen/lokal modell** →
   `http://localhost:11434/v1`, och modellnamnet (t.ex. `llama3.1`) i
   AI-modell-fältet. Obs: Rådgivarens webbsök kräver Anthropic-nyckel;
   AI-bokföraren funkar fullt ut lokalt.

## Valfria tillägg (när du vill)

- **Mejla fakturor**: konto på [resend.com](https://resend.com), verifiera din
  domän, lägg `RESEND_API_KEY` som miljövariabel i Vercel.
- **Bankimport**: CSV-export från din internetbank funkar direkt utan
  konfiguration (Bank → Importera CSV). API-koppling via Enable Banking kräver
  egen appregistrering — guide på begäran.
- **Skicka e-faktura**: eget konto hos t.ex. Storecove → Inställningar →
  E-faktura. Nedladdning av e-fakturafiler funkar alltid utan konto.

---

## Felsökning — de vanligaste

| Symptom | Orsak & fix |
|---|---|
| `pnpm install` klagar på build-skript (sharp/unrs-resolver) eller vägrar köra | Nyare pnpm kräver att paket med build-skript godkänns — kör `pnpm approve-builds` och välj `sharp` och `unrs-resolver`, kör sedan `pnpm install` igen |
| `db push` säger "failed to connect" | Fel databaslösenord — återställ under Project Settings → Database → Reset database password |
| Vit sida / "Invalid API key" efter deploy | Fel eller skiftad anon-nyckel i Vercel — kolla att URL/nyckel är exakt kopierade, redeploya efter ändring |
| Kan inte logga in | Användaren skapad i FEL Supabase-projekt, eller sign-ups avstängda innan du skapade kontot — skapa användaren igen under Authentication → Users |
| AI:n säger "lägg in nyckel" | Nyckeln sparades inte eller saknar kredit — kolla Inställningar, och att Anthropic-kontot har betalmetod/kredit |
| Appen sover när du öppnar den | Supabase free tier pausar projekt efter 7 dagars inaktivitet — logga in på supabase.com och klicka "Restore". Bokför du varje vecka händer det aldrig. Vill du slippa helt: uppgradera projektet till Pro (~25 USD/mån) |

Kört fast ändå? Fråga **Rådgivaren i appen** om bokföringsfrågor — och för
installationsfrågor, mejla/DM:a med skärmdump på felet så löser vi det.


