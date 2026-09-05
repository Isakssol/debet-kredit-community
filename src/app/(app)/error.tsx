"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { recordClientError } from "@/lib/client-errors";

/**
 * Fångar oväntade fel i appens sidor så användaren får en läsbar sida med
 * "Försök igen" i stället för en tom vit skärm. Felet loggas i konsolen
 * (och hos Vercel) för felsökning, och läggs i klientfelbufferten så att det
 * följer med om användaren väljer att skicka en felrapport.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    recordClientError({
      kind: "boundary",
      message: `${error.name}: ${error.message}`,
      source: error.digest ? `digest ${error.digest}` : "",
    });
  }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-lg space-y-4 rounded-lg border bg-card p-8 text-center">
      <h1 className="text-xl font-semibold">Något gick fel</h1>
      <p className="text-sm text-muted-foreground">
        Sidan kunde inte visas. Det kan bero på en tillfällig störning i anslutningen till databasen.
        Dina bokförda uppgifter påverkas inte.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Felkod: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Försök igen</Button>
        <Button variant="outline" onClick={() => { window.location.href = "/"; }}>Till översikten</Button>
      </div>
    </div>
  );
}
