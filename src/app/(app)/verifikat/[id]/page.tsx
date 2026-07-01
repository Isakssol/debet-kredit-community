import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AttachmentUpload } from "@/components/attachment-upload";
import { CorrectionDialog } from "@/components/correction-dialog";

export default async function VerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: v } = await supabase
    .from("verifications")
    .select(
      `id, number, verification_date, registered_at, description, counterparty, source,
       corrects_id, corrected_by_id,
       verification_series(code),
       verification_rows(row_no, account, debit, credit, note, accounts(name)),
       attachments(id, file_name, storage_path)`
    )
    .eq("id", id)
    .single();

  if (!v) notFound();

  const series = (v.verification_series as unknown as { code: string })?.code;
  const rows = (v.verification_rows as unknown as {
    row_no: number; account: number; debit: number; credit: number; note: string | null;
    accounts: { name: string };
  }[]).sort((a, b) => a.row_no - b.row_no);

  const linked = async (vid: string | null) => {
    if (!vid) return null;
    const { data } = await supabase
      .from("verifications")
      .select("id, number, verification_series(code)")
      .eq("id", vid)
      .single();
    return data;
  };
  const [corrects, correctedBy] = await Promise.all([linked(v.corrects_id), linked(v.corrected_by_id)]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-mono">
            {series}{v.number}
          </h1>
          <p className="text-muted-foreground">{v.description}</p>
        </div>
        {!v.corrected_by_id && (
          <CorrectionDialog
            verificationId={v.id}
            description={v.description}
            rows={rows.map((r) => ({
              account: r.account,
              debit: Number(r.debit),
              credit: Number(r.credit),
            }))}
          />
        )}
      </div>

      <div className="flex gap-2 flex-wrap text-sm">
        <Badge variant="outline">Händelsedatum: {v.verification_date}</Badge>
        <Badge variant="outline">
          Registrerad: {new Date(v.registered_at).toLocaleString("sv-SE")}
        </Badge>
        {v.counterparty && <Badge variant="outline">Motpart: {v.counterparty}</Badge>}
        {correctedBy && (
          <Badge variant="destructive">
            <Link href={`/verifikat/${correctedBy.id}`}>
              Rättad av {(correctedBy.verification_series as unknown as { code: string })?.code}
              {correctedBy.number}
            </Link>
          </Badge>
        )}
        {corrects && (
          <Badge variant="secondary">
            <Link href={`/verifikat/${corrects.id}`}>
              Rättar {(corrects.verification_series as unknown as { code: string })?.code}
              {corrects.number}
            </Link>
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Konto</TableHead>
                <TableHead />
                <TableHead className="text-right">Debet</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.row_no}>
                  <TableCell className="font-mono">{r.account}</TableCell>
                  <TableCell>
                    {r.accounts?.name}
                    {r.note && <span className="text-muted-foreground text-xs block">{r.note}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.debit) > 0 ? Number(r.debit).toLocaleString("sv-SE", { minimumFractionDigits: 2 }) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.credit) > 0 ? Number(r.credit).toLocaleString("sv-SE", { minimumFractionDigits: 2 }) : ""}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium border-t-2">
                <TableCell colSpan={2}>Summa</TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalDebit.toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalDebit.toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Underlag</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(v.attachments as { id: string; file_name: string }[])?.length ? (
            <ul className="text-sm space-y-1">
              {(v.attachments as { id: string; file_name: string }[]).map((a) => (
                <li key={a.id}>📎 {a.file_name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Inget underlag uppladdat — bifoga kvitto/faktura (arkiveras 7 år).
            </p>
          )}
          <AttachmentUpload verificationId={v.id} />
        </CardContent>
      </Card>
    </div>
  );
}
