import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ChecklistItem = {
  label: string;
  done: boolean;
  href: string;
  hint: string;
};

/** Fortnox-mönstret: "Kom igång"-checklista som följer verklig data och försvinner när allt är klart */
export function GettingStarted({ items }: { items: ChecklistItem[] }) {
  const remaining = items.filter((i) => !i.done).length;
  if (remaining === 0) return null;
  const progress = Math.round(((items.length - remaining) / items.length) * 100);

  return (
    <Card className="border-primary/30 bg-accent/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Kom igång</CardTitle>
          <span className="text-xs text-muted-foreground">
            {items.length - remaining} av {items.length} klara
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {items.map((item) => (
          <Link key={item.label} href={item.href}
            className="flex items-start gap-2 py-1 rounded hover:bg-accent px-1 -mx-1">
            <span className="mt-px">{item.done ? "✅" : "⬜"}</span>
            <span>
              <span className={item.done ? "line-through text-muted-foreground" : "font-medium"}>
                {item.label}
              </span>
              {!item.done && (
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              )}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
