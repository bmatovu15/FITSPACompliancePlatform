"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function VaultClient({ memberId, initialFiles }: { memberId: string; initialFiles: any[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  async function open(path: string) {
    const { data } = await supabase.storage.from("member-vault").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${memberId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("member-vault").upload(path, file);
    if (!error) {
      await supabase.from("vault_docs").insert({
        member_id: memberId, vault: "company", name: file.name, storage_path: path, file_name: file.name, status: "Indexed",
      });
    }
    setUploading(false);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <label className="btn btn-primary inline-flex cursor-pointer">
        {uploading ? "Uploading…" : "Upload a document"}
        <input type="file" className="hidden" onChange={upload} disabled={uploading} />
      </label>
      <div className="mt-4 space-y-2">
        {initialFiles.length === 0 && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No documents uploaded yet.</p>}
        {initialFiles.map((f) => (
          <div key={f.id} className="card flex items-center justify-between p-3">
            <span className="text-sm">{f.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => open(f.storage_path)}>
              Open
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
