import { createClient } from "@/lib/supabase/server";
import { InboxUpload, InboxItemActions } from "@/components/inbox-components";

export default async function InboxPage() {
  const supabase = await createClient();
  const { data: files } = await supabase.from("attachments")
    .select("id, file_name, mime_type, uploaded_at")
    .is("verification_id", null)
    .order("uploaded_at", { ascending: false });

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Underlagsinkorg</h1>
        <p className="text-sm text-muted-foreground">
          Ladda upp kvitton och fakturor nu — bokför när du har tid. Vid bokföringen kopplas
          underlaget automatiskt till verifikatet (7 års arkivering).
        </p>
      </div>

      <InboxUpload />

      <div className="space-y-2">
        {!files?.length && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Inkorgen är tom.
          </p>
        )}
        {files?.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded border p-3 text-sm">
            <div>
              <div className="font-medium">{f.file_name}</div>
              <div className="text-xs text-muted-foreground">
                Uppladdad {new Date(f.uploaded_at).toLocaleString("sv-SE")}
              </div>
            </div>
            <InboxItemActions attachmentId={f.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
