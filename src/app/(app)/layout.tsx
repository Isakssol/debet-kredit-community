import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { LogoutButton } from "@/components/logout-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <Link href="/" className="font-semibold text-lg">
            trimtech<span className="text-muted-foreground font-normal"> Bokföring</span>
          </Link>
        </div>
        <NavLinks />
        <div className="mt-auto p-4 border-t">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-6 max-w-6xl">{children}</main>
    </div>
  );
}
