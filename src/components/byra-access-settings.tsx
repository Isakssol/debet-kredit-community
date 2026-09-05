"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Copy, Ban, Plus } from "lucide-react";
import { issueByraKey, revokeByraKey } from "@/lib/actions/byra-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Byråns åtkomst — din sida över vem som läser.
 *
 * Sidan svarar på tre frågor och inga andra: vilka byråer har åtkomst, när
 * använde de den senast, och hur tar jag bort den? Att listan är tom i en
 * vanlig installation är rätt utfall — de flesta har ingen byrå.
 *
 * "Vad byrån ser" står utskrivet i klartext, kolumn för kolumn. Ett löfte om
 * begränsad insyn som bara finns i ett avtal är inget löfte; det här är samma
 * uppräkning som vyn byra_stats faktiskt projicerar (20260907000013).
 */

export type ByraKeyRow = {
  id: string;
  agency_name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  note: string | null;
};

/** Explicit tidszon: annars visar servern och webbläsaren olika text. */
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  }).format(new Date(iso));

const SER = [
  "Antal obokförda händelser",
  "Antal omatchade banktransaktioner",
  "Antal verifikat som saknar underlag",
  "Datum för senaste verifikatet",
  "Till och med vilket datum bokföringen är låst",
  "Nästa momsdeadline",
  "Räkenskapsårets start, slut och status",
];

export function ByraAccessSettings({ keys, demo }: { keys: ByraKeyRow[]; demo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ agency_name: "", note: "" });
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  const issue = () =>
    startTransition(async () => {
      const res = await issueByraKey({ ...form, note: form.note || undefined });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setNewKey(res.key ?? null);
      setForm({ agency_name: "", note: "" });
      setShowForm(false);
      toast.success("Byrånyckeln skapad");
      router.refresh();
    });

  const revoke = (id: string, agency: string) => {
    if (
      !window.confirm(
        `Återkalla åtkomsten för ${agency}?\n\n` +
          "Byrån slutar se dina siffror omedelbart, även om de redan är inloggade. " +
          "Nyckeln går inte att återuppliva — behöver de åtkomst igen får du skapa en ny."
      )
    )
      return;
    startTransition(async () => {
      const res = await revokeByraKey(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Åtkomsten återkallad");
      router.refresh();
    });
  };

  return (
    <Card id="byra" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Byråns åtkomst
        </CardTitle>
        <CardDescription>
          Om du anlitar en redovisningsbyrå kan de följa din bokföring utifrån med
          en egen nyckel. Nyckeln skapas här, av dig, och du kan när som helst ta
          tillbaka den. Byrån kan inte ge sig själv åtkomst.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
          <p className="text-sm font-medium">Detta är allt en byrånyckel visar</p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {SER.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Inga belopp, inga motparter, inga verifikat. Nyckeln når inte kunder,
            leverantörer, fakturor, banktransaktioner, underlag eller dina sparade
            API-nycklar — och den kan inte bokföra. Det upprätthålls av databasen,
            inte av gränssnittet.
          </p>
        </div>

        {active.length === 0 && revoked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen byrå har åtkomst till den här installationen.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {[...active, ...revoked].map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{k.agency_name}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {k.key_prefix}…
                    </code>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {k.revoked_at ? (
                      <>Återkallad {stamp(k.revoked_at)}</>
                    ) : k.last_used_at ? (
                      <>Senast använd {stamp(k.last_used_at)}</>
                    ) : (
                      <>Aldrig använd — skapad {stamp(k.created_at)}</>
                    )}
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
                      onClick={() => revoke(k.id, k.agency_name)}
                      title="Återkalla byråns åtkomst"
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
              <code className="rounded bg-card px-2 py-1 font-mono text-xs break-all">{newKey}</code>
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
            <p className="mt-2 text-xs text-muted-foreground">
              Skicka den till byrån på ett säkert sätt. Den går inte att visa igen —
              tappas den bort återkallar du raden och skapar en ny.{" "}
              <button className="underline" onClick={() => setNewKey(null)}>
                Dölj
              </button>
            </p>
          </div>
        )}

        {demo ? (
          <p className="text-xs text-muted-foreground">
            Byrånycklar kan inte skapas i demon — den är gemensam för alla besökare.
            I din egen installation gör du det härifrån.
          </p>
        ) : showForm ? (
          <div className="space-y-3 rounded-xl border p-4">
            <p className="text-sm font-medium">Ge en byrå åtkomst</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="byra-namn">Byråns namn</Label>
                <Input
                  id="byra-namn"
                  value={form.agency_name}
                  placeholder="Redovisningsbyrån AB"
                  onChange={(e) => setForm((f) => ({ ...f, agency_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="byra-notering">Anteckning (valfritt)</Label>
                <Input
                  id="byra-notering"
                  value={form.note}
                  placeholder="Kontaktperson, avtalsdatum…"
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={issue} disabled={pending || !form.agency_name.trim()}>
                {pending ? "Skapar…" : "Skapa nyckel"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setShowForm(false)}>
                Avbryt
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Ge en byrå åtkomst
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
