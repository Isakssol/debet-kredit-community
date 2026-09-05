/**
 * De två små formateringarna aktiveringsdialogen behöver. Rena, och därför
 * prövbara — vilket är hela skälet till att de inte ligger i komponenten.
 */

/**
 * `enroll()` lämnar QR-koden som SVG. Supabase har levererat den både som en
 * färdig data-URL och som rå SVG-källa beroende på version, och skillnaden
 * syns inte i typen — båda är `string`. Läggs rå SVG rakt i en `src` visas
 * ingenting alls, och en QR-kod som inte syns är en aktivering som inte går
 * att slutföra. Därför avgörs det här, en gång, i stället för att gissas.
 */
export function qrCodeSrc(qrCode: string): string {
  const value = qrCode.trim();
  if (!value) return "";
  if (/^data:/i.test(value)) return value;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(value)}`;
}

/**
 * Nyckeln som skrivs av för hand när kameran inte kan användas — till exempel
 * när autentiseringsappen sitter på samma dator som skärmen. Base32 i en enda
 * lång rad tappar man bort sig i vid tredje tecknet, så den grupperas fyra och
 * fyra. Grupperingen är kosmetisk: appar och Supabase struntar i mellanslag.
 */
export function formatSecret(secret: string): string {
  const clean = secret.replace(/\s+/g, "").toUpperCase();
  return (clean.match(/.{1,4}/g) ?? []).join(" ");
}
