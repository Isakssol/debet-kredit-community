import { createClient } from "@/lib/supabase/server";
import { resolveAiConfig } from "@/lib/ai/provider";
import { AdvisorChat } from "@/components/advisor-chat";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdvisorPage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: history }] = await Promise.all([
    supabase.from("settings").select("ai_api_key, ai_model").eq("id", 1).single(),
    supabase.from("advisor_messages").select("role, content")
      .order("created_at", { ascending: true }).limit(100),
  ]);
  const config = resolveAiConfig(settings?.ai_api_key, settings?.ai_model);
  const ready = !!config && config.provider === "anthropic";

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rådgivaren</h1>
        <p className="text-sm text-muted-foreground">
          Fråga om din bokföring, moms och avdrag — rådgivaren slår själv upp saldon,
          verifikat och fakturor innan den svarar. Den kan inte bokföra: förslag
          godkänner du som vanligt under AI-bokföring eller Ny verifikation.
        </p>
      </div>
      {ready ? (
        <AdvisorChat
          initialMessages={(history ?? []).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))}
        />
      ) : (
        <Card>
          <CardContent className="py-6 text-sm space-y-2">
            <p className="font-medium">Rådgivaren behöver en Anthropic-nyckel (sk-ant-…)</p>
            <p className="text-muted-foreground">
              Hämta en på <strong>console.anthropic.com</strong> och klistra in den under{" "}
              <strong>Inställningar → Bolagstyp &amp; AI-bokföraren</strong>. Rådgivaren
              använder verktyg för att läsa din bokföring, vilket kräver Claude.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
