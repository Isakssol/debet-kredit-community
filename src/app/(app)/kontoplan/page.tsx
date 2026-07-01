import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const CLASS_NAMES: Record<number, string> = {
  1: "Tillgångar",
  2: "Eget kapital och skulder",
  3: "Intäkter",
  4: "Inköp av varor och material",
  5: "Övriga externa kostnader",
  6: "Övriga externa kostnader",
  7: "Personal och avskrivningar",
  8: "Finansiella poster och resultat",
};

export default async function ChartOfAccountsPage() {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("number, name, class, vat_code, default_vat_rate, ne_field, blocked, description")
    .eq("active", true)
    .order("number");

  const grouped = new Map<number, NonNullable<typeof accounts>>();
  for (const a of accounts ?? []) {
    const cls = a.class!;
    if (!grouped.has(cls)) grouped.set(cls, []);
    grouped.get(cls)!.push(a);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Kontoplan</h1>
        <p className="text-sm text-muted-foreground">
          BAS 2026-urval för enskild firma (tjänsteföretag). {accounts?.length ?? 0} aktiva konton.
        </p>
      </div>
      {[...grouped.entries()].map(([cls, list]) => (
        <div key={cls}>
          <h2 className="font-medium mb-2">
            Klass {cls} — {CLASS_NAMES[cls]}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Konto</TableHead>
                <TableHead>Namn</TableHead>
                <TableHead className="w-24">Moms</TableHead>
                <TableHead className="w-20">NE-ruta</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.number}>
                  <TableCell className="font-mono">{a.number}</TableCell>
                  <TableCell>
                    {a.name}
                    {a.description && (
                      <span className="block text-xs text-muted-foreground">{a.description}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {a.default_vat_rate != null ? `${Number(a.default_vat_rate)} %` : ""}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{a.ne_field}</TableCell>
                  <TableCell>
                    {a.blocked && <Badge variant="secondary">Systemkonto</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
