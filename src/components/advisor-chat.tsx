"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircleQuestion, Send, Trash2, Sparkles } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  { icon: "💰", text: "Hur mycket moms är jag skyldig just nu?" },
  { icon: "📈", text: "Hur går det för företaget i år, månad för månad?" },
  { icon: "🧾", text: "Vilka kundfakturor är obetalda?" },
  { icon: "🍽️", text: "Kan jag dra av lunch med en kund?" },
];

export function AdvisorChat({ initialMessages }: { initialMessages: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Autoscrolla bara när användaren redan är nära botten — annars lämnas läsläget ifred
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setStatus(null);
    stickToBottom.current = true;
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
    <div className="flex flex-col rounded-3xl bg-card shadow-[0_2px_16px_rgba(120,90,60,0.08)] border overflow-hidden h-[calc(100dvh-13.5rem)] min-h-[420px]">
      {/* Meddelanden */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <MessageCircleQuestion className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-lg font-heading">Vad undrar du?</div>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Rådgivaren läser din bokföring innan den svarar — fråga om moms, avdrag eller hur det går.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button key={s.text} type="button" onClick={() => send(s.text)}
                  className="flex items-center gap-3 rounded-2xl border bg-background px-4 py-3 text-left text-sm hover:border-primary/50 hover:shadow-[0_4px_14px_rgba(120,90,60,0.1)] transition-all">
                  <span className="text-lg">{s.icon}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground max-w-[85%] sm:max-w-[70%] shadow-[0_4px_12px_rgba(234,88,12,0.25)]">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3 items-start">
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="rounded-3xl rounded-tl-lg bg-muted/70 px-4 py-3 text-sm max-w-[90%] sm:max-w-[80%]">
                <Markdown text={m.content} />
              </div>
            </div>
          )
        )}

        {(status || (busy && messages[messages.length - 1]?.role === "user")) && (
          <div className="flex gap-3 items-start">
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            </div>
            <div className="rounded-3xl rounded-tl-lg bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:120ms]"></span>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:240ms]"></span>
                </span>
                {status ?? "Tänker…"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-background/60 px-3 sm:px-4 py-3">
        <div className="flex items-end gap-2">
          <Textarea
            rows={1}
            placeholder="Fråga rådgivaren…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            className="resize-none min-h-11 max-h-32 rounded-2xl bg-card"
          />
          <Button size="icon" onClick={() => send()} disabled={busy || !input.trim()}
            className="rounded-2xl h-11 w-11 shrink-0 shadow-[0_4px_12px_rgba(234,88,12,0.3)]" title="Skicka">
            <Send className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={clearChat} disabled={busy}
            className="rounded-2xl h-11 w-11 shrink-0 text-muted-foreground" title="Rensa konversationen">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 px-1">
          Rådgivaren kan läsa din bokföring men aldrig ändra den. Svaren är vägledning —
          dubbelkolla viktiga beslut.
        </p>
      </div>
    </div>
  );
}
