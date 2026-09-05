/**
 * Rubriker och innehållsförteckning för Inställningar.
 *
 * Korten låg i en enda scroll utan indelning: företagets identitet, byråns
 * åtkomst, bokföringens ramar och engångsimporter om vartannat. Den som skulle
 * ändra momsperioden fick leta förbi SIE-importen.
 */

export type SettingsGroup = { id: string; title: string };

export function SettingsToc({ groups }: { groups: SettingsGroup[] }) {
  return (
    <nav aria-label="Innehåll" className="rounded-xl border bg-muted/30 p-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {groups.map((g) => (
          <li key={g.id}>
            <a href={`#${g.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
              {g.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SettingsSection({
  id, title, description, children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="border-b pb-1.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
