"use client";

import { useState } from "react";
import { DOC_KINDS } from "@/lib/types";
import { Msg, muted, useDb } from "./ui";

export interface DocRow { id: string; title: string; doc_kind: string; audience: string; index_status: string | null; programme_id: string | null }

const AUDIENCES = [
  { v: "public", l: "Everyone (visitors and members)" },
  { v: "members", l: "Signed-in members only" },
  { v: "staff", l: "FITSPA staff only" },
];

export default function DocumentsTab({ programmeId, regulatorId, regulatorName, docs }: { programmeId: string; regulatorId: string; regulatorName: string; docs: DocRow[] }) {
  const { supabase, exec, msg, busy } = useDb();
  const [file, setFile] = useState<File | null>(null);
  const [docKind, setDocKind] = useState("Act");
  const [audience, setAudience] = useState("public");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const safe = (regulatorName || "misc").replace(/[^a-zA-Z0-9]+/g, "-");
      const storagePath = `${safe}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("regulatory-library").upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
      if (error) { setResult(`Error: upload failed: ${error.message}`); return; }
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type, regulatorId, docKind, title, audience, programmeId }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult(`Uploaded. ${json.hasText ? `Indexed ${json.chunkCount} chunks, so the assistant can answer from it.` : "No usable text layer found, so the assistant cannot read it yet."}`);
        setFile(null);
        setTitle("");
        location.reload();
      } else setResult(`Error: ${json.error}`);
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="text-sm" style={muted}>
        Documents uploaded here belong to {regulatorName || "this regulator"} and this programme. Each one is indexed so the AI assistant can answer from it. Choose who may see it: everyone, signed-in members, or staff only.
        Visitors and members find public documents in the Library.
      </p>
      <div className="card mt-4 p-4 grid gap-3 sm:grid-cols-2">
        <select className="input" value={docKind} onChange={(e) => setDocKind(e.target.value)}>{DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>{AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}</select>
        <input className="input sm:col-span-2" placeholder="Title (optional, defaults to the file name)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input sm:col-span-2" type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn btn-primary sm:col-span-2" disabled={!file || uploading} onClick={upload}>{uploading ? "Uploading and processing…" : "Upload and process"}</button>
        {result && <p className="sm:col-span-2 text-sm" style={muted}>{result}</p>}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="data">
          <thead><tr><th>Title</th><th>Kind</th><th>Who can see it</th><th>Assistant</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.title}{d.programme_id !== programmeId && <span className="badge badge-gray ml-2">Regulator-wide</span>}</td>
                <td>{d.doc_kind}</td>
                <td>
                  <select className="input" defaultValue={d.audience} disabled={busy} onChange={(e) => exec(() => supabase.from("documents").update({ audience: e.target.value }).eq("id", d.id), "Visibility updated.")}>
                    {AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
                  </select>
                </td>
                <td>{String(d.index_status).toLowerCase() === "indexed" ? <span className="badge badge-green">Readable</span> : <span className="badge badge-amber">{d.index_status ?? "Not indexed"}</span>}</td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={4}>No documents yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Msg msg={msg} />
    </div>
  );
}
