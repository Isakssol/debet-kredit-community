import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { LogoutButton } from "@/components/logout-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg">
              t
            </span>
            <span className="font-semibold text-[15px] text-white">
              trimtech
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
      <main className="flex-1 p-6 max-w-6xl">{children}</main>
    </div>
  );
}
