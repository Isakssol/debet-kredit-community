"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveAppearance } from "@/lib/actions/settings";
import { ACCENT_PRESETS, BACKGROUND_PRESETS } from "@/lib/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Palette, Check } from "lucide-react";

export function AppearanceSettings({
  accent,
  background,
}: {
  accent: string | null;
  background: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState({
    accent: accent ?? "korall",
    background: background ?? "graddvit",
  });

  const apply = (next: { accent: string; background: string }) => {
    setCurrent(next);
    startTransition(async () => {
      const res = await saveAppearance({
        theme_accent: next.accent === "korall" ? null : next.accent,
        theme_background: next.background === "graddvit" ? null : next.background,
      });
      if (res.error) { toast.error(res.error); return; }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          Utseende
        </CardTitle>
        <CardDescription>
          Välj accentfärg och bakgrundston — ändringen gäller direkt i hela appen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Accentfärg</Label>
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_PRESETS.map((a) => (
              <button key={a.id} type="button" disabled={pending}
                onClick={() => apply({ ...current, accent: a.id })}
                title={a.label}
                className={cn(
                  "group flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all hover:shadow-md",
                  current.accent === a.id ? "border-foreground/40 shadow-sm" : "border-transparent"
                )}>
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ background: a.swatch }}>
                  {current.accent === a.id && <Check className="h-4 w-4 text-white" />}
                </span>
                <span className="text-[11px] text-muted-foreground">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Bakgrund</Label>
          <div className="flex flex-wrap gap-2.5">
            {BACKGROUND_PRESETS.map((b) => (
              <button key={b.id} type="button" disabled={pending}
                onClick={() => apply({ ...current, background: b.id })}
                title={b.label}
                className={cn(
                  "group flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all hover:shadow-md",
                  current.background === b.id ? "border-foreground/40 shadow-sm" : "border-transparent"
                )}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border"
                  style={{ background: b.swatch }}>
                  {current.background === b.id && <Check className="h-4 w-4 text-foreground/70" />}
                </span>
                <span className="text-[11px] text-muted-foreground">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
