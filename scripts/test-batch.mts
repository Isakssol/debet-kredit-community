/**
 * E2E-test av AI-batchimporten: kör den riktiga inköpslistan genom exakt
 * samma kodväg som servern (prompt → Claude → validering → bokföring).
 * Körs: node --experimental-strip-types scripts/test-batch.mts <csv-fil> [--book]
 */
import { readFileSync } from "fs";
import { buildSystemPrompt, buildBatchPrompt, validateSuggestion } from "../src/lib/ai/bookkeeper.ts";
import { callAi, extractJson } from "../src/lib/ai/provider.ts";

// Ladda .env.local
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
  return res.json() as Promise<T>;
}

const csvPath = process.argv[2];
const doBook = process.argv.includes("--book");
const csv = readFileSync(csvPath, "utf-8");

const today = new Date().toISOString().slice(0, 10);
const accounts = await rest<{ number: number; name: string; description: string | null }[]>(
  `/accounts?select=number,name,description&active=eq.true&blocked=eq.false&order=number`);
const rulesRaw = await rest<{ key: string; value: number }[]>(
  `/rule_values?select=key,value&valid_from=lte.${today}&or=(valid_to.gte.${today},valid_to.is.null)`);
const rules = Object.fromEntries(rulesRaw.map((r) => [r.key, Number(r.value)]));

console.log(`Kontoplan: ${accounts.length} konton · Anropar AI...`);
const response = await callAi(buildSystemPrompt(accounts, rules, today), buildBatchPrompt(csv), undefined, 8000);
const raw = extractJson(response) as { inkop?: unknown[] };
const items = raw?.inkop ?? [];
console.log(`AI returnerade ${items.length} förslag\n`);

const validAccounts = new Set(accounts.map((a) => a.number));
let okCount = 0, total = 0;
const approved: ReturnType<typeof validateSuggestion>[] = [];

for (const item of items) {
  const v = validateSuggestion(item, validAccounts);
  if (!v.ok) {
    console.log(`❌ UNDERKÄND: ${JSON.stringify(item).slice(0, 80)} → ${v.error}`);
    continue;
  }
  okCount++;
  const s = v.suggestion;
  total += s.total_inkl_moms;
  console.log(`✅ [${s.confidence.toUpperCase()}] ${s.datum} ${s.beskrivning} — ${s.motpart}`);
  for (const r of s.rader) {
    console.log(`     ${r.account}  D ${r.debit.toFixed(2).padStart(10)}  K ${r.credit.toFixed(2).padStart(10)}  ${r.motivering ?? ""}`);
  }
  for (const w of s.varningar) console.log(`     ⚠️  ${w}`);
  if (s.fraga) console.log(`     ❓ ${s.fraga}`);
  approved.push(v);
}
console.log(`\n${okCount}/${items.length} godkända · totalt ${total.toFixed(2)} kr`);

if (doBook) {
  console.log("\nBokför...");
  for (const v of approved) {
    if (!v.ok) continue;
    const s = v.suggestion;
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/book_verification`, {
      method: "POST", headers,
      body: JSON.stringify({
        p_series_code: "A", p_date: s.datum, p_description: s.beskrivning,
        p_rows: s.rader.map((r) => ({ account: r.account, debit: r.debit, credit: r.credit, note: r.motivering })),
        p_counterparty: s.motpart, p_source: "quick_event",
      }),
    });
    const data = await res.json();
    if (!res.ok) console.log(`❌ ${s.beskrivning}: ${JSON.stringify(data)}`);
    else console.log(`📗 ${data[0]?.out_series}${data[0]?.out_number} — ${s.beskrivning}`);
  }
}
