"use client";

import { useState } from "react";
import { FileText, Eye } from "lucide-react";
import { toast } from "sonner";
import { getInboxFileUrl } from "@/lib/actions/inbox";
import { Button } from "@/components/ui/button";

/** Klickbar underlagslista — öppnar filen via signerad URL (privat lagring) */
export function AttachmentList({
  attachments,
}: {
  attachments: { id: string; file_name: string }[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!attachments.length) return null;

  return (
    <ul className="text-sm space-y-1">
      {attachments.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5">
          <span className="flex items-center gap-2 truncate">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{a.file_name}</span>
          </span>
          <Button variant="ghost" size="sm" disabled={busyId === a.id}
            onClick={async () => {
              setBusyId(a.id);
              const res = await getInboxFileUrl(a.id);
              setBusyId(null);
              if (res.url) window.open(res.url, "_blank");
              else toast.error(res.error ?? "Kunde inte öppna underlaget.");
            }}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Visa
          </Button>
        </li>
      ))}
    </ul>
  );
}
