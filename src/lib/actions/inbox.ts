"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Ladda upp underlag till inkorgen (bokförs senare) */
export async function uploadToInbox(formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) return { error: "Ingen fil." };
  const supabase = await createClient();
  const path = `inkorg/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("underlag")
    .upload(path, file, { contentType: file.type });
  if (upErr) return { error: upErr.message };
  const { error } = await supabase.from("attachments").insert({
    verification_id: null,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
  });
  if (error) return { error: error.message };
  revalidatePath("/underlag");
  return { ok: true };
}

/** Koppla inkorgsunderlag till ett bokfört verifikat */
export async function linkAttachment(attachmentId: string, verificationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("attachments")
    .update({ verification_id: verificationId })
    .eq("id", attachmentId).is("verification_id", null);
  if (error) return { error: error.message };
  revalidatePath("/underlag");
  return { ok: true };
}

export async function deleteInboxFile(attachmentId: string) {
  const supabase = await createClient();
  const { data: att } = await supabase.from("attachments")
    .select("storage_path, verification_id").eq("id", attachmentId).single();
  if (!att) return { error: "Filen finns inte." };
  if (att.verification_id) return { error: "Filen är kopplad till ett verifikat och får inte raderas." };
  await supabase.storage.from("underlag").remove([att.storage_path]);
  const { error } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (error) return { error: error.message };
  revalidatePath("/underlag");
  return { ok: true };
}

export async function getInboxFileUrl(attachmentId: string) {
  const supabase = await createClient();
  const { data: att } = await supabase.from("attachments")
    .select("storage_path").eq("id", attachmentId).single();
  if (!att) return { error: "Filen finns inte." };
  const { data } = await supabase.storage.from("underlag")
    .createSignedUrl(att.storage_path, 3600);
  return { url: data?.signedUrl };
}
