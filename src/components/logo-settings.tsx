"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveLogo, removeLogo } from "@/lib/actions/branding";
import { validateLogo } from "@/lib/branding/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Företagets logotyp. Ligger i Företagsuppgifter eftersom den hör ihop med
 * resten av det som hamnar på fakturan. Sparas direkt vid uppladdning, alltså
 * oberoende av formulärets Spara-knapp.
 */
export function LogoSettings({ logoUrl, demo = false }: {
  logoUrl: string | null;
  /** Delad demoinstans: logotypen är låst (spärren sitter i server-actionen) */
  demo?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) { toast.error("Välj en fil först."); return; }
    // Samma regel som servern, men svaret kommer direkt
    const invalid = validateLogo(file);
    if (invalid) { toast.error(invalid); return; }

    const fd = new FormData();
    fd.set("file", file);
    setBusy(true);
    const res = await saveLogo(fd);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Logotypen är sparad");
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await removeLogo();
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Logotypen är borttagen");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Label>Logotyp</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-32 items-center justify-center rounded-lg border bg-background p-1.5">
          {logoUrl ? (
            /* Signerad Supabase-länk som byts vid varje uppladdning: vanlig
               img i stället för next/image, som kräver konfigurerad domän. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt="Företagets logotyp" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-muted-foreground">Ingen logotyp</span>
          )}
        </div>
        <div className="space-y-2">
          <Input ref={inputRef} type="file" className="max-w-xs"
            accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"
            disabled={busy || demo} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={upload} disabled={busy || demo}>
              {busy ? "Laddar upp…" : "Ladda upp"}
            </Button>
            {logoUrl && !demo && (
              <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={busy}>
                Ta bort
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {demo
          ? "Låst i demon — logotypen syns i menyn för alla besökare samtidigt. I din egen installation laddar du upp din egen (PNG, JPG eller SVG, max 1 MB)."
          : "PNG, JPG eller SVG, max 1 MB. Visas överst i menyn och på faktura-PDF:en. SVG visas i menyn men inte på fakturan, där används företagsnamnet i stället."}
      </p>
    </div>
  );
}
