"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Trash2, MessageCircle } from "lucide-react";

type Conversation = { id: string; title: string; updatedAt: string };

function relativeDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return "Idag";
  if (diff === 1) return "Igår";
  if (diff < 7) return `${diff} dagar sedan`;
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

/** Historikpanel: gamla konversationer, ny konversation, ta bort */
export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: Conversation[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remove = (id: string) => {
    if (!confirm("Ta bort konversationen permanent?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/radgivare?id=${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Kunde inte ta bort."); return; }
      if (id === activeId) router.push("/radgivare");
      router.refresh();
    });
  };

  return (
    <div className="rounded-3xl bg-card border shadow-[0_2px_14px_oklch(0.4_0.04_60/0.07)] p-3 lg:sticky lg:top-6 max-h-[calc(100dvh-13.5rem)] flex flex-col">
      <Button asChild size="sm" className="w-full rounded-xl mb-2">
        <Link href="/radgivare"><Plus className="h-4 w-4 mr-1" /> Ny konversation</Link>
      </Button>
      <div className="overflow-y-auto space-y-0.5 -mx-1 px-1">
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Inga konversationer ännu.
          </p>
        )}
        {conversations.map((conv) => (
          <div key={conv.id}
            className={cn(
              "group flex items-center gap-1 rounded-xl transition-colors",
              conv.id === activeId ? "bg-accent" : "hover:bg-muted/70"
            )}>
            <Link href={`/radgivare?c=${conv.id}`} className="flex-1 min-w-0 px-2.5 py-2">
              <span className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium leading-tight">
                    {conv.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {relativeDay(conv.updatedAt)}
                  </span>
                </span>
              </span>
            </Link>
            <button type="button" disabled={pending} onClick={() => remove(conv.id)}
              className="mr-1.5 rounded-md p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-background transition-colors lg:opacity-0 lg:group-hover:opacity-100"
              title="Ta bort konversationen">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
