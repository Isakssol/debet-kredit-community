/**
 * Varumärkesblocket överst i menyn. Finns företagets egen logotyp visas den,
 * annars faller allt tillbaka på initialbrickan och företagsnamnet, precis
 * som innan logotypstödet fanns.
 */
export function AppBrand({
  companyName,
  logoUrl,
  subtitle,
}: {
  companyName: string;
  logoUrl?: string | null;
  subtitle?: string;
}) {
  if (logoUrl) {
    return (
      /* Signerad Supabase-länk som byts vid varje uppladdning: vanlig img i
         stället för next/image, som kräver konfigurerad fjärrdomän. */
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt={companyName}
        className="h-9 max-w-[10.5rem] object-contain object-left"
      />
    );
  }
  return (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg font-heading">
        {companyName.charAt(0).toLowerCase()}
      </span>
      <span className="font-semibold text-[15px] text-sidebar-accent-foreground">
        {companyName}
        {subtitle && (
          <span className="block text-[11px] font-normal leading-tight text-sidebar-foreground/70">
            {subtitle}
          </span>
        )}
      </span>
    </>
  );
}
