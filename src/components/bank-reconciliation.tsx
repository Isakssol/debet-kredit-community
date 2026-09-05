"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Bankavstämning: jämför bokfört saldo mot kontoutdraget (manuellt tills bankkoppling finns) */
export function BankReconciliation({ bookBalance }: { bookBalance: number }) {
  const [statement, setStatement] = useState("");
  const statementNum = parseFloat(statement.replace(",", "."));
  const diff = isNaN(statementNum) ? null : Math.round((statementNum - bookBalance) * 100) / 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bankavstämning (1910–1940)</CardTitle>
        <CardDescription>
          Bokfört saldo: <strong className="tabular-nums">{fmt(bookBalance)} kr</strong> —
          jämför mot saldot på ditt kontoutdrag.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div className="space-y-1 max-w-56">
          <Label>Saldo enligt kontoutdraget (kr)</Label>
          <Input type="number" step="0.01" value={statement}
            onChange={(e) => setStatement(e.target.value)} placeholder="0,00" />
        </div>
        {diff !== null && (
          <div className={`pb-2 text-sm font-medium ${Math.abs(diff) < 0.005 ? "text-green-700" : "text-destructive"}`}>
            {Math.abs(diff) < 0.005
              ? "Stämmer på öret ✓"
              : `Differens ${fmt(diff)} kr — leta efter obokförda händelser eller dubbletter`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
