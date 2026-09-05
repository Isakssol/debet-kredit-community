"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { describeMfaError, MFA_ENROLL_CANCELLED, MFA_NETWORK } from "@/lib/mfa/errors";
import { formatSecret, qrCodeSrc } from "@/lib/mfa/qr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MfaCodeInput } from "@/components/mfa-code-input";

/**
 * Tvåstegsverifiering — kundens egen på/av-knapp.
 *
 * VAD DEN GÖR. Aktivering i två uttalade steg: koppla ihop appen (QR-kod eller
 * nyckel att skriva av) och bekräfta med en kod. Avstängning kräver också en
 * kod — annars skulle den som kommit över lösenordet kunna stänga av skyddet,
 * och då vore det inget skydd.
 *
 * VAD DEN INTE GÖR. Den håller ingen spärr. Allt här är gränssnitt, och
 * gränssnitt går att gå förbi. Kravet på kodsteget hålls av proxyn framför
 * appen (se src/lib/mfa/aal.ts), och nycklarna ligger i din egen Supabase —
 * ingen annan kan läsa dem eller stänga av skyddet åt dig.
 *
 * VAR DEN BOR I DEN HÄR UTGÅVAN. Community-versionen är enanvändarprogrammet:
 * en installation, ett inloggningskonto, ingen profilsida och inga roller.
 * Kortet ligger därför under Inställningar → Säkerhet, som är den enda ytan
 * som finns. Faktorn är ändå personlig — den hör till inloggningskontot, inte
 * till företaget — och den formuleringen står kvar i texterna för den som kör
 * med flera konton mot samma installation.
 *
 * VARFÖR SKRÄPFAKTORER STÄDAS FÖRE VARJE ENROLL. En påbörjad men aldrig
 * bekräftad aktivering ligger kvar som `unverified` med samma namn. Nästa
 * försök svarar då "friendly name already exists" och kunden möts av ett fel
 * som inte har med hennes kod att göra. De räknas dessutom mot projektets tak
 * på tio faktorer. Alltså: städa först, och städa igen om dialogen stängs.
 *
 * DEMON. Demokontot delas av alla som testar samtidigt. En faktor där skulle
 * ge nästa besökare ett kodsteg som ingen kan klara, och demon vore låst tills
 * någon rensade faktorn för hand. Därför är knappen låst i demoläget — och
 * spärren i proxyn lämnas på även där, eftersom ett undantag i en spärr är
 * precis den sortens mönster som kopieras vidare.
 */

type VerifiedFactor = { id: string; friendlyName: string | null; createdAt: string };
type Pending = { factorId: string; qr: string; secret: string };

const FRIENDLY_NAME = "Debet & Kredit";

const DEMO_LOCK =
  "Låst i demon — demokontot delas av alla som testar just nu, och ett kodsteg här skulle "
  + "stänga ute nästa besökare. I din egen installation slår du på det själv här under "
  + "Inställningar → Säkerhet.";

const dateOnly = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
};

