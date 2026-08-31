import { createClient } from "@/lib/supabase/server";
import { PipelineBoard } from "@/components/pipeline-board";

export default async function PipelinePage() {
  const supabase = await createClient();
  const [{ data: deals }, { data: customers }] = await Promise.all([
    supabase.from("deals")
      .select("id, title, contact, value, stage, next_action, next_action_at, notes, customer_id, quote_id, customers(name)")
      .order("updated_at", { ascending: false }).limit(300),
    supabase.from("customers").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Dina affärsmöjligheter från lead till vunnen — dra korten mellan stegen.
          Nästa åtgärd dyker upp i Att göra på översikten.
        </p>
      </div>
      <PipelineBoard
        deals={(deals ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          contact: d.contact,
          customerName: (d.customers as unknown as { name: string } | null)?.name ?? null,
          customerId: d.customer_id,
          value: d.value !== null ? Number(d.value) : null,
          stage: d.stage as never,
          nextAction: d.next_action,
          nextActionAt: d.next_action_at,
          notes: d.notes,
        }))}
        customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
