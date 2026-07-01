import { createClient } from "@/lib/supabase/server";
import { ArticleDialog } from "@/components/article-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function ArticlesPage() {
  const supabase = await createClient();
  const [{ data: articles }, { data: salesAccounts }] = await Promise.all([
    supabase.from("articles").select("*").eq("active", true).order("article_no"),
    supabase.from("accounts").select("number, name").gte("number", 3000).lte("number", 3999)
      .eq("active", true).eq("blocked", false).order("number"),
  ]);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Artiklar</h1>
        <ArticleDialog salesAccounts={salesAccounts ?? []} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Art.nr</TableHead>
            <TableHead>Benämning</TableHead>
            <TableHead>Enhet</TableHead>
            <TableHead className="text-right">Pris exkl. moms</TableHead>
            <TableHead>Moms</TableHead>
            <TableHead>Konto</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!articles?.length && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                Inga artiklar ännu. Lägg till det du säljer (t.ex. konsulttimme).
              </TableCell>
            </TableRow>
          )}
          {articles?.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono">{a.article_no}</TableCell>
              <TableCell>{a.name}</TableCell>
              <TableCell className="text-muted-foreground">{a.unit}</TableCell>
              <TableCell className="text-right tabular-nums">
                {Number(a.price).toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
              </TableCell>
              <TableCell>{Number(a.vat_rate)} %</TableCell>
              <TableCell className="font-mono text-muted-foreground">{a.sales_account}</TableCell>
              <TableCell>
                <ArticleDialog article={a} salesAccounts={salesAccounts ?? []} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