export function SecuritySettings({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [factor, setFactor] = useState<VerifiedFactor | null>(null);

  const [mode, setMode] = useState<"enroll" | "disable" | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [copied, setCopied] = useState(false);

  const readFactor = useCallback(async (): Promise<{
    factor: VerifiedFactor | null; error: string | null;
  }> => {
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) return { factor: null, error: describeMfaError(err) };
    const verified = (data?.all ?? []).find(
      (f) => f.factor_type === "totp" && f.status === "verified",
    );
    return {
      factor: verified
        ? { id: verified.id, friendlyName: verified.friendly_name ?? null, createdAt: verified.created_at }
        : null,
      error: null,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    readFactor()
      .then((res) => {
        if (cancelled) return;
        setFactor(res.factor);
        setLoadError(res.error);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(MFA_NETWORK);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [readFactor]);

  async function reload() {
    const res = await readFactor();
    setFactor(res.factor);
    setLoadError(res.error);
  }

  /** Ta bort varje påbörjad, obekräftad TOTP-faktor. Tyst — det är städning. */
  async function clearUnverified() {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
  }

  function resetDialogState() {
    setStep(1);
    setPending(null);
    setCode("");
    setError(null);
    setAttempts(0);
    setCopied(false);
  }

  async function startEnroll() {
    if (demo) { toast.error(DEMO_LOCK); return; }
    setBusy(true);
    setError(null);
    try {
      await clearUnverified();
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: FRIENDLY_NAME,
        issuer: "Debet & Kredit",
      });
      if (err || !data) { toast.error(describeMfaError(err)); return; }
      setPending({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setStep(1);
      setCode("");
      setMode("enroll");
    } finally {
      setBusy(false);
    }
  }

  /** Stäng dialogen och lämna ingenting halvfärdigt efter oss. */
  async function cancelEnroll() {
    const factorId = pending?.factorId;
    setMode(null);
    resetDialogState();
    if (!factorId) return;
    const supabase = createClient();
    await supabase.auth.mfa.unenroll({ factorId }).catch(() => undefined);
    toast.message(MFA_ENROLL_CANCELLED);
  }

  async function confirmEnroll() {
    if (!pending || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const next = attempts + 1;
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pending.factorId, code,
      });
      if (err) {
        setAttempts(next);
        setError(describeMfaError(err, { attempts: next }));
        setCode("");
        return;
      }
      setMode(null);
      resetDialogState();
      toast.success(
        "Tvåstegsverifieringen är på. Från nästa inloggning frågar vi efter en kod från appen.");
      await reload();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (!factor || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const next = attempts + 1;
    try {
      const supabase = createClient();
      // Koden först: `unenroll` av en verifierad faktor kräver ändå en session
      // som tagit kodsteget, och kravet ska stå i klartext i flödet.
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id, code,
      });
      if (verifyErr) {
        setAttempts(next);
        setError(describeMfaError(verifyErr, { attempts: next }));
        setCode("");
        return;
      }
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (err) { setError(describeMfaError(err)); return; }
      // Sessionen bär fortfarande aal2 tills token förnyas. Ofarligt, men en
      // token som lovar ett kodsteg som inte längre finns är en osanning.
      await supabase.auth.refreshSession();
      setMode(null);
      resetDialogState();
      toast.success("Tvåstegsverifieringen är avstängd.");
      await reload();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const activeSince = factor ? dateOnly(factor.createdAt) : null;

  return (
    <Card id="tvastegsverifiering" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Tvåstegsverifiering
        </CardTitle>
        <CardDescription>
          Ett extra steg vid inloggningen: efter lösenordet skriver du in en sexsiffrig kod
          från en app i din telefon. Samma metod som din bank och ditt GitHub-konto använder.
          Den som skulle få tag på ditt lösenord kommer ändå inte in utan telefonen.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Hämtar läget…</p>
        ) : loadError ? (
          <p className="text-muted-foreground">{loadError}</p>
        ) : factor ? (
          <>
            <p className="flex items-start gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span>
                {activeSince ? `Aktiv sedan ${activeSince}. ` : "Aktiv. "}
                Vid inloggning frågar vi efter en kod från din autentiseringsapp.
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Metod: autentiseringsapp (tidsbaserad kod)
            </p>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <strong>Byter du telefon:</strong> flytta över kontot i autentiseringsappen innan
              du nollställer den gamla telefonen. Blir appen ändå borta tar du bort din faktor i
              din egen Supabase-panel och loggar in med lösenordet som vanligt — steg för steg i{" "}
              <em>docs/TVASTEGSVERIFIERING.md</em>, avsnittet <em>Tappat din autentiseringsapp?</em>
            </div>
            <Button type="button" variant="outline" disabled={busy}
              onClick={() => { resetDialogState(); setMode("disable"); }}>
              Stäng av
            </Button>
          </>
        ) : (
          <>
            <p className="flex items-start gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">
                Tvåstegsverifiering är avstängd för ditt konto.
              </span>
            </p>
            <Button type="button" onClick={startEnroll} disabled={busy || demo}>
              {busy ? "Förbereder…" : "Aktivera tvåstegsverifiering"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {demo
                ? DEMO_LOCK
                : "Valet är ditt och gäller det inloggningskonto du sitter på just nu. Kör du "
                  + "med flera konton mot samma installation slår var och en på det själv. "
                  + "Aktiveringen tar ungefär en minut och du behöver telefonen till hands."}
            </p>
          </>
        )}
      </CardContent>

      {/* Aktivering, steg 1–2 */}
      <Dialog open={mode === "enroll"} onOpenChange={(open) => { if (!open) void cancelEnroll(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aktivera tvåstegsverifiering</DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Steg 1 av 2 — koppla ihop appen med ditt konto"
                : "Steg 2 av 2 — bekräfta att kopplingen sitter"}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-sm">
                Öppna en autentiseringsapp i telefonen och skanna rutan nedan. Har du ingen app
                än fungerar Google Authenticator, Microsoft Authenticator, Authy eller 1Password
                lika bra — alla följer samma standard, och du kan byta app senare.
              </p>
              {pending && (
                <div className="flex justify-center">
                  <div className="rounded-2xl bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCodeSrc(pending.qr)}
                      alt="QR-kod för att koppla din autentiseringsapp till ditt konto"
                      width={176}
                      height={176}
                      className="h-44 w-44"
                    />
                  </div>
                </div>
              )}
              <details className="rounded-lg border bg-muted/40 px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Kan du inte skanna?
                </summary>
                <div className="mt-2 space-y-2 text-xs">
                  <p>
                    Välj <em>Ange nyckel manuellt</em> i appen, klistra in nyckeln nedan och välj
                    typen <em>Tidsbaserad</em> om appen frågar.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono">
                      {pending ? formatSecret(pending.secret) : ""}
                    </code>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => {
                        if (!pending) return;
                        void navigator.clipboard.writeText(pending.secret);
                        setCopied(true);
                        toast.success("Nyckeln är kopierad");
                      }}>
                      {copied ? "Kopierad" : "Kopiera"}
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    Nyckeln visas bara under aktiveringen. Behöver du den igen stänger du av
                    tvåstegsverifieringen och aktiverar på nytt.
                  </p>
                </div>
              </details>
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Innan du går vidare: koden finns bara i din telefon, och det finns inga
                reservkoder att skicka. Tappar du appen tar du själv bort faktorn i din
                Supabase-panel och loggar in med lösenordet som vanligt — hela vägen står i{" "}
                <em>docs/TVASTEGSVERIFIERING.md</em>, avsnittet{" "}
                <em>Tappat din autentiseringsapp?</em>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => void cancelEnroll()}>
                  Avbryt
                </Button>
                <Button type="button" onClick={() => { setStep(2); setError(null); }}>
                  Nästa
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); void confirmEnroll(); }}>
              <p className="text-sm">
                Appen visar nu en sexsiffrig kod för Debet &amp; Kredit. Koden byts var
                trettionde sekund. Skriv in den som står där just nu.
              </p>
              <MfaCodeInput id="mfa-enroll-code" label="Kod från appen" value={code}
                onChange={setCode} disabled={busy} autoFocus />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy}
                  onClick={() => { setStep(1); setError(null); }}>
                  Tillbaka
                </Button>
                <Button type="submit" disabled={busy || code.length !== 6}>
                  {busy ? "Kontrollerar…" : "Aktivera"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Avstängning */}
      <Dialog open={mode === "disable"}
        onOpenChange={(open) => { if (!open) { setMode(null); resetDialogState(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stäng av tvåstegsverifiering</DialogTitle>
            <DialogDescription>
              Ditt konto skyddas då av lösenordet ensamt.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void confirmDisable(); }}>
            <p className="text-sm">
              Du kan slå på tvåstegsverifieringen igen när du vill. Skriv in en kod från appen
              så vet vi att det är du som stänger av.
            </p>
            <MfaCodeInput id="mfa-disable-code" label="Kod från appen" value={code}
              onChange={setCode} disabled={busy} autoFocus />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy}
                onClick={() => { setMode(null); resetDialogState(); }}>
                Avbryt
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || code.length !== 6}>
                {busy ? "Stänger av…" : "Stäng av"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
