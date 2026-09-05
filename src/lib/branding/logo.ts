/**
 * Företagets egen logotyp: validering, uppladdning och läsning.
 *
 * Samma regler på båda sidor av tråden — klienten kontrollerar för att kunna
 * säga ifrån direkt, servern kontrollerar för att det är där det räknas.
 * Bucketen "branding" är privat (som kvittoarkivet), så visning sker via
 * signerade länkar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeStorageName } from "@/lib/storage-key";

export const LOGO_BUCKET = "branding";
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];
export const LOGO_EXTENSIONS = ["png", "jpg", "jpeg", "svg"];

/** Bara det uppladdningen behöver — så valideringen går att testa utan File. */
export type LogoFileInfo = { name: string; size: number; type: string };

/** Returnerar ett felmeddelande att visa, eller null när filen duger. */
export function validateLogo(file: LogoFileInfo | null | undefined): string | null {
  if (!file || file.size === 0) return "Filen är tom.";
  if (file.size > LOGO_MAX_BYTES) return "Logotypen är för stor (max 1 MB).";
  const type = (file.type || "").toLowerCase();
  const ext = (file.name || "").toLowerCase().split(".").pop() ?? "";
  const extOk = LOGO_EXTENSIONS.includes(ext);
  if (type && !LOGO_TYPES.includes(type) && !extOk) {
    return "Logotypen måste vara PNG, JPG eller SVG.";
  }
  if (!type && !extOk) return "Okänd filtyp. Spara logotypen som PNG, JPG eller SVG.";
  return null;
}

/** true för filformat som faktura-PDF:en kan bädda in (SVG kan den inte). */
export function isPdfEmbeddableLogo(path: string | null | undefined): boolean {
  const ext = (path ?? "").toLowerCase().split(".").pop() ?? "";
  return ["png", "jpg", "jpeg"].includes(ext);
}

export async function uploadLogo(
  supabase: SupabaseClient,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const invalid = validateLogo(file);
  if (invalid) return { error: invalid };
  // Tidsstämpel i nyckeln: en ny logotyp får aldrig krocka med den gamla,
  // och signerade länkar som redan är ute pekar kvar på rätt bild.
  const path = `logo/${Date.now()}-${safeStorageName(file.name, "logotyp")}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) {
    const msg = /bucket/i.test(error.message)
      ? `Lagringsplatsen (bucket "${LOGO_BUCKET}") saknas i din Supabase. Kör migrationerna. (${error.message})`
      : `Logotypen kunde inte sparas: ${error.message}`;
    return { error: msg };
  }
  return { path };
}

/** Signerad visningslänk. Null när logotyp saknas eller länken inte kan skapas. */
export async function logoSignedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresIn = 60 * 60 * 8,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Logotypen som data-URL för faktura-PDF:en. @react-pdf/renderer bäddar bara
 * in raster, så SVG hoppas över och fakturan visar företagsnamnet som förut.
 */
export async function logoDataUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path || !isPdfEmbeddableLogo(path)) return null;
  const { data, error } = await supabase.storage.from(LOGO_BUCKET).download(path);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return null;
  const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
