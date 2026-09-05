"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { issueApiKey, revokeApiKey, type ApiKeyListRow } from "@/lib/actions/api-keys";
import {
  API_SCOPES,
  DEFAULT_SCOPES,
  SCOPE_DESCRIPTIONS,
  SCOPE_LABELS,
  describeScopes,
  isWriteScope,
  type ApiScope,
} from "@/lib/api/scopes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * API-nycklar — installationens egen väg att räcka sig själv en hand utåt.
 *
 * Sidan svarar på fyra frågor och inga andra: vilka integrationer har
 * åtkomst, vad får var och en göra, när och varifrån användes nyckeln senast,
 * och hur tar jag bort den? Att listan är tom i en vanlig installation är
 * rätt utfall — de flesta har ingen integration och ska inte känna att något
 * saknas.
 *
 * DET SOM GÖR ATT DET KÄNNS SOM STRIPE eller Resend ligger i en enda detalj:
 * när nyckeln visas följer ett färdigt curl-anrop med den redan inklistrad.
 * Det första lyckade anropet ligger ett klistrande bort, inte en
 * dokumentationsläsning bort.
 */

/** Explicit tidszon: annars visar servern och webbläsaren olika text. */
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));

/**
 * Bas-URL:en gissas ur webbläsarens adress i stället för att efterfrågas.
 *
 * I en självhostad modell är installationens adress just den sidan ägaren
 * står på, så curl-raden blir körbar direkt. Faller det (server-rendering)
 * står platshållaren kvar och säger vad som ska fyllas i.
 */
function baseUrl(): string {
  if (typeof window === "undefined") return "https://din-installation.se";
  return window.location.origin;
}

