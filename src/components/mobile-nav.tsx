"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { NavLinks } from "@/components/nav-links";
import { AppBrand } from "@/components/app-brand";
import { LogoutButton } from "@/components/logout-button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

/** Mobil topprad med hamburgermeny — sidomenyn i en Sheet */
export function MobileNav({ companyName, logoUrl }: {
  companyName: string;
  logoUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Stäng menyn vid navigering
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 bg-sidebar border-b border-sidebar-border px-4 py-3 print:hidden">
      <Link href="/" className="flex items-center gap-2.5">
        <AppBrand companyName={companyName} logoUrl={logoUrl} />
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Öppna menyn">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-sidebar text-sidebar-foreground p-0 flex flex-col">
          <SheetTitle className="px-4 pt-4 pb-2 text-sidebar-accent-foreground text-[15px]">
            {companyName}
          </SheetTitle>
          <div className="flex-1 overflow-y-auto">
            <NavLinks />
          </div>
          <div className="p-3 border-t border-sidebar-border">
            <LogoutButton />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
