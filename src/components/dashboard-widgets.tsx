"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveDashboardWidgets } from "@/lib/actions/settings";
import type { WidgetId, WidgetMetrics } from "@/lib/widgets";
import { formatSEK } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BarChart3, CalendarRange, Receipt, Landmark, TrendingUp, HandCoins,
  Percent, FileWarning, Wallet, PieChart, BookOpen,
  Settings2, X, Plus, Check, type LucideIcon,
} from "lucide-react";

/** Utseende per widget: etikett, ikon och färgton (literala klasser för Tailwind) */
const WIDGET_META: Record<WidgetId, { label: string; icon: LucideIcon; chip: string }> = {
  revenue_year: { label: "Omsättning i år", icon: BarChart3, chip: "bg-primary/12 text-primary" },
  revenue_month: { label: "Omsättning denna månad", icon: CalendarRange, chip: "bg-amber-500/15 text-amber-600" },
  avg_order: { label: "Snittorder", icon: Receipt, chip: "bg-violet-500/12 text-violet-600" },
  bank_cash: { label: "Bank & kassa", icon: Landmark, chip: "bg-sky-500/12 text-sky-600" },
  result_year: { label: "Resultat i år", icon: TrendingUp, chip: "bg-emerald-500/12 text-emerald-600" },
  own_withdrawals: { label: "Egna uttag i år", icon: HandCoins, chip: "bg-rose-500/12 text-rose-600" },
  vat_debt: { label: "Momsskuld just nu", icon: Percent, chip: "bg-indigo-500/12 text-indigo-600" },
  unpaid_invoices: { label: "Obetalda kundfakturor", icon: FileWarning, chip: "bg-red-500/12 text-red-600" },
  costs_year: { label: "Kostnader i år", icon: Wallet, chip: "bg-stone-500/12 text-stone-600" },
  gross_margin: { label: "Bruttomarginal", icon: PieChart, chip: "bg-teal-500/12 text-teal-600" },
  verifikat_count: { label: "Verifikat i år", icon: BookOpen, chip: "bg-fuchsia-500/12 text-fuchsia-600" },
};

export function DashboardWidgets({
  widgets: initial,
  metrics,
}: {
  widgets: WidgetId[];
  metrics: WidgetMetrics;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [widgets, setWidgets] = useState<WidgetId[]>(initial);
  const available = (Object.keys(WIDGET_META) as WidgetId[])
    .filter((id) => !widgets.includes(id) && metrics[id]);

  const persist = (next: WidgetId[]) => {
    setWidgets(next);
    startTransition(async () => {
      const res = await saveDashboardWidgets(next);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">Nyckeltal</div>
        <Button variant="ghost" size="sm" className="text-muted-foreground h-7"
          onClick={() => setEditing((e) => !e)}>
          {editing ? <><Check className="h-3.5 w-3.5 mr-1" /> Klar</> : <><Settings2 className="h-3.5 w-3.5 mr-1" /> Anpassa</>}
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map((id) => {
          const meta = WIDGET_META[id];
          const m = metrics[id];
          if (!meta || !m) return null;
          const value = m.text ?? formatSEK(m.ore ?? 0);
          const negative = m.text === undefined && (m.ore ?? 0) < 0;
          const inner = (
            <div className={cn(
              "relative rounded-[1.375rem] bg-card p-5 shadow-[0_2px_14px_oklch(0.4_0.04_60/0.07)] transition-all",
              !editing && m.href && "hover:shadow-[0_6px_22px_oklch(0.4_0.04_60/0.12)] hover:-translate-y-0.5",
              editing && "animate-pulse-none ring-1 ring-dashed ring-border"
            )}>
              {editing && widgets.length > 1 && (
                <button type="button" disabled={pending}
                  onClick={(e) => { e.preventDefault(); persist(widgets.filter((w) => w !== id)); }}
                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-md"
                  title="Ta bort widget">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-muted-foreground">{meta.label}</div>
                  <div className={cn(
                    "font-heading text-[1.7rem] font-bold tracking-tight tabular-nums mt-1.5 leading-none",
                    negative && "text-destructive"
                  )}>
                    {value}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 truncate">{m.sub}</div>
                </div>
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", meta.chip)}>
                  <meta.icon className="h-4.5 w-4.5" />
                </span>
              </div>
            </div>
          );
          return !editing && m.href
            ? <Link key={id} href={m.href}>{inner}</Link>
            : <div key={id}>{inner}</div>;
        })}

        {editing && available.length > 0 && (
          <div className="rounded-[1.375rem] border-2 border-dashed border-border p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Lägg till widget
            </div>
            <div className="flex flex-wrap gap-1.5">
              {available.map((id) => {
                const meta = WIDGET_META[id];
                return (
                  <button key={id} type="button" disabled={pending}
                    onClick={() => persist([...widgets, id])}
                    className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs hover:border-primary/50 hover:shadow-sm transition-all">
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", meta.chip)}>
                      <meta.icon className="h-3 w-3" />
                    </span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
