"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { attachFile } from "@/lib/actions/verifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AttachmentUpload({ verificationId }: { verificationId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await attachFile(verificationId, fd);
    setBusy(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Underlag uppladdat");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <Input ref={inputRef} type="file" accept="image/*,.pdf" className="max-w-xs" />
      <Button variant="outline" size="sm" onClick={handleUpload} disabled={busy}>
        {busy ? "Laddar upp…" : "Ladda upp"}
      </Button>
    </div>
  );
}
