"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton({ label = "Skriv ut / spara som PDF" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer className="h-3.5 w-3.5 mr-1.5" />
      {label}
    </Button>
  );
}
