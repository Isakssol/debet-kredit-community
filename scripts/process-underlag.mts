/**
 * Underlagsprocessorn: laddar upp PDF:er till arkivet, låter AI:n läsa varje
 * dokument, matchar mot redan bokförda verifikat (koppla som underlag) eller
 * bokför nya händelser. Kör: node --experimental-strip-types scripts/process-underlag.mts fil1.pdf fil2.pdf ...
 */
import { readFileSync } from "fs";
import { basename } from "path";
import { buildSystemPrompt, validateSuggestion } from "../src/lib/ai/bookkeeper.ts";
import { callAi, extractJson } from "../src/lib/ai/provider.ts";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SUPABASE = "http://127.0.0.1:55321";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE}/rest/v1${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// Kontext: kontoplan, regler, redan bokförda verifikat
const today = new Date().toISOString().slice(0, 10);
const accounts = await rest<{ number: number; name: string; description: string | null }[]>(
  `/accounts?select=number,name,description&active=eq.true&blocked=eq.false&order=number`);
const rulesRaw = await rest<{ key: string; value: number }[]>(
  `/rule_values?select=key,value&valid_from=lte.${today}&or=(valid_to.gte.${today},valid_to.is.null)`);
const rules = Object.fromEntries(rulesRaw.map((r) => [r.key, Number(r.value)]));
const validAccounts = new Set(accounts.map((a) => a.number));

type Ver = {
  id: string; number: number; verification_date: string; description: string;
  counterparty: string | null;
  verification_series: { code: string };
  verification_rows: { debit: number }[];
  attachments: { id: string }[];
};
const vers = await rest<Ver[]>(
  `/verifications?select=id,number,verification_date,description,counterparty,verification_series(code),verification_rows(debit),attachments(id)&order=number`);
const verList = vers.map((v) => ({
  id: v.id,
  label: `${v.verification_series.code}${v.number}`,
  date: v.verification_date,
  description: v.description,
  counterparty: v.counterparty,
  total: v.verification_rows.reduce((s, r) => s + Number(r.debit), 0),
  hasAttachment: v.attachments.length > 0,
}));

const verContext = verList
  .map((v) => `${v.label} | ${v.date} | ${v.total.toFixed(2)} kr | ${v.counterparty ?? "-"} | ${v.description}${v.hasAttachment ? " [har redan underlag]" : ""}`)
  .join("\n");

const matchPrompt = (fileName: string) => `Det bifogade dokumentet är ett underlag (kvitto/faktura) med filnamn "${fileName}".

REDAN BOKFÖRDA VERIFIKAT:
${verContext}

DIN UPPGIFT — svara med JSON i EXAKT ett av två format:

1. Om dokumentet är underlaget för ett REDAN BOKFÖRT verifikat (matcha på belopp,
   datum ±5 dagar, leverantör, ordernummer). Belopp i utländsk valuta: räkna om
   ungefärligt och matcha mot närmaste verifikat:
   {"match": "A5", "kommentar": "kort motivering", "dokument": "kort beskrivning av dokumentet"}

2. Om dokumentet är en NY affärshändelse som inte finns bokförd: ett komplett
   konteringsförslag enligt systemformatet (datum, motpart, beskrivning,
   total_inkl_moms, moms_belopp, moms_sats, betalsatt, rader, varningar, fraga,
   confidence). Anta betalning från företagskontot om inget annat framgår.

3. Om dokumentet INTE är ett bokföringsunderlag alls (t.ex. sökresultat, offert,
   orderbekräftelse utan betalning): {"match": null, "kommentar": "varför", "dokument": "beskrivning"}

Var noga: dubbelbokföring är värre än att avstå. Vid tveksamhet → matcha eller avstå, bokför inte nytt.`;

const files = process.argv.slice(2);
console.log(`Bearbetar ${files.length} dokument...\n`);
const summary: string[] = [];

for (const filePath of files) {
  const fileName = basename(filePath);
  const buffer = readFileSync(filePath);
  const base64 = buffer.toString("base64");

  // 1. Ladda upp till arkivet
  const storagePath = `inkorg/${Date.now()}-${fileName.normalize("NFD").replace(/[^a-zA-Z0-9._()-]/g, "_")}`;
  const upRes = await fetch(`${SUPABASE}/storage/v1/object/underlag/${encodeURIComponent(storagePath)}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/pdf" },
    body: buffer,
  });
  if (!upRes.ok) { console.log(`❌ ${fileName}: uppladdning misslyckades: ${await upRes.text()}`); continue; }
  const [att] = await rest<{ id: string }[]>(`/attachments`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ storage_path: storagePath, file_name: fileName, mime_type: "application/pdf" }),
  });

  // 2. AI-analys
  let out: Record<string, unknown>;
  try {
    const response = await callAi(
      buildSystemPrompt(accounts, rules, today),
      matchPrompt(fileName),
      { base64, mimeType: "application/pdf" },
      3000
    );
    out = extractJson(response) as Record<string, unknown>;
  } catch (e) {
    console.log(`❌ ${fileName}: AI-fel: ${(e as Error).message}`);
    summary.push(`❌ ${fileName} — AI-fel`);
    continue;
  }

  // 3a. Matchning mot befintligt verifikat
  if ("match" in out) {
    const label = out.match as string | null;
    if (!label) {
      console.log(`⏭️  ${fileName}: EJ BOKFÖRINGSUNDERLAG — ${out.kommentar}`);
      summary.push(`⏭️ ${fileName} — inte underlag (${out.dokument ?? out.kommentar})`);
      continue;
    }
    const ver = verList.find((v) => v.label === label);
    if (!ver) {
      console.log(`⚠️  ${fileName}: AI matchade mot okänt verifikat ${label}`);
      summary.push(`⚠️ ${fileName} — okänd match ${label}`);
      continue;
    }
    await rest(`/attachments?id=eq.${att.id}`, {
      method: "PATCH",
      body: JSON.stringify({ verification_id: ver.id }),
    });
    console.log(`🔗 ${fileName} → ${label} (${ver.description.slice(0, 50)}) — ${out.kommentar}`);
    summary.push(`🔗 ${fileName} → ${label}`);
    continue;
  }

  // 3b. Ny händelse — validera och bokför
  const v = validateSuggestion(out, validAccounts);
  if (!v.ok) {
    console.log(`❌ ${fileName}: förslag underkänt: ${v.error}`);
    summary.push(`❌ ${fileName} — underkänt förslag`);
    continue;
  }
  const s = v.suggestion;
  const bookRes = await fetch(`${SUPABASE}/rest/v1/rpc/book_verification`, {
    method: "POST", headers,
    body: JSON.stringify({
      p_series_code: "A", p_date: s.datum, p_description: s.beskrivning,
      p_rows: s.rader.map((r) => ({ account: r.account, debit: r.debit, credit: r.credit, note: r.motivering })),
      p_counterparty: s.motpart, p_source: "quick_event",
    }),
  });
  const booked = await bookRes.json();
  if (!bookRes.ok) {
    console.log(`❌ ${fileName}: bokföringen misslyckades: ${JSON.stringify(booked)}`);
    summary.push(`❌ ${fileName} — bokföringsfel`);
    continue;
  }
  const newLabel = `${booked[0]?.out_series}${booked[0]?.out_number}`;
  await rest(`/attachments?id=eq.${att.id}`, {
    method: "PATCH",
    body: JSON.stringify({ verification_id: booked[0]?.out_id }),
  });
  console.log(`📗 ${fileName} → NYTT ${newLabel}: ${s.beskrivning} (${s.total_inkl_moms.toFixed(2)} kr) [${s.confidence}]`);
  for (const w of s.varningar) console.log(`     ⚠️ ${w}`);
  summary.push(`📗 ${fileName} → ${newLabel} (nytt, ${s.total_inkl_moms.toFixed(2)} kr)`);
}

console.log("\n===== SAMMANFATTNING =====");
for (const line of summary) console.log(line);
