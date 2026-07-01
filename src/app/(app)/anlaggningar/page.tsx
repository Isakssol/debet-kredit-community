import { createClient } from "@/lib/supabase/server";
import { AssetDialog, DepreciationRun, DisposeDialog } from "@/components/asset-components";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const fmt = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS: Record<string, string> = {
  active: "Aktiv", fully_depreciated: "Helt avskriven", sold: "Såld", scrapped: "Utrangerad",
};

export default async function AssetsPage() {
  const supabase = await createClient();
  const [{ data: assets }, { data: fy }, { data: rule }] = await Promise.all([
    supabase.from("assets").select("*").order("purchase_date"),
    supabase.from("fiscal_years").select("year").eq("status", "open")
      .order("year", { ascending: false }).limit(1).single(),
    supabase.from("rule_values").select("value").eq("key", "direktavdrag_inventarier")
      .order("valid_from", { ascending: false }).limit(1).single(),
  ]);

  const limit = Number(rule?.value ?? 29600);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Anläggningsregister</h1>
          <p className="text-sm text-muted-foreground">
            Inventarier över {limit.toLocaleString("sv-SE")} kr exkl. moms (halvt prisbasbelopp)
            och ≥ 3 års livslängd. Billigare inköp bokförs direkt på 5410 Förbrukningsinventarier.
          </p>
        </div>
        <AssetDialog />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tillgång</TableHead>
            <TableHead>Inköpt</TableHead>
            <TableHead>Konto</TableHead>
            <TableHead className="text-right">Anskaffning</TableHead>
            <TableHead className="text-right">Ack. avskr.</TableHead>
            <TableHead className="text-right">Bokfört värde</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!assets?.length && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Inga tillgångar registrerade.
              </TableCell>
            </TableRow>
          )}
          {assets?.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{a.name}</TableCell>
              <TableCell>{a.purchase_date}</TableCell>
              <TableCell className="font-mono">{a.account}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(Number(a.purchase_value))}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(Number(a.acc_depreciation))}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmt(Number(a.purchase_value) - Number(a.acc_depreciation))}
              </TableCell>
              <TableCell>
                <Badge variant={a.status === "active" ? "outline" : "secondary"}>
                  {STATUS[a.status]}
                </Badge>
              </TableCell>
              <TableCell>
                {(a.status === "active" || a.status === "fully_depreciated") && (
                  <DisposeDialog assetId={a.id} name={a.name} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Årets avskrivningar</CardTitle>
          <CardDescription>
            Räkenskapsenlig avskrivning: programmet väljer automatiskt det förmånligaste av
            30-regeln (30 % av bokfört värde) och 20-regeln (rak 20 %/år) och bokför i serie E
            per {fy?.year}-12-31.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DepreciationRun year={fy?.year ?? 2026} />
        </CardContent>
      </Card>
    </div>
  );
}
