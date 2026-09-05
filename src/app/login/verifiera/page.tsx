"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { describeMfaError, MFA_NETWORK, MFA_SESSION_LOST } from "@/lib/mfa/errors";
import { Button } from "@/components/ui/button";
import { LoginShell } from "@/components/login-shell";
import { MfaCodeInput } from "@/components/mfa-code-input";

/**
 * Kodsteget vid inloggningen.
 *
 * Hit kommer man på två sätt, och sidan ser likadan ut båda gångerna. Den
 * vanliga vägen är att lösenordet just godkänts och kontot har
 * tvåstegsverifiering på. Den andra är att proxyn fångat en session som står
 * på aal1 och försökte nå appen — och då ska det ändå inte stå "åtkomst
 * nekad" någonstans. Kunden har inte gjort något fel; inloggningen är bara
 * inte färdig.
 *
 * Sidan ligger under /login-prefixet med flit: proxyn släpper redan in
 * utloggade där, så kodsteget behöver inget eget undantag i spärren. Ett
 * undantag till är ett hål till.
 */
export default function VerifyPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "utloggad">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  const submit = useCallback(async (value: string) => {
    if (!factorId || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const next = attempts + 1;
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({
        factorId, code: value,
      });
      if (err) {
        setAttempts(next);
        setError(describeMfaError(err, { attempts: next }));
        setCode("");
        return;
      }
      // Sessionen bär nu aal2, så proxyn släpper igenom. "/" är samma mål som
      // lösenordssteget på /login skickar till — kodsteget ska inte landa
      // någon annanstans än den vanliga inloggningen gör.
      router.push("/");
      router.refresh();
    } catch {
      setError(MFA_NETWORK);
    } finally {
      setBusy(false);
    }
  }, [attempts, busy, factorId, router]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.mfa.listFactors()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setState("utloggad"); return; }
        const verified = (data?.all ?? []).find(
          (f) => f.factor_type === "totp" && f.status === "verified",
        );
        if (!verified) {
          // Ingen faktor att bekräfta — hit hör kunden inte, och att stanna
          // kvar vore en återvändsgränd. Vidare in i programmet.
          router.replace("/");
          return;
        }
        setFactorId(verified.id);
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("utloggad"); });
    return () => { cancelled = true; };
  }, [router]);

  async function loggaUt() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (state === "utloggad") {
    return (
      <LoginShell>
        <div>
          <h1 className="text-2xl font-semibold">Ett steg till</h1>
          <p className="text-sm text-muted-foreground">{MFA_SESSION_LOST}</p>
        </div>
        <Button type="button" className="w-full" onClick={() => router.push("/login")}>
          Till inloggningen
        </Button>
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <div>
        <h1 className="text-2xl font-semibold">Ett steg till</h1>
        <p className="text-sm text-muted-foreground">
          Öppna din autentiseringsapp och skriv in koden för Debet &amp; Kredit.
        </p>
      </div>

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(code); }}>
        <MfaCodeInput
          id="mfa-login-code"
          label="Sexsiffrig kod"
          value={code}
          onChange={setCode}
          onComplete={(full) => { void submit(full); }}
          disabled={busy || state === "loading"}
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
          {busy ? "Kontrollerar…" : "Logga in"}
        </Button>
      </form>

      <div className="space-y-3">
        <button type="button" onClick={() => setHelpOpen((v) => !v)}
          className="block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          Kommer du inte åt appen?
        </button>
        {helpOpen && (
          <p className="rounded-md border bg-muted/40 p-3 text-sm">
            Koden finns bara i din autentiseringsapp, så den går inte att skicka till dig — det
            är just det som gör den värd något. Har appen försvunnit tar du bort din faktor i
            din egen Supabase-panel (Authentication → Users) och loggar sedan in med lösenordet
            som vanligt. Du äger panelen, så du kommer in igen på egen hand — steg för steg i{" "}
            <em>docs/TVASTEGSVERIFIERING.md</em>, avsnittet{" "}
            <em>Tappat din autentiseringsapp?</em>
          </p>
        )}
        <button type="button" onClick={() => { void loggaUt(); }}
          className="block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          Logga ut och börja om
        </button>
      </div>
    </LoginShell>
  );
}
