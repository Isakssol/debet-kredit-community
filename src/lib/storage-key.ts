/**
 * Supabase Storage tillåter bara ett begränsat teckenförråd i objektnycklar —
 * "Faktura för maj.pdf" (å/ö, mellanslag) ger 400 vid uppladdning. Filnamnet
 * som visas för användaren sparas separat; nyckeln i lagringen görs
 * ASCII-säker här.
 */
export function safeStorageName(name: string, fallback = "fil"): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")     // ta bort diakritiska tecken (å → a, ö → o)
    .replace(/[^A-Za-z0-9._-]+/g, "_")   // allt annat (mellanslag, /, parenteser) → _
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return (ascii || fallback).slice(0, 120);
}
