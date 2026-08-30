"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_KINDS } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const KIND_BADGE: Record<string, string> = {
  Act: "badge-green", Regulation: "badge-green", Policy: "badge-amber", Circular: "badge-amber",
};

export default function DocumentsClient({ initial, regulators }: { initial: any[]; regulators: any[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [file, setFile] = useState<File | null>(null);
  const [regulatorId, setRegulatorId] = useState("");
  const [docKind, setDocKind] = useState("Act");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function upload() {
    if (!file || !regulatorId) return;
    setUploading(true);
    setResult(null);
    try {
      // Upload straight from the browser to Supabase Storage rather than
      // through our own API route: Vercel's Serverless Functions cap request
      // bodies at ~4.5MB, which silently dropped larger regulator PDFs
      // (the request never even reached the function). The API route now
      // just gets the storage path plus metadata and reads the file back
      // itself, so uploads of any size make it through.
      const regulator = regulators.find((r) => r.id === regulatorId);
      const safeRegulator = (regulator?.name || "misc").replace(/[^a-zA-Z0-9]+/g, "-");
      const storagePath = `${safeRegulator}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("regulatory-library").upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        setResult(`Error: upload failed: ${upErr.message}`);
        return;
      }

      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          fileName: file.name,
          fileType: file.type,
          regulatorId,
          docKind,
          title,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult(
          `Uploaded. ${json.hasText ? `Indexed ${json.chunkCount} chunks.` : "No usable text layer found."} ${json.obligationCount ? `${json.obligationCount} candidate obligations sent for review.` : ""} ${json.note ?? ""}`
        );
        setFile(null); setTitle("");
        router.refresh();
      } else {
        setResult(`Error: ${json.error}`);
      }
    } catch (e: any) {
      // Previously a network-level failure here (e.g. a request the platform
      // rejected outright) left the button stuck on "Uploading…" forever
      // with no feedback, since nothing caught it.
      setResult(`Error: ${e?.message || "Upload failed — check your connection and try again."}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="card p-4 grid gap-3 sm:grid-cols-2">
        <select className="input" value={regulatorId} onChange={(e) => setRegulatorId(e.target.value)}>
          <option value="">Regulator…</option>
          {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className="input" value={docKind} onChange={(e) => setDocKind(e.target.value)}>
          {DOC_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <input className="input sm:col-span-2" placeholder="Title (optional — defaults to file name)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input sm:col-span-2" type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn btn-primary sm:col-span-2" disabled={!file || !regulatorId || uploading} onClick={upload}>
          {uploading ? "Uploading & processing…" : "Upload & process"}
        </button>
        {result && <p className="sm:col-span-2 text-sm" style={{ color: "var(--color-text-muted)" }}>{result}</p>}
      </div>

      <div className="mt-6 overflow-x-auto card">
        <table className="data">
          <thead><tr><th>Title</th><th>Regulator</th><th>Kind</th><th>Status</th><th>Index</th></tr></thead>
          <tbody>
            {initial.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{d.regulators?.name ?? "—"}</td>
                <td><span className={`badge ${KIND_BADGE[d.doc_kind] ?? "badge-gray"}`}>{d.doc_kind}</span></td>
                <td>{d.status}</td>
                <td>{d.index_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
