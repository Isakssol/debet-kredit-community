"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addTrip, bookMileage, deleteTrip } from "@/lib/actions/trips";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TripForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    trip_date: new Date().toISOString().slice(0, 10),
    from_location: "", to_location: "", purpose: "", km: "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Card>
      <CardContent className="pt-4 grid grid-cols-[130px_1fr_1fr_1fr_90px_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label>Datum</Label>
          <Input type="date" value={f.trip_date} onChange={(e) => set("trip_date", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Från</Label>
          <Input value={f.from_location} onChange={(e) => set("from_location", e.target.value)}
            placeholder="Västerås" />
        </div>
        <div className="space-y-1">
          <Label>Till</Label>
          <Input value={f.to_location} onChange={(e) => set("to_location", e.target.value)}
            placeholder="Stockholm t/r" />
        </div>
        <div className="space-y-1">
          <Label>Syfte</Label>
          <Input value={f.purpose} onChange={(e) => set("purpose", e.target.value)}
            placeholder="Kundmöte Haus Media" />
        </div>
        <div className="space-y-1">
          <Label>Km</Label>
          <Input type="number" value={f.km} onChange={(e) => set("km", e.target.value)} />
        </div>
        <Button disabled={busy} onClick={async () => {
          setBusy(true);
          const res = await addTrip({ ...f, km: parseFloat(f.km) || 0 });
          setBusy(false);
          if (res.error) toast.error(res.error);
          else {
            setF((p) => ({ ...p, from_location: "", to_location: "", purpose: "", km: "" }));
            router.refresh();
          }
        }}>
          Lägg till
        </Button>
      </CardContent>
    </Card>
  );
}

export function BookMileageButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" disabled={busy} onClick={async () => {
      setBusy(true);
      const res = await bookMileage();
      setBusy(false);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Milersättning bokförd: ${res.amount?.toLocaleString("sv-SE")} kr`);
        router.refresh();
      }
    }}>
      {busy ? "Bokför…" : "Bokför milersättning"}
    </Button>
  );
}

export function DeleteTripButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onClick={async () => {
      const res = await deleteTrip(id);
      if (res.error) toast.error(res.error);
      else router.refresh();
    }}>
      ×
    </Button>
  );
}
