/**
 * Inloggningens ram: varumärkespanelen till vänster, formuläret till höger.
 *
 * Kodsteget är en andra sida i samma inloggning, och en kund som just skrivit
 * sitt lösenord ska känna igen sig. Landar hon på en sida som ser ut som något
 * annat är den rimliga tolkningen att något gått fel — och det har det inte.
 *
 * OBS: /login har än så länge samma panel inlagd direkt i sin egen fil.
 * Texterna här är kopierade därifrån ord för ord, med flit — de två sidorna
 * ska se identiska ut. Att flytta /login till den här ramen är rätt städning,
 * men den hör inte till tvåstegsverifieringen: att skriva om inloggningssidan
 * i samma andetag som spärren skulle blanda ihop två ändringar som ska kunna
 * granskas var för sig.
 */
export function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-xl font-heading">
            &amp;
          </span>
          <span className="font-semibold text-sidebar-accent-foreground">
            Debet &amp; Kredit <span className="font-normal text-sidebar-foreground/70">Bokföring</span>
          </span>
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold text-sidebar-accent-foreground leading-snug">
            Hela firmans ekonomi.<br />Ett program. Öppen källkod.
          </h2>
          <ul className="space-y-1.5 text-sm text-sidebar-foreground/80">
            <li>✓ Fakturering med OCR och automatisk bokföring</li>
            <li>✓ Momsdeklaration och eSKD-fil på fem minuter</li>
            <li>✓ Bankkoppling med smart matchning</li>
            <li>✓ Årsbokslut, NE-bilaga och uttagssimulator</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          BAS 2026 · Bokföringslagen · SIE 4 · Byggd för enskild firma
        </p>
      </div>

      <div className="flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2.5 justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xl">
              &amp;
            </span>
            <span className="font-semibold">Debet &amp; Kredit</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
