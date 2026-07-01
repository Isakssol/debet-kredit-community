import { createClient } from "@/lib/supabase/server";
import { TripForm, BookMileageButton, DeleteTripButton } from "@/components/trip-components";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function TripsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: trips }, { data: rule }] = await Promise.all([
    supabase.from("trips").select("*").order("trip_date", { ascending: false }),
    supabase.from("rule_values").select("value").eq("key", "milersattning")
      .lte("valid_from", today).or(`valid_to.gte.${today},valid_to.is.null`)
      .order("valid_from", { ascending: false }).limit(1).single(),
  ]);

  const rate = Number(rule?.value ?? 25);
  const unbooked = (trips ?? []).filter((t) => !t.verification_id);
  const unbookedKm = unbooked.reduce((s, t) => s + Number(t.km), 0);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Körjournal</h1>
        <p className="text-sm text-muted-foreground">
          Underlag för skattefri milersättning ({rate} kr/mil 2026). Datum, resväg och syfte
          krävs vid Skatteverkets granskning.
        </p>
      </div>

      <TripForm />

      {unbooked.length > 0 && (
        <div className="flex items-center justify-between rounded border bg-muted/40 p-3 text-sm">
          <span>
            {unbooked.length} obokade resor · {(unbookedKm / 10).toFixed(1)} mil ·{" "}
            {((unbookedKm / 10) * rate).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr
          </span>
          <BookMileageButton />
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Resväg</TableHead>
            <TableHead>Syfte</TableHead>
            <TableHead className="text-right">Km</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!trips?.length && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Inga resor registrerade.
              </TableCell>
            </TableRow>
          )}
          {trips?.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.trip_date}</TableCell>
              <TableCell>{t.from_location} → {t.to_location}</TableCell>
              <TableCell className="text-muted-foreground">{t.purpose}</TableCell>
              <TableCell className="text-right tabular-nums">{Number(t.km)}</TableCell>
              <TableCell>
                <Badge variant={t.verification_id ? "default" : "outline"}>
                  {t.verification_id ? "Bokförd" : "Obokad"}
                </Badge>
              </TableCell>
              <TableCell>
                {!t.verification_id && <DeleteTripButton id={t.id} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
