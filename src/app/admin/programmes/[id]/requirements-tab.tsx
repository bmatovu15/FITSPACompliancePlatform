"use client";

import { useState } from "react";
import type { ApplyTemplateRow } from "@/lib/programmes/load";
import { Msg, muted, slug, useDb } from "./ui";

const DRAWERS = ["generic_upload", "multi_upload", "docpack", "official_form", "people", "ownership", "premises", "capital", "financials", "declarations", "governance", "data_protection", "it_controls", "pentest", "pricing", "fee_proof", "tin_tax", "company_registration", "org_structure"];

function Editor({ applicationKey, phases, t, nextSeq }: { applicationKey: string; phases: string[]; t: ApplyTemplateRow | null; nextSeq: number }) {
  const { supabase, exec, msg, busy } = useDb();
  const [f, setF] = useState({
    title: t?.title ?? "", phase: t?.phase ?? phases[0] ?? "business", copy: t?.copy ?? "", drawer_type: t?.drawer_type ?? "generic_upload",
    guide_what: t?.guide_what ?? "", guide_do: t?.guide_do ?? "", guide_evidence: t?.guide_evidence ?? "", source_label: t?.source_label ?? "", source_url: t?.source_url ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const clean = { ...f, copy: f.copy || null, guide_what: f.guide_what || null, guide_do: f.guide_do || null, guide_evidence: f.guide_evidence || null, source_label: f.source_label || null, source_url: f.source_url || null };

  function save() {
    if (t) return exec(() => supabase.from("licence_application_templates").update({ ...clean, updated_at: new Date().toISOString() }).eq("id", t.id), "Requirement saved.");
    return exec(async () => {
      const r = await supabase.from("licence_application_templates").insert({ ...clean, application_key: applicationKey, external_id: `${applicationKey}-${slug(f.title)}`.slice(0, 80), seq: nextSeq });
      if (!r.error) setF({ ...f, title: "", copy: "", guide_what: "", guide_do: "", guide_evidence: "", source_label: "", source_url: "" });
      return r;
    }, "Requirement added.");
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Requirement<input className="input mt-1" value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="text-sm">Phase
        <input className="input mt-1" list="phase-list" value={f.phase} onChange={(e) => set("phase", e.target.value)} />
        <datalist id="phase-list">{phases.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <label className="text-sm">How the applicant provides it
        <select className="input mt-1" value={f.drawer_type} onChange={(e) => set("drawer_type", e.target.value)}>{DRAWERS.map((d) => <option key={d}>{d}</option>)}</select>
      </label>
      <label className="text-sm sm:col-span-2">Short description<textarea className="input mt-1" rows={2} value={f.copy} onChange={(e) => set("copy", e.target.value)} /></label>
      <label className="text-sm">What it is<textarea className="input mt-1" rows={2} value={f.guide_what} onChange={(e) => set("guide_what", e.target.value)} /></label>
      <label className="text-sm">What to do<textarea className="input mt-1" rows={2} value={f.guide_do} onChange={(e) => set("guide_do", e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Evidence to upload<textarea className="input mt-1" rows={2} value={f.guide_evidence} onChange={(e) => set("guide_evidence", e.target.value)} /></label>
      <label className="text-sm">Source name<input className="input mt-1" value={f.source_label} onChange={(e) => set("source_label", e.target.value)} /></label>
      <label className="text-sm">Source link<input className="input mt-1" value={f.source_url} onChange={(e) => set("source_url", e.target.value)} /></label>
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy || !f.title.trim() || !f.phase.trim()} onClick={save}>{t ? "Save requirement" : "Add requirement"}</button>
        {t && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exec(() => supabase.from("licence_application_templates").update({ workspace_hidden: !t.workspace_hidden }).eq("id", t.id), t.workspace_hidden ? "Shown to applicants." : "Hidden from applicants.")}>{t.workspace_hidden ? "Show to applicants" : "Hide from applicants"}</button>}
      </div>
      <div className="sm:col-span-2"><Msg msg={msg} /></div>
    </div>
  );
}

export default function RequirementsTab({ applicationKey, phases, templates }: { applicationKey: string | null; phases: string[]; templates: ApplyTemplateRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!applicationKey) return <div className="card p-4 text-sm">This programme has no application key yet.</div>;
  const allPhases = Array.from(new Set([...phases, ...templates.map((t) => t.phase)]));
  return (
    <div>
      <p className="text-sm" style={muted}>
        Requirements are the checklist an applicant works through to apply for a licence from this regulator, grouped into phases. Hiding a requirement removes it from applicants’ checklists without deleting it.
      </p>
      {allPhases.map((ph) => (
        <section key={ph} className="mt-4">
          <h3 className="font-semibold capitalize">{ph}</h3>
          <div className="mt-2 grid gap-2">
            {templates.filter((t) => t.phase === ph).map((t) => (
              <div key={t.id} className="card p-3" style={t.workspace_hidden ? { opacity: 0.6 } : undefined}>
                <button className="text-left w-full text-sm" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  {t.seq}. {t.title} {t.workspace_hidden && <span className="badge badge-gray">Hidden</span>}
                </button>
                {open === t.id && <div className="mt-3"><Editor applicationKey={applicationKey} phases={allPhases} t={t} nextSeq={templates.length} /></div>}
              </div>
            ))}
          </div>
        </section>
      ))}
      {templates.length === 0 && <div className="card mt-4 p-4 text-sm">No requirements yet. Add the first below.</div>}
      <div className="card mt-6 p-4">
        <h3 className="font-semibold mb-2">Add a requirement</h3>
        <Editor applicationKey={applicationKey} phases={allPhases} t={null} nextSeq={templates.length} />
      </div>
    </div>
  );
}