export function ApiKeysSettings({ keys, demo }: { keys: ApiKeyListRow[]; demo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; note: string; scopes: ApiScope[] }>({
    name: "",
    note: "",
    scopes: DEFAULT_SCOPES,
  });
  const [newKey, setNewKey] = useState<string | null>(null);

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);
  const valdaSkrivscope = form.scopes.filter(isWriteScope);

  const toggleScope = (scope: ApiScope) =>
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope)
        ? f.scopes.filter((s) => s !== scope)
        : [...f.scopes, scope],
    }));

  const issue = () =>
    startTransition(async () => {
      /**
       * Andra medvetna valet för skrivbehörighet. Kryssrutan är det första;
       * den här rutan är det andra. Samma tvåstegslogik som migrationen
       * använder mot sig själv — två lås som måste öppnas i samma andetag är
       * svårare att glömma än ett.
       */
      if (valdaSkrivscope.length > 0) {
        const vad = valdaSkrivscope.map((s) => SCOPE_LABELS[s].toLowerCase()).join(" och ");
        if (
          !window.confirm(
            `Nyckeln får behörigheten att ${vad}.\n\n`
              + "Den som har nyckeln kan alltså ändra i din bokföring. Periodlås och "
              + "avslutade räkenskapsår gäller lika för nyckeln som för dig själv — men "
              + "allt annat den gör är på riktigt.\n\n"
              + "Skapa nyckeln ändå?"
          )
        ) {
          return;
        }
      }

      const res = await issueApiKey({ ...form, note: form.note || undefined });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setNewKey(res.key ?? null);
      setForm({ name: "", note: "", scopes: DEFAULT_SCOPES });
      setShowForm(false);
      toast.success("API-nyckeln skapad");
      router.refresh();
    });

  const revoke = (id: string, name: string) => {
    if (
      !window.confirm(
        `Återkalla nyckeln för ${name}?\n\n`
          + "Integrationen slutar fungera omedelbart, även mitt i ett pågående anrop. "
          + "Nyckeln går inte att återuppliva — behövs åtkomst igen skapar du en ny."
      )
    )
      return;
    startTransition(async () => {
      const res = await revokeApiKey(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Nyckeln återkallad");
      router.refresh();
    });
  };

  const curlExempel = newKey
    ? `curl ${baseUrl()}/api/v1/meta \\\n  -H "Authorization: Bearer ${newKey}"`
    : "";

  return (
    <Card id="api" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          API-nycklar
        </CardTitle>
        <CardDescription>
          Din installation har ett eget API. Vill du koppla ihop den med en webshop,
          ett kassasystem, Excel eller något du byggt själv skapar du en nyckel här —
          ingen ansökan, inget partneravtal, ingen granskning. Din server, dina nycklar.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
          <p className="text-sm font-medium">Vad en nyckel kan, och vad ingen nyckel kan</p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {API_SCOPES.map((s) => (
              <li key={s}>
                <span className="font-medium text-foreground">{SCOPE_LABELS[s]}</span> —{" "}
                {SCOPE_DESCRIPTIONS[s]}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Ingen nyckel når dina företagsuppgifter, dina underlag, banken eller dina
            sparade nycklar — det upprätthålls av databasen, inte av gränssnittet. En
            nyckel som får bokföra går genom exakt samma spärrar som du själv:
            periodlås, avslutade räkenskapsår och balanskravet gäller lika.
          </p>
        </div>

        {active.length === 0 && revoked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen integration har åtkomst till den här installationen.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {[...active, ...revoked].map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{k.name}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {k.key_prefix}…
                    </code>
                    {(k.scopes ?? []).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">
                        {SCOPE_LABELS[s] ?? s}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {k.revoked_at ? (
                      <>Återkallad {stamp(k.revoked_at)}</>
                    ) : k.last_used_at ? (
                      <>
                        Senast använd {stamp(k.last_used_at)}
                        {k.last_used_ip && <> från {k.last_used_ip}</>}
                      </>
                    ) : (
                      <>Aldrig använd — skapad {stamp(k.created_at)}</>
                    )}
                    {!k.revoked_at && <> · högst {k.rate_limit_per_hour} anrop/timme</>}
                    {k.note && <> · {k.note}</>}
                  </div>
                </div>
                {k.revoked_at ? (
                  <Badge variant="secondary">Återkallad</Badge>
                ) : (
                  <>
                    <Badge variant="outline">Aktiv</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => revoke(k.id, k.name)}
                      title="Återkalla nyckeln"
                    >
                      <Ban className="h-3.5 w-3.5 text-destructive mr-1" />
                      Återkalla
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {newKey && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Nyckeln visas bara nu:</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded bg-card px-2 py-1 font-mono text-xs break-all">
                {newKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  toast.success("Kopierat");
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Kopiera
              </Button>
            </div>

            {/* Det första lyckade anropet ska ligga ett klistrande bort. */}
            <p className="mt-3 text-xs font-medium">Prova den direkt:</p>
            <div className="mt-1 flex flex-wrap items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded bg-card px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                {curlExempel}
              </pre>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(curlExempel);
                  toast.success("Kopierat");
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Kopiera
              </Button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Förvara den som ett lösenord — aldrig i klientkod, aldrig i ett kodarkiv.
              Den går inte att visa igen; tappas den bort återkallar du raden och skapar
              en ny.{" "}
              <button className="underline" onClick={() => setNewKey(null)}>
                Dölj
              </button>
            </p>
          </div>
        )}

        {demo ? (
          <p className="text-xs text-muted-foreground">
            API-nycklar kan inte skapas i demon — den är gemensam för alla besökare.
            I din egen installation gör du det härifrån.
          </p>
        ) : showForm ? (
          <div className="space-y-4 rounded-xl border p-4">
            <p className="text-sm font-medium">Skapa API-nyckel</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="api-namn">Vad ska den användas till?</Label>
                <Input
                  id="api-namn"
                  value={form.name}
                  placeholder="Webshoppen, Power BI, egen scriptning…"
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="api-notering">Anteckning (valfritt)</Label>
                <Input
                  id="api-notering"
                  value={form.note}
                  placeholder="Kontaktperson, system, datum…"
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Behörighet</Label>
              {API_SCOPES.map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                    checked={form.scopes.includes(s)}
                    disabled={pending}
                    onChange={() => toggleScope(s)}
                  />
                  <span>
                    <span className="font-medium">{SCOPE_LABELS[s]}</span>
                    <code className="ml-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {s}
                    </code>
                    <span className="block text-xs text-muted-foreground">
                      {SCOPE_DESCRIPTIONS[s]}
                    </span>
                  </span>
                </label>
              ))}
              <p className="text-xs text-muted-foreground">{describeScopes(form.scopes)}</p>
              {valdaSkrivscope.length > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-foreground">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  Nyckeln kommer att kunna ändra i bokföringen. Du får bekräfta en gång
                  till innan den skapas.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={issue}
                disabled={pending || !form.name.trim() || form.scopes.length === 0}
              >
                {pending ? "Skapar…" : "Skapa nyckel"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setShowForm(false)}>
                Avbryt
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Skapa API-nyckel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
