"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Fel e-post eller lösenord.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Varumärkespanel */}
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-xl">
            t
          </span>
          <span className="font-semibold text-white">
            Firmabok <span className="font-normal text-sidebar-foreground/70">Bokföring</span>
          </span>
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold text-white leading-snug">
            Hela firmans ekonomi.<br />Ett program. Noll månadskostnad.
          </h2>
          <ul className="space-y-1.5 text-sm text-sidebar-foreground/80">
            <li>✓ Fakturering med OCR och automatisk bokföring</li>
            <li>✓ Momsdeklaration och eSKD-fil på fem minuter</li>
            <li>✓ Bankkoppling med smart matchning</li>
            <li>✓ Årsbokslut, NE-bilaga och uttagssimulator</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          BAS 2026 · Bokföringslagen · SIE 4 · Byggd för enskild firma
        </p>
      </div>

      {/* Formulär */}
      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2.5 justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xl">
              t
            </span>
            <span className="font-semibold">Firmabok</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Välkommen tillbaka</h1>
            <p className="text-sm text-muted-foreground">Logga in för att fortsätta till bokföringen.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-post</Label>
              <Input id="email" type="email" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Lösenord</Label>
              <Input id="password" type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loggar in…" : "Logga in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
