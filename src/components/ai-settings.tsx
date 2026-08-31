"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveAiSettings } from "@/lib/actions/settings";
import { ANTHROPIC_MODELS } from "@/lib/ai/models";
import { standardRules } from "@/lib/ai/standard-rules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

const COMPANY_TYPES = [
  { id: "enskild_firma", label: "Enskild firma" },
  { id: "aktiebolag", label: "Aktiebolag" },
  { id: "handelsbolag", label: "Handelsbolag" },
] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AiSettings({
  companyType,
  hasKey,
  model,
  rules,
}: {
  companyType: string;
  hasKey: boolean;
  model: string | null;
  rules: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    company_type: companyType,
    ai_api_key: "",
    ai_model: model ?? "",
    ai_rules: rules ?? "",
  });

  const save = (clearKey = false) =>
    startTransition(async () => {
      const res = await saveAiSettings({ ...form, clear_key: clearKey });
      if (res.error) toast.error(res.error);
      else {
        toast.success(clearKey ? "AI-nyckeln borttagen" : "AI-inställningar sparade");
        if (!clearKey) setForm((f) => ({ ...f, ai_api_key: "" }));
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Bolagstyp & AI-bokföraren
        </CardTitle>
        <CardDescription>
          AI:n konterar enligt din bolagstyp, dina egna regler och din tidigare bokföring.
          Nyckeln lagras i din databas — använd gärna en nyckel med utgiftstak.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="company_type">Bolagstyp</Label>
            <select
              id="company_type"
              className={selectClass}
              value={form.company_type}
              onChange={(e) => setForm((f) => ({ ...f, company_type: e.target.value }))}
            >
              {COMPANY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            {form.company_type !== "enskild_firma" && (
              <p className="text-xs text-muted-foreground">
                Löpande bokföring, moms och rapporter fungerar fullt ut. Årsavslutet
                (K1/NE-bilaga) gäller endast enskild firma än så länge.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai_model">AI-modell</Label>
            <select
              id="ai_model"
              className={selectClass}
              value={form.ai_model}
              onChange={(e) => setForm((f) => ({ ...f, ai_model: e.target.value }))}
            >
              <option value="">Standard (Claude Sonnet 5)</option>
              {ANTHROPIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="ai_api_key">API-nyckel</Label>
            {hasKey
              ? <Badge variant="outline" className="text-emerald-600">Nyckel sparad</Badge>
              : <Badge variant="outline">Ingen nyckel</Badge>}
          </div>
          <Input
            id="ai_api_key"
            type="password"
            autoComplete="off"
            placeholder={hasKey ? "•••••••• (lämna tomt för att behålla)" : "sk-ant-… (Anthropic) eller sk-… (OpenAI)"}
            value={form.ai_api_key}
            onChange={(e) => setForm((f) => ({ ...f, ai_api_key: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Hämtas på console.anthropic.com (rekommenderas — läser även PDF) eller
            platform.openai.com. Du betalar bara för din egen användning.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai_rules">Konteringsregler</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setForm((f) => ({ ...f, ai_rules: standardRules(f.company_type) }))}
            >
              Fyll i standardregler
            </Button>
          </div>
          <Textarea
            id="ai_rules"
            rows={10}
            placeholder={"Lämnas fältet tomt gäller de svenska standardreglerna för din bolagstyp automatiskt.\nKlicka \"Fyll i standardregler\" för att se och anpassa dem — t.ex.\n– Alla inköp betalas med ägarens privata kort → kreditera 2018\n– Kundbetalningar går via PayPal → 1940, avgiften → 6570"}
            value={form.ai_rules}
            onChange={(e) => setForm((f) => ({ ...f, ai_rules: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Standardreglerna följer BAS-kontoplanen och god redovisningssed och gäller
            tills du skriver egna. De tvingande reglerna (momssatser, omvänd
            skattskyldighet, balanskrav) är inbyggda och kan inte ändras här.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => save(false)} disabled={pending}>
            {pending ? "Sparar…" : "Spara"}
          </Button>
          {hasKey && (
            <Button variant="outline" onClick={() => save(true)} disabled={pending}>
              Ta bort nyckel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
