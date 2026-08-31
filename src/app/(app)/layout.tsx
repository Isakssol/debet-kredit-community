import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav-links";
import { LogoutButton } from "@/components/logout-button";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings")
    .select("onboarded_at, company_name").eq("id", 1).single();
  if (settings && !settings.onboarded_at) redirect("/kom-igang");
  const companyName = settings?.company_name?.trim() || "Firmabok";

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg">
              {companyName.charAt(0).toLowerCase()}
            </span>
            <span className="font-semibold text-[15px] text-white">
              {companyName}
              <span className="block text-[11px] font-normal leading-tight text-sidebar-foreground/60">
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
      <main className="flex-1 p-6 max-w-6xl">
        <AutoRefresh />
        {children}
      </main>
    </div>
  );
}
