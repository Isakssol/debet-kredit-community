"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MessageCircleQuestion, Send, Trash2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Hur mycket moms är jag skyldig just nu?",
  "Hur går det för företaget i år, månad för månad?",
  "Vilka kundfakturor är obetalda?",
  "Kan jag dra av lunch med en kund?",
];

export function AdvisorChat({ initialMessages }: { initialMessages: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setStatus(null);
    setMessages((m) => [...m, { role: "user", content: message }]);

    try {
      const res = await fetch("/api/radgivare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        toast.error(await res.text().catch(() => "Något gick fel."));
        setBusy(false);
        return;
      }

      let assistant = "";
      const appendAssistant = (chunk: string) => {
        assistant += (assistant ? "\n\n" : "") + chunk;
        const snapshot = assistant;
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "assistant") {
            return [...m.slice(0, -1), { role: "assistant", content: snapshot }];
          }
          return [...m, { role: "assistant", content: snapshot }];
        });
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(6)) as { type: string; text?: string };
            if (data.type === "text" && data.text) { setStatus(null); appendAssistant(data.text); }
            else if (data.type === "status" && data.text) setStatus(data.text);
            else if (data.type === "error" && data.text) { setStatus(null); toast.error(data.text); }
            else if (data.type === "done") setStatus(null);
          } catch { /* ofullständig chunk — ignorera */ }
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function clearChat() {
    if (!confirm("Rensa hela konversationen?")) return;
    const res = await fetch("/api/radgivare", { method: "DELETE" });
    if (res.ok) setMessages([]);
    else toast.error("Kunde inte rensa.");
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="max-h-[55vh] min-h-[200px] overflow-y-auto space-y-3 pr-1">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground space-y-3 py-4">
              <p className="flex items-center gap-2">
                <MessageCircleQuestion className="h-4 w-4 text-primary" />
                Ställ en fråga — eller prova något av detta:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)}
                    className="rounded-full border px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap max-w-[85%]",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted rounded-bl-sm")}>
                {m.content}
              </div>
            </div>
          ))}
          {status && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-2.5 text-sm bg-muted text-muted-foreground animate-pulse">
                {status}
              </div>
            </div>
          )}
          {busy && !status && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-2.5 text-sm bg-muted text-muted-foreground animate-pulse">
                Tänker…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 items-end border-t pt-3">
          <Textarea
            rows={2}
            placeholder="Fråga rådgivaren…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            className="resize-none"
          />
          <div className="flex flex-col gap-1.5">
            <Button size="icon" onClick={() => send()} disabled={busy || !input.trim()} title="Skicka">
              <Send className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={clearChat} disabled={busy}
              title="Rensa konversationen">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Rådgivaren kan läsa din bokföring men aldrig ändra den. Svaren är vägledning,
          inte auktoriserad rådgivning — dubbelkolla viktiga beslut.
        </p>
      </CardContent>
    </Card>
  );
}
