"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { uploadToInbox, deleteInboxFile, getInboxFileUrl } from "@/lib/actions/inbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InboxUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex gap-2 items-center rounded border border-dashed p-4">
      <Input ref={inputRef} type="file" accept="image/*,.pdf" capture="environment"
        className="max-w-sm" multiple />
      <Button disabled={busy} onClick={async () => {
        const files = inputRef.current?.files;
        if (!files?.length) return;
        setBusy(true);
        for (const file of files) {
          const fd = new FormData();
          fd.set("file", file);
          const res = await uploadToInbox(fd);
          if (res.error) toast.error(`${file.name}: ${res.error}`);
        }
        setBusy(false);
        toast.success("Uppladdat till inkorgen");
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }}>
        {busy ? "Laddar upp…" : "Ladda upp"}
      </Button>
    </div>
  );
}

export function InboxItemActions({ attachmentId }: { attachmentId: string }) {
  const router = useRouter();
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={async () => {
        const res = await getInboxFileUrl(attachmentId);
        if (res.url) window.open(res.url, "_blank");
        else toast.error(res.error ?? "Kunde inte öppna filen.");
      }}>
        Visa
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/ai?underlag=${attachmentId}`}>✨ Tolka med AI</Link>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/verifikat/ny?underlag=${attachmentId}`}>Bokför manuellt</Link>
      </Button>
      <Button variant="ghost" size="sm" onClick={async () => {
        if (!confirm("Radera filen från inkorgen?")) return;
        const res = await deleteInboxFile(attachmentId);
        if (res.error) toast.error(res.error);
        else router.refresh();
      }}>
        ×
      </Button>
    </div>
  );
}
