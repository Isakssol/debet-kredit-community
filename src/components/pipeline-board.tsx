"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveDeal, moveDeal, deleteDeal } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, CalendarClock, Trash2, ChevronLeft, ChevronRight, Pencil } from "lucide-react";

type Stage = "lead" | "contacted" | "quoted" | "won" | "lost";

export type Deal = {
  id: string;
  title: string;
  contact: string | null;
  customerName: string | null;
  customerId: string | null;
  value: number | null;
  stage: Stage;
  nextAction: string | null;
  nextActionAt: string | null;
  notes: string | null;
};

const STAGES: { id: Stage; label: string; accent: string; dot: string }[] = [
  { id: "lead", label: "Lead", accent: "border-t-sky-400", dot: "bg-sky-400" },
  { id: "contacted", label: "Kontaktad", accent: "border-t-amber-400", dot: "bg-amber-400" },
  { id: "quoted", label: "Offert skickad", accent: "border-t-violet-400", dot: "bg-violet-400" },
  { id: "won", label: "Vunnen", accent: "border-t-emerald-500", dot: "bg-emerald-500" },
  { id: "lost", label: "Förlorad", accent: "border-t-stone-300", dot: "bg-stone-300" },
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
const fmtKr = (n: number) => Math.round(n).toLocaleString("sv-SE") + " kr";
const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  id: undefined as string | undefined, title: "", customerId: "", contact: "",
  value: "", stage: "lead" as Stage, nextAction: "", nextActionAt: "", notes: "",
};

export function PipelineBoard({
  deals,
  customers,
}: {
  deals: Deal[];
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragged, setDragged] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const move = (id: string, stage: Stage) =>
    startTransition(async () => {
      const res = await moveDeal(id, stage);
      if (res.error) toast.error(res.error);
      router.refresh();
    });

  const submit = () =>
    startTransition(async () => {
      const res = await saveDeal({
        id: form.id,
        title: form.title,
        customerId: form.customerId || null,
        contact: form.contact || undefined,
        value: form.value ? parseFloat(form.value) : null,
        stage: form.stage,
        nextAction: form.nextAction || undefined,
        nextActionAt: form.nextActionAt || null,
        notes: form.notes || undefined,
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success(form.id ? "Affären uppdaterad" : "Affär skapad");
      setOpen(false);
      setForm(EMPTY);
      router.refresh();
    });

  const edit = (deal: Deal) => {
    setForm({
      id: deal.id, title: deal.title, customerId: deal.customerId ?? "",
      contact: deal.contact ?? "", value: deal.value?.toString() ?? "",
      stage: deal.stage, nextAction: deal.nextAction ?? "",
      nextActionAt: deal.nextActionAt ?? "", notes: deal.notes ?? "",
    });
    setOpen(true);
  };

  const remove = (id: string) => {
    if (!confirm("Ta bort affären?")) return;
    startTransition(async () => {
      await deleteDeal(id);
      setOpen(false);
      router.refresh();
    });
  };

  const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.id === s);

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(EMPTY); }}>
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Ny affär</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Redigera affär" : "Ny affär"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Titel *</Label>
              <Input value={form.title} placeholder="T.ex. Steg 1-optimering, Volvo V60"
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kund (om upplagd)</Label>
                <select className={selectClass} value={form.customerId}
                  onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
                  <option value="">— Ingen än —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kontakt (namn/tel)</Label>
                <Input value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Värde (kr exkl. moms)</Label>
                <Input type="number" value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Steg</Label>
                <select className={selectClass} value={form.stage}
                  onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as Stage }))}>
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nästa åtgärd</Label>
                <Input value={form.nextAction} placeholder="Ring och följ upp"
                  onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Datum för åtgärden</Label>
                <Input type="date" value={form.nextActionAt}
                  onChange={(e) => setForm((f) => ({ ...f, nextActionAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Anteckningar</Label>
              <Textarea rows={3} value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-between">
              <Button onClick={submit} disabled={pending || !form.title.trim()}>
                {pending ? "Sparar…" : "Spara"}
              </Button>
              {form.id && (
                <Button variant="ghost" className="text-destructive" disabled={pending}
                  onClick={() => remove(form.id!)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kanban */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
        {STAGES.map((stage) => {
          const items = deals.filter((d) => d.stage === stage.id);
          const total = items.reduce((s, d) => s + (d.value ?? 0), 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setDragOver(stage.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                if (dragged) move(dragged, stage.id);
                setDragged(null);
              }}
              className={cn(
                "rounded-2xl bg-muted/40 border-t-4 p-2.5 min-h-40 transition-colors",
                stage.accent,
                dragOver === stage.id && "bg-accent ring-2 ring-primary/30"
              )}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span className={cn("h-2 w-2 rounded-full", stage.dot)} />
                  {stage.label}
                  <span className="text-muted-foreground font-normal">({items.length})</span>
                </span>
                {total > 0 && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">{fmtKr(total)}</span>
                )}
              </div>
              <div className="space-y-2">
                {items.map((deal) => {
                  const overdue = deal.nextActionAt && deal.nextActionAt <= today();
                  const idx = stageIndex(deal.stage);
                  return (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => setDragged(deal.id)}
                      onDragEnd={() => setDragged(null)}
                      className={cn(
                        "group rounded-xl bg-card p-3 shadow-[0_1px_6px_oklch(0.4_0.04_60/0.08)] cursor-grab active:cursor-grabbing transition-all hover:shadow-[0_4px_14px_oklch(0.4_0.04_60/0.13)] hover:-translate-y-0.5",
                        dragged === deal.id && "opacity-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="text-[13px] font-medium leading-snug">{deal.title}</div>
                        <button type="button" onClick={() => edit(deal)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                          title="Redigera">
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {deal.customerName ?? deal.contact ?? "—"}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[12px] font-semibold tabular-nums">
                          {deal.value !== null ? fmtKr(deal.value) : ""}
                        </span>
                        {deal.nextActionAt && (
                          <span className={cn(
                            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
                            overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                          )}>
                            <CalendarClock className="h-2.5 w-2.5" />
                            {deal.nextActionAt.slice(5)}
                          </span>
                        )}
                      </div>
                      {/* Mobil: flytta med pilar (drag funkar inte med touch) */}
                      <div className="flex gap-1 mt-2 lg:hidden">
                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0 || pending}
                          onClick={() => move(deal.id, STAGES[idx - 1].id)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          disabled={idx === STAGES.length - 1 || pending}
                          onClick={() => move(deal.id, STAGES[idx + 1].id)}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground">
                    Dra hit en affär
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
