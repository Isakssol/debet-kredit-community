import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav-links";
import { LogoutButton } from "@/components/logout-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { MobileNav } from "@/components/mobile-nav";
import { AppBrand } from "@/components/app-brand";
import { buildThemeCss } from "@/lib/theme";
import { logoSignedUrl } from "@/lib/branding/logo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings")
    .select("onboarded_at, company_name, theme_accent, theme_background, logo_path").eq("id", 1).single();
  if (settings && !settings.onboarded_at) redirect("/kom-igang");
  const companyName = settings?.company_name?.trim() || "Debet & Kredit";
  const themeCss = buildThemeCss(settings?.theme_accent, settings?.theme_background);
  // Bucketen "branding" är privat: logotypen visas via en signerad länk
  const logoUrl = await logoSignedUrl(supabase, settings?.logo_path);

  const isDemo = process.env.DEMO_MODE === "1";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {themeCss && <style>{themeCss}</style>}
      {isDemo && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-foreground text-background text-center text-[13px] py-2 px-4 print:hidden">
          Demoläge — utforska fritt! Datan är påhittad, delas av alla besökare och
          nollställs varje natt.{" "}
          <a href="https://github.com/Isakssol/debet-kredit" className="underline underline-offset-2"
            target="_blank" rel="noreferrer">
            Sätt upp din egen (gratis) →
          </a>
        </div>
      )}
      {/* Mobil toppmeny */}
      <MobileNav companyName={companyName} logoUrl={logoUrl} />
      {/* Desktop-sidomeny */}
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar text-sidebar-foreground flex-col print:hidden">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2.5">
            <AppBrand companyName={companyName} logoUrl={logoUrl} subtitle="Bokföring" />
          </Link>
        </div>
        <NavLinks />
        <div className="mt-auto p-3 border-t border-sidebar-border">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full">
        <AutoRefresh />
        {children}
      </main>
    </div>
  );
}
