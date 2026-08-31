import { createClient } from "@/lib/supabase/server";
import { resolveAiConfig } from "@/lib/ai/provider";
import { ApprovalQueue } from "@/components/approval-queue";

export default async function ApprovalPage() {
  const supabase = await createClient();
  const [{ data: items }, { data: settings }, { count: unmatchedTx }, { count: inboxFiles }] =
    await Promise.all([
      supabase.from("suggestion_queue")
        .select("id, source, suggestion, created_at, bank_transactions(booking_date, description, amount), attachments(file_name)")
        .eq("status", "pending").order("created_at"),
      supabase.from("settings").select("ai_api_key, ai_model").eq("id", 1).single(),
      supabase.from("bank_transactions").select("id", { count: "exact", head: true })
        .eq("status", "unmatched"),
      supabase.from("attachments").select("id", { count: "exact", head: true })
        .is("verification_id", null),
    ]);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Att godkänna</h1>
        <p className="text-sm text-muted-foreground">
          AI:n föreslår konteringar för banktransaktioner utan regelträff och för
          filer i underlagsinkorgen — du godkänner. Inget bokförs utan ditt klick.
        </p>
      </div>
      <ApprovalQueue
        aiReady={!!resolveAiConfig(settings?.ai_api_key, settings?.ai_model)}
        unmatchedTx={unmatchedTx ?? 0}
        inboxFiles={inboxFiles ?? 0}
        items={(items ?? []).map((i) => ({
          id: i.id,
          source: i.source as "bank_tx" | "inbox_attachment",
          suggestion: i.suggestion as never,
          sourceLabel: i.source === "bank_tx"
            ? `Bank ${(i.bank_transactions as unknown as { booking_date: string } | null)?.booking_date ?? ""}: ${(i.bank_transactions as unknown as { description: string } | null)?.description ?? ""}`
            : `Underlag: ${(i.attachments as unknown as { file_name: string } | null)?.file_name ?? ""}`,
        }))}
      />
    </div>
  );
}
