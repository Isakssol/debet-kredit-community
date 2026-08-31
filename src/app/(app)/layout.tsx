import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav-links";
import { LogoutButton } from "@/components/logout-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { MobileNav } from "@/components/mobile-nav";
import { buildThemeCss } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings")
    .select("onboarded_at, company_name, theme_accent, theme_background").eq("id", 1).single();
  if (settings && !settings.onboarded_at) redirect("/kom-igang");
  const companyName = settings?.company_name?.trim() || "Debet & Kredit";
  const themeCss = buildThemeCss(settings?.theme_accent, settings?.theme_background);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {themeCss && <style>{themeCss}</style>}
      {/* Mobil toppmeny */}
      <MobileNav companyName={companyName} />
      {/* Desktop-sidomeny */}
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar text-sidebar-foreground flex-col print:hidden">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg font-heading">
              {companyName.charAt(0).toLowerCase()}
            </span>
            <span className="font-semibold text-[15px] text-sidebar-accent-foreground">
              {companyName}
              <span className="block text-[11px] font-normal leading-tight text-sidebar-foreground/70">
                Bokföring
              </span>
            </span>
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
