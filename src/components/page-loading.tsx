import { Working } from "@/components/ui/working";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Väntläge vid sidnavigering. Läggs som `loading.tsx` bredvid de sidor som
 * räknar mycket innan de kan rendera (analys, rapporter, körjournal,
 * inställningar, bytesguiden) — alla har `maxDuration = 300`.
 *
 * Utan den står den gamla sidan kvar helt orörd medan den nya hämtas, och
 * ingenting säger att klicket gick fram. Rubriken skrivs ut direkt så att
 * användaren ser att rätt sida är på väg.
 */
export function PageLoading({
  title,
  label = "Hämtar sidan…",
  hint,
  cards = 3,
}: {
  title: string;
  label?: string;
  hint?: string;
  cards?: number;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <Working label={label} hint={hint} />
      <div className="space-y-4">
        {Array.from({ length: cards }, (_, i) => (
          <Card key={i} aria-hidden="true">
            <CardContent className="space-y-2.5 py-5">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-muted/70" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
