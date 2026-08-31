import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (settings?.onboarded_at) redirect("/");

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-6">
      <OnboardingWizard
        defaults={{
          company_name: settings?.company_name ?? "Min firma",
          org_number: settings?.org_number ?? "",
          address: settings?.address ?? "",
          postal_code: settings?.postal_code ?? "",
          city: settings?.city ?? "",
          email: settings?.email ?? "",
          phone: settings?.phone ?? "",
          bankgiro: settings?.bankgiro ?? "",
          vat_period: settings?.vat_period ?? "kvartal",
        }}
      />
    </div>
  );
}
