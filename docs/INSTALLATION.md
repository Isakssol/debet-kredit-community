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

**Kontona du skapar (alla gratis):** GitHub, Supabase, Vercel. Du äger
allihop. Ingen annan har åtkomst — inte ens vi.

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

1. Skapa konto på [vercel.com](https://vercel.com) — välj **Continue with
   GitHub** så hänger allt ihop.
2. **Add New → Project** → välj din fork `debet-kredit-community` → **Import**.
3. Innan du klickar Deploy: öppna **Environment Variables** och lägg in:

   | Namn | Värde |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | din Project URL från steg 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon-nyckeln från steg 2 |
   | `STATS_API_KEY` | *Valfri.* En slumpsträng du hittar på själv (`openssl rand -base64 32`) som ger externa system läsåtkomst till dina nyckeltal via `/api/stats/*`. Hoppa över om du inte bygger egna integrationer |
   | `SUPABASE_SERVICE_ROLE_KEY` | *Valfri.* Behövs bara tillsammans med `STATS_API_KEY`, för läs-API:et ovan. Går förbi alla säkerhetsregler — lägg den aldrig någon annanstans än som miljövariabel på servern |

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

E-faktura via Peppol, attest av leverantörsfakturor och betalfil till banken
(ISO 20022) ingår inte i community-versionen.

---

## Felsökning — de vanligaste

| Symptom | Orsak & fix |
|---|---|
| `pnpm install` klagar på build-skript (sharp/unrs-resolver) eller vägrar köra | Nyare pnpm kräver att paket med build-skript godkänns — kör `pnpm approve-builds` och välj `sharp` och `unrs-resolver`, kör sedan `pnpm install` igen |
| `db push` säger "failed to connect" | Fel databaslösenord — återställ under Project Settings → Database → Reset database password |
| Vit sida / "Invalid API key" efter deploy | Fel eller skiftad anon-nyckel i Vercel — kolla att URL/nyckel är exakt kopierade, redeploya efter ändring |
| Kan inte logga in | Användaren skapad i FEL Supabase-projekt, eller sign-ups avstängda innan du skapade kontot — skapa användaren igen under Authentication → Users |
| Appen sover när du öppnar den | Supabase free tier pausar projekt efter 7 dagars inaktivitet — logga in på supabase.com och klicka "Restore". Bokför du varje vecka händer det aldrig. Vill du slippa helt: uppgradera projektet till Pro (~25 USD/mån) |

Kört fast ändå? Bokföringsfrågorna hittar du svar på i
[Konteringsguiden](KONTERINGSGUIDE.md) — och för installationsfrågor,
mejla/DM:a med skärmdump på felet så löser vi det.


