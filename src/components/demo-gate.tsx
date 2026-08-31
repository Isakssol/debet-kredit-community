"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { enterDemo } from "@/lib/actions/demo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

export function DemoGate() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const enter = () =>
    startTransition(async () => {
      try { localStorage.setItem("demo_visitor", name); } catch { /* privat läge */ }
      const res = await enterDemo({ name, company });
      if (res?.error) toast.error(res.error);
    });

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="demo-name">Ditt namn</Label>
          <Input id="demo-name" value={name} placeholder="Anna Andersson"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enter(); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="demo-company">Företagsnamn</Label>
          <Input id="demo-company" value={company} placeholder="Anderssons Bygg"
            onChange={(e) => setCompany(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") enter(); }} />
        </div>
        <Button className="w-full h-11 rounded-xl text-base shadow-[0_6px_18px_rgba(234,88,12,0.3)]"
          onClick={enter} disabled={pending || !name.trim() || !company.trim()}>
          <Sparkles className="h-4 w-4 mr-2" />
          {pending ? "Startar demon…" : "Öppna demon"}
        </Button>
      </CardContent>
    </Card>
  );
}
