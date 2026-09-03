"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Search, Sparkles, CheckCheck, BookOpen, PlusCircle, Inbox, ListTree, Scale, LineChart,
  FileText, FilePlus, Users, Package, Truck, Car, Boxes, Kanban, FileSignature,
  Percent, Calculator, CalendarCheck, BarChart3, Settings, Landmark, Banknote,
  type LucideIcon,
} from "lucide-react";

const sections: {
  title: string;
  links: { href: string; label: string; icon: LucideIcon }[];
}[] = [
  {
    title: "",
    links: [
      { href: "/", label: "Översikt", icon: LayoutDashboard },
      { href: "/analys", label: "Analys", icon: LineChart },
      { href: "/ai", label: "AI-bokföring", icon: Sparkles },
      { href: "/godkann", label: "Att godkänna", icon: CheckCheck },
      { href: "/sok", label: "Sök", icon: Search },
    ],
  },
  {
    title: "Bokföring",
    links: [
      { href: "/verifikat", label: "Verifikat", icon: BookOpen },
      { href: "/verifikat/ny", label: "Ny verifikation", icon: PlusCircle },
      { href: "/underlag", label: "Underlagsinkorg", icon: Inbox },
      { href: "/avstamning", label: "Avstämning", icon: Scale },
      { href: "/kontoplan", label: "Kontoplan", icon: ListTree },
    ],
  },
  {
    title: "CRM",
    links: [
      { href: "/pipeline", label: "Pipeline", icon: Kanban },
      { href: "/offerter", label: "Offert & Order", icon: FileSignature },
    ],
  },
  {
    title: "Fakturering",
    links: [
      { href: "/fakturor", label: "Fakturor", icon: FileText },
      { href: "/fakturor/ny", label: "Ny faktura", icon: FilePlus },
      { href: "/kunder", label: "Kunder", icon: Users },
      { href: "/artiklar", label: "Artiklar", icon: Package },
    ],
  },
  {
    title: "Utgifter",
    links: [
      { href: "/bank", label: "Bank", icon: Landmark },
      { href: "/leverantorer", label: "Leverantörer", icon: Truck },
      { href: "/korjournal", label: "Körjournal", icon: Car },
      { href: "/anlaggningar", label: "Anläggningar", icon: Boxes },
    ],
  },
  {
    title: "Skatt & moms",
    links: [
      { href: "/moms", label: "Moms", icon: Percent },
      { href: "/skatt", label: "Skatt & eget uttag", icon: Calculator },
      { href: "/lon", label: "Lön", icon: Banknote },
      { href: "/arsavslut", label: "Årsavslut", icon: CalendarCheck },
    ],
  },
  {
    title: "Rapporter",
    links: [
      { href: "/rapporter", label: "Rapporter & export", icon: BarChart3 },
    ],
  },
  {
    title: "",
    links: [{ href: "/installningar", label: "Inställningar", icon: Settings }],
  },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
      {sections.map((section, i) => (
        <div key={i}>
          {section.title && (
            <div className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {section.title}
            </div>
          )}
          <div className="space-y-px">
            {section.links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] rounded-md transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}>
                  <Icon className={cn("h-4 w-4 shrink-0",
                    active ? "text-sidebar-primary" : "text-sidebar-foreground/50")} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
