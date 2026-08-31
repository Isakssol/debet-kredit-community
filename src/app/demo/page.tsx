import { redirect } from "next/navigation";
import { DemoGate } from "@/components/demo-gate";

/** Öppen demo-entré: namn + företag → inloggad i demomiljön med ett klick */
export default function DemoPage() {
  if (process.env.DEMO_MODE !== "1") redirect("/login");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-3xl">
            &amp;
          </div>
          <h1 className="text-3xl font-semibold">Testa Debet &amp; Kredit</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Utforska hela programmet med ett påhittat exempelföretag — bokföring,
            AI-rådgivare, offerter, pipeline, moms. Inget konto behövs, inget
            att installera.
          </p>
        </div>
        <DemoGate />
        <p className="text-center text-xs text-muted-foreground">
          Demodatan är påhittad, delas av alla besökare och nollställs varje natt.
          Ditt namn används bara för att vi ska kunna säga hej.
        </p>
      </div>
    </div>
  );
}
