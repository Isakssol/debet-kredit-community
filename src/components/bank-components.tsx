"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  importBankCsv, getBankList, connectBank, finalizeBankConnection,
  syncBankTransactions, bookTxAsCustomerPayment, bookTxAsSupplierPayment,
  bookTxWithRows, matchTxToVerification, ignoreTx,
} from "@/lib/actions/bank";
import type { MatchSuggestion, OpenInvoice, OpenSupplierInvoice } from "@/lib/bank/matching";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Working } from "@/components/ui/working";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Bankkoppling (PSD2 via Enable Banking) ---------- */

export function BankConnect({
  configured,
  callbackCode,
  connections,
}: {
  configured: boolean;
  callbackCode: string | null;
  connections: {
    id: string; institutionName: string; status: string;
    iban: string | null; lastSynced: string | null; consentExpires: string | null;
  }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [banks, setBanks] = useState<{ id: string; name: string; maxConsentSeconds?: number }[] | null>(null);
  const [selectedBank, setSelectedBank] = useState("");
  const [psuType, setPsuType] = useState<"personal" | "business">("personal");

  async function loadBanks() {
    setBusy(true);
    const res = await getBankList();
    setBusy(false);
    if (res.error) toast.error(res.error);
    else setBanks(res.banks ?? []);
  }

  async function connect() {
    const bank = banks?.find((b) => b.id === selectedBank);
    if (!bank) return;
    setBusy(true);
    const res = await connectBank(bank.id, bank.maxConsentSeconds ?? 0, window.location.origin, psuType);
    setBusy(false);
    if (res.error) toast.error(res.error);
    else if (res.link) window.location.href = res.link; // BankID hos banken
  }

  async function finalize() {
    if (!callbackCode) return;
    setBusy(true);
    const res = await finalizeBankConnection(callbackCode);
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(`Bankkonto kopplat — ${"imported" in res ? res.imported : 0} transaktioner hämtade`);
      router.replace("/bank");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bankkoppling (PSD2)</CardTitle>
        <CardDescription>
          Hämtar transaktioner automatiskt via Enable Banking — du godkänner med BankID
          hos din bank, samtycket gäller upp till 180 dagar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {callbackCode && (
          <div className="rounded border bg-accent p-2.5 flex items-center justify-between">
            <span>BankID godkänt — slutför kopplingen:</span>
            <Button size="sm" onClick={finalize} disabled={busy}>
              {busy ? <Working inline label="Hämtar konton…" /> : "Slutför"}
            </Button>
          </div>
        )}

        {connections.filter((c) => c.status === "linked" || c.status === "expired").map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded border p-2.5">
            <div>
              <div className="font-medium">{c.institutionName}</div>
              <div className="text-xs text-muted-foreground">
                {c.iban ?? ""} · {c.lastSynced
                  ? `Synkad ${new Date(c.lastSynced).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`
                  : "Aldrig synkad"}
              </div>
            </div>
            {c.status === "expired" ? (
              <Badge variant="destructive">Samtycke utgånget</Badge>
            ) : (
              <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
                setBusy(true);
                const res = await syncBankTransactions(c.id);
                setBusy(false);
                if (res.error) toast.error(res.error);
                else {
                  toast.success(`${res.imported} nya transaktioner hämtade`);
                  router.refresh();
                }
              }}>
                Synka
              </Button>
            )}
          </div>
        ))}

        {!configured ? (
          <div className="text-muted-foreground text-xs leading-relaxed">
            <p className="font-medium text-foreground text-sm mb-1">Kom igång (gratis för egna konton):</p>
            1. Skapa konto på <strong>enablebanking.com</strong> → Control Panel → Applications<br />
            2. Generera RSA-nyckelpar (<code>openssl genrsa -out privat.pem 4096</code> +{" "}
            <code>openssl req -new -x509 -key privat.pem -out cert.pem -days 3650</code>),
            ladda upp <code>cert.pem</code> och aktivera appen (production, redirect-URL:{" "}
            <code>{typeof window !== "undefined" ? window.location.origin : ""}/bank</code>)<br />
            3. Lägg in i <code>.env.local</code>: <code>ENABLE_BANKING_APP_ID</code> och{" "}
            <code>ENABLE_BANKING_PRIVATE_KEY</code> (PEM-innehållet)<br />
            4. Starta om appen — sedan kopplar du Nordea/Swedbank/SEB m.fl. med BankID här.
          </div>
        ) : banks === null ? (
          <Button variant="outline" onClick={loadBanks} disabled={busy}>
            {busy ? <Working inline label="Hämtar banker…" /> : "+ Koppla bankkonto"}
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Select value={selectedBank} onValueChange={setSelectedBank}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Välj din bank…" /></SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={connect} disabled={busy || !selectedBank}>
                Anslut med BankID
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={psuType === "business"}
                onChange={(e) => setPsuType(e.target.checked ? "business" : "personal")} />
              Företagskonto (enskild firma-konton är oftast tekniskt privatkonton — lämna urbockad om osäker)
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- CSV-uppladdning ---------- */

export function BankCsvUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">CSV från internetbanken</CardTitle>
        <CardDescription>
          Exportera kontoutdrag som CSV (Swedbank, Nordea, SEB, Handelsbanken m.fl.) —
          formatet känns igen automatiskt och dubbletter hoppas över.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2 items-center">
        <Input ref={inputRef} type="file" accept=".csv,.txt" className="max-w-xs" />
        <Button variant="outline" disabled={busy} onClick={async () => {
          const file = inputRef.current?.files?.[0];
          if (!file) return toast.error("Välj en CSV-fil.");
          setBusy(true);
          const fd = new FormData();
          fd.set("file", file);
          const res = await importBankCsv(fd);
          setBusy(false);
          if (res.error) return toast.error(res.error);
          toast.success(`${res.bank}: ${res.imported} importerade, ${res.duplicates} dubbletter`);
          if (inputRef.current) inputRef.current.value = "";
          router.refresh();
        }}>
          {busy ? <Working inline label="Importerar…" /> : "Importera"}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------- Transaktionsrad med förslag ---------- */

const QUICK_EVENT_ROWS: Record<string, (amount: number) => { rows: { account: number; debit: number; credit: number }[]; description: string }> = {
  fskatt: (a) => ({
    description: "Debiterad preliminärskatt (F-skatt)",
    rows: [{ account: 2012, debit: -a, credit: 0 }, { account: 1930, debit: 0, credit: -a }],
  }),
  bankavgift: (a) => ({
    description: "Bankkostnader",
    rows: [{ account: 6570, debit: -a, credit: 0 }, { account: 1930, debit: 0, credit: -a }],
  }),
  uttag: (a) => ({
    description: "Eget uttag",
    rows: [{ account: 2013, debit: -a, credit: 0 }, { account: 1930, debit: 0, credit: -a }],
  }),
  insattning: (a) => ({
    description: "Egen insättning",
    rows: [{ account: 1930, debit: a, credit: 0 }, { account: 2018, debit: 0, credit: a }],
  }),
};

export function BankTxRow({
  tx,
  suggestion,
  openInvoices,
  openSupplierInvoices,
}: {
  tx: { id: string; bookingDate: string; amount: number; description: string };
  suggestion: MatchSuggestion;
  openInvoices: OpenInvoice[];
  openSupplierInvoices: OpenSupplierInvoice[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [manualInvoice, setManualInvoice] = useState("");

  async function run(fn: () => Promise<{ error?: string }>, okMsg: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success(okMsg);
      router.refresh();
    }
  }

  const primaryAction = () => {
    switch (suggestion.kind) {
      case "customer_payment":
        return (
          <Button size="sm" disabled={busy}
            onClick={() => run(() => bookTxAsCustomerPayment(tx.id, suggestion.invoiceId), "Inbetalning bokförd")}>
            Bokför inbetalning
          </Button>
        );
      case "supplier_payment":
        return (
          <Button size="sm" disabled={busy}
            onClick={() => run(() => bookTxAsSupplierPayment(tx.id, suggestion.supplierInvoiceId), "Betalning bokförd")}>
            Bokför betalning
          </Button>
        );
      case "already_booked":
        return (
          <Button size="sm" variant="outline" disabled={busy}
            onClick={() => run(() => matchTxToVerification(tx.id, suggestion.verificationId), "Avprickad")}>
            Pricka av
          </Button>
        );
      case "quick_event": {
        const builder = QUICK_EVENT_ROWS[suggestion.event];
        if (!builder) return null;
        return (
          <Button size="sm" disabled={busy} onClick={() => {
            const { rows, description } = builder(tx.amount);
            run(() => bookTxWithRows(tx.id, rows, description), "Bokförd");
          }}>
            Bokför
          </Button>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{tx.description}</div>
            <div className="text-xs text-muted-foreground">
              {tx.bookingDate} ·{" "}
              <span className={suggestion.kind === "unknown" ? "" : "text-foreground"}>
                {suggestion.label}
              </span>
              {"confidence" in suggestion && suggestion.confidence === "medium" && " (förslag)"}
            </div>
          </div>
          <div className={`text-sm font-semibold tabular-nums shrink-0 ${tx.amount > 0 ? "text-green-700" : ""}`}>
            {fmt(tx.amount)} kr
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {primaryAction()}
          {suggestion.kind === "unknown" && tx.amount > 0 && openInvoices.length > 0 && (
            <div className="flex gap-1.5 items-center">
              <Select value={manualInvoice} onValueChange={setManualInvoice}>
                <SelectTrigger className="h-8 text-xs w-56">
                  <SelectValue placeholder="Koppla till kundfaktura…" />
                </SelectTrigger>
                <SelectContent>
                  {openInvoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.invoiceNo} — {i.customerName} ({fmt(i.remaining)} kr)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {manualInvoice && (
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => run(() => bookTxAsCustomerPayment(tx.id, manualInvoice), "Inbetalning bokförd")}>
                  Bokför
                </Button>
              )}
            </div>
          )}
          {suggestion.kind === "unknown" && tx.amount < 0 && openSupplierInvoices.length > 0 && (
            <div className="flex gap-1.5 items-center">
              <Select value={manualInvoice} onValueChange={setManualInvoice}>
                <SelectTrigger className="h-8 text-xs w-56">
                  <SelectValue placeholder="Koppla till leverantörsfaktura…" />
                </SelectTrigger>
                <SelectContent>
                  {openSupplierInvoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.supplierName} ({fmt(i.remaining)} kr)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {manualInvoice && (
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => run(() => bookTxAsSupplierPayment(tx.id, manualInvoice), "Betalning bokförd")}>
                  Bokför
                </Button>
              )}
            </div>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link href="/verifikat/ny">Bokför manuellt</Link>
          </Button>
          <Button size="sm" variant="ghost" disabled={busy}
            onClick={() => run(() => ignoreTx(tx.id), "Ignorerad")}>
            Ignorera
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
