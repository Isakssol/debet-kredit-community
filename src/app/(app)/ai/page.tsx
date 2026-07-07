import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai/provider";
import { AiBookkeeper } from "@/components/ai-bookkeeper";
import { AiBatchImport } from "@/components/ai-batch-import";

export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{ underlag?: string }>;
}) {
  const { underlag } = await searchParams;
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("accounts")
    .select("number, name").eq("active", true).eq("blocked", false).order("number");

  let inboxFileName: string | null = null;
  if (underlag) {
    const { data: att } = await supabase.from("attachments")
      .select("file_name").eq("id", underlag).is("verification_id", null).single();
    inboxFileName = att?.file_name ?? null;
  }

  const config = aiConfigured();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">AI-bokföring</h1>
        <p className="text-sm text-muted-foreground">
          Fota kvittot eller beskriv inköpet — AI:n läser underlaget, föreslår kontering
          enligt BAS 2026 och du bokför med ett klick. Underlaget arkiveras automatiskt
          på verifikatet.
        </p>
      </div>
      <AiBookkeeper
        configured={!!config}
        providerName={config?.provider === "anthropic" ? "Claude" : config?.provider === "openai" ? "OpenAI" : null}
        accounts={(accounts ?? []).map((a) => ({ number: a.number, name: a.name }))}
        inboxAttachmentId={underlag && inboxFileName ? underlag : null}
        inboxFileName={inboxFileName}
      />
      <AiBatchImport configured={!!config} />
    </div>
  );
}
