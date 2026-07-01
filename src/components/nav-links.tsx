"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sections: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "",
    links: [
      { href: "/", label: "Översikt" },
      { href: "/sok", label: "Sök" },
    ],
  },
  {
    title: "Bokföring",
    links: [
      { href: "/verifikat", label: "Verifikat" },
      { href: "/verifikat/ny", label: "Ny verifikation" },
      { href: "/underlag", label: "Underlagsinkorg" },
      { href: "/kontoplan", label: "Kontoplan" },
    ],
  },
  {
    title: "Fakturering",
    links: [
      { href: "/fakturor", label: "Fakturor" },
      { href: "/fakturor/ny", label: "Ny faktura" },
      { href: "/kunder", label: "Kunder" },
      { href: "/artiklar", label: "Artiklar" },
    ],
  },
  {
    title: "Utgifter",
    links: [
      { href: "/leverantorer", label: "Leverantörer" },
      { href: "/korjournal", label: "Körjournal" },
      { href: "/anlaggningar", label: "Anläggningar" },
    ],
  },
  {
    title: "Skatt & moms",
    links: [
      { href: "/moms", label: "Moms" },
      { href: "/skatt", label: "Skatt & eget uttag" },
      { href: "/arsavslut", label: "Årsavslut" },
    ],
  },
  {
    title: "Rapporter",
    links: [
      { href: "/rapporter", label: "Rapporter & export" },
      { href: "/rapporter/resultat", label: "Resultatrapport" },
      { href: "/rapporter/balans", label: "Balansrapport" },
      { href: "/rapporter/huvudbok", label: "Huvudbok" },
    ],
  },
  {
    title: "",
    links: [{ href: "/installningar", label: "Inställningar" }],
  },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto p-3 space-y-4">
      {sections.map((section, i) => (
        <div key={i}>
          {section.title && (
            <div className="px-2 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
            </div>
          )}
          <div className="space-y-0.5">
            {section.links.map((link) => (
              <Link key={link.href} href={link.href}
                className={cn(
                  "block px-2 py-1.5 text-sm rounded hover:bg-accent",
                  pathname === link.href && "bg-accent font-medium"
                )}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
