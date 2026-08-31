"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissChecklist } from "@/lib/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  href: string;
  hint: string;
};

/**
 * "Kom igång"-checklistan följer verklig data och försvinner när allt är
 * klart — men varje steg kan också klickas bort, och hela listan kan döljas.
 */
export function GettingStarted({ items }: { items: ChecklistItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remaining = items.filter((i) => !i.done).length;
  if (items.length === 0 || remaining === 0) return null;
  const progress = Math.round(((items.length - remaining) / items.length) * 100);

  const dismiss = (step?: string) =>
    startTransition(async () => {
      await dismissChecklist(step ? { step } : {});
      router.refresh();
    });

  return (
    <Card className="border-primary/30 bg-accent/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Kom igång</CardTitle>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {items.length - remaining} av {items.length} klara
            </span>
            <Button variant="ghost" size="sm" disabled={pending}
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => dismiss()} title="Dölj checklistan permanent">
              Dölj
            </Button>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {items.map((item) => (
          <div key={item.id}
            className="group flex items-start gap-2 py-1 rounded-lg hover:bg-accent px-1 -mx-1">
            <span className="mt-px">{item.done ? "✅" : "⬜"}</span>
            <Link href={item.href} className="flex-1 min-w-0">
              <span className={item.done ? "line-through text-muted-foreground" : "font-medium"}>
                {item.label}
              </span>
              {!item.done && (
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              )}
            </Link>
            {!item.done && (
              <button type="button" disabled={pending}
                onClick={() => dismiss(item.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 text-muted-foreground hover:text-foreground"
                title="Klicka bort steget">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
