"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ApplyClassRow, ApplyTemplateRow } from "@/lib/programmes/load";

const BUCKET = "licence-application-files";
type Status = "not_started" | "in_progress" | "done";
interface AppRow { id: string; class_key: string | null; status: string; submission_reference: string | null; submission_date: string | null }
interface ItemState { external_id: string; status: Status; answers: { note?: string } }
interface FileRow { id: string; external_id: string; file_name: string; storage_path: string; version: number }

const muted = { color: "var(--color-text-muted)" } as const;
const ugx = (n: number) => `UGX ${n.toLocaleString("en-UG")}`;
const FEE_LABEL: Record<string, string> = { application: "Application fee", licensing: "Licence fee", annual: "Annual fee" };

export default function GenericApplyClient({ applicationKey, programmeName, regulatorName, blurb, phases, classes, templates, draftPreview }: {
  applicationKey: string; programmeName: string; regulatorName: string; blurb: string; phases: string[]; classes: ApplyClassRow[]; templates: ApplyTemplateRow[]; draftPreview: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const storageKey = `fitspaApplication:${applicationKey}`;
  const [app, setApp] = useState<AppRow | null>(null);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [files, setFiles] = useState<Record<string, FileRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [ref, setRef] = useState("");

  async function load(row: AppRow) {
    const [i, f] = await Promise.all([
      supabase.from("member_licence_application_item_state").select("external_id,status,answers").eq("application_id", row.id),
      supabase.from("member_licence_application_files").select("id,external_id,file_name,storage_path,version").eq("application_id", row.id),
    ]);
    const im: Record<string, ItemState> = {};
    ((i.data ?? []) as ItemState[]).forEach((x) => (im[x.external_id] = x));
    const fm: Record<string, FileRow[]> = {};
    ((f.data ?? []) as FileRow[]).forEach((x) => (fm[x.external_id] ??= []).push(x));
    setItems(im);
    setFiles(fm);
    setApp(row);
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      let id: string | null = null;
      try { id = localStorage.getItem(storageKey); } catch { /* storage unavailable */ }
      if (id) {
        const { data } = await supabase.from("member_licence_applications").select("id,class_key,status,submission_reference,submission_date").eq("id", id).maybeSingle();
        if (data) await load(data as AppRow);
        else { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } }
      }
      setLoading(false);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start(classKey: string) {
    setErr("");
    const { data, error } = await supabase.from("member_licence_applications").insert({ member_id: null, application_key: applicationKey, class_key: classKey, status: "draft" }).select("id,class_key,status,submission_reference,submission_date").single();
    if (error || !data) { setErr("We couldn't start your application. Please try again."); return; }
    try { localStorage.setItem(storageKey, (data as AppRow).id); } catch { /* resume across reloads unavailable */ }
    await load(data as AppRow);
  }

  function startOver() {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setApp(null); setItems({}); setFiles({});
  }

  async function saveItem(ext: string, status: Status, note?: string) {
    if (!app) return;
    const prev = items[ext];
    const answers = { ...(prev?.answers ?? {}), ...(note !== undefined ? { note } : {}) };
    setItems((s) => ({ ...s, [ext]: { external_id: ext, status, answers } }));
    const { error } = await supabase.from("member_licence_application_item_state").upsert({ application_id: app.id, external_id: ext, status, answers }, { onConflict: "application_id,external_id" });
    if (error) setErr("That change could not be saved. Please try again.");
  }

  async function upload(t: ApplyTemplateRow, file: File) {
    if (!app) return;
    setErr("");
    const existing = files[t.external_id ?? t.id] ?? [];
    const ext = t.external_id ?? t.id;
    const version = existing.length ? Math.max(...existing.map((f) => f.version)) + 1 : 1;
    const path = `${app.id}/${ext}/main-v${version}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file);
    if (up.error) { setErr("That file couldn't be uploaded. Please try again."); return; }
    const { data, error } = await supabase.from("member_licence_application_files").insert({ application_id: app.id, external_id: ext, slot: "main", file_name: file.name, storage_path: path, version }).select("id,external_id,file_name,storage_path,version").single();
    if (error || !data) { setErr("The file uploaded but could not be recorded."); return; }
    setFiles((s) => ({ ...s, [ext]: [...(s[ext] ?? []), data as FileRow] }));
    if ((items[ext]?.status ?? "not_started") === "not_started") await saveItem(ext, "in_progress");
  }

  async function openFile(f: FileRow) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function submit() {
    if (!app) return;
    const now = new Date();
    const { error } = await supabase.from("member_licence_applications").update({ status: "submitted", submitted_at: now.toISOString(), submission_date: now.toISOString().slice(0, 10), submission_reference: ref || null }).eq("id", app.id);
    if (error) { setErr("Could not record the submission."); return; }
    setApp({ ...app, status: "submitted", submission_reference: ref || null, submission_date: now.toISOString().slice(0, 10) });
  }

  const cls = classes.find((c) => c.class_key === app?.class_key) ?? null;
  const key = (t: ApplyTemplateRow) => t.external_id ?? t.id;
  const done = templates.filter((t) => items[key(t)]?.status === "done").length;
  const phaseList = Array.from(new Set([...phases, ...templates.map((t) => t.phase)])).filter((p) => templates.some((t) => t.phase === p));

  return (
    <main className="bk mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {draftPreview && <div className="ab-note mb-4">Draft preview: this programme is not published yet. Only FITSPA staff can see it.</div>}
      <p className="text-xs uppercase tracking-wide" style={muted}>{regulatorName} · Licence application</p>
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-serif)" }}>{programmeName}</h1>
      <p className="mt-1 text-sm" style={muted}>{blurb}</p>
      {err && <p className="mt-3 text-sm" role="alert" style={{ color: "var(--color-danger, #b3261e)" }}>{err}</p>}

      {loading ? <p className="mt-6 text-sm" style={muted}>Loading…</p> : !app ? (
        <section className="mt-6">
          <h2 className="font-semibold">Which licence are you applying for?</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {classes.map((c) => (
              <div key={c.class_key} className="card p-4">
                <strong>{c.label}</strong>
                {c.description && <p className="mt-1 text-sm" style={muted}>{c.description}</p>}
                <ul className="mt-2 text-sm">
                  {c.min_capital != null && <li>Minimum capital: {ugx(c.min_capital)}</li>}
                  {c.fees.map((f) => <li key={f.fee_type}>{FEE_LABEL[f.fee_type] ?? f.fee_type}: {ugx(f.amount)}</li>)}
                </ul>
                <button className="btn btn-primary btn-sm mt-3" onClick={() => start(c.class_key)}>Start this application</button>
              </div>
            ))}
            {classes.length === 0 && <div className="card p-4 text-sm">Licence classes are being set up.</div>}
          </div>
        </section>
      ) : (
        <>
          <section className="card mt-5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong>{cls?.label ?? "Your application"}</strong><div className="text-sm" style={muted}>{done} of {templates.length} requirements complete{app.status === "submitted" ? " · submitted" : ""}</div></div>
              <button className="btn btn-ghost btn-sm" onClick={startOver}>Start a different application</button>
            </div>
            <div className="mt-2 h-2 rounded" style={{ background: "var(--color-border)" }}><div className="h-2 rounded" style={{ width: `${templates.length ? Math.round((done / templates.length) * 100) : 0}%`, background: "var(--color-primary)" }} /></div>
            {cls && (
              <ul className="mt-3 text-sm grid gap-1 sm:grid-cols-2">
                {cls.min_capital != null && <li>Minimum capital: {ugx(cls.min_capital)}</li>}
                {cls.fees.map((f) => <li key={f.fee_type}>{FEE_LABEL[f.fee_type] ?? f.fee_type}: {ugx(f.amount)}</li>)}
              </ul>
            )}
          </section>

          {phaseList.map((ph) => (
            <section key={ph} className="mt-5">
              <h2 className="font-semibold capitalize">{ph}</h2>
              <div className="mt-2 grid gap-2">
                {templates.filter((t) => t.phase === ph).map((t) => {
                  const st = items[key(t)]?.status ?? "not_started";
                  const fl = files[key(t)] ?? [];
                  return (
                    <div key={t.id} className="card p-3">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" className="mt-1" aria-label={`Mark "${t.title}" done`} checked={st === "done"} disabled={app.status === "submitted"} onChange={(e) => saveItem(key(t), e.target.checked ? "done" : fl.length ? "in_progress" : "not_started")} />
                        <div className="flex-1">
                          <button className="text-left font-medium" onClick={() => setOpen(open === t.id ? null : t.id)}>{t.title}</button>
                          <span className={`badge ml-2 ${st === "done" ? "badge-green" : st === "in_progress" ? "badge-amber" : "badge-gray"}`}>{st === "done" ? "Done" : st === "in_progress" ? "In progress" : "Not started"}</span>
                          {open === t.id && (
                            <div className="mt-3 grid gap-2 text-sm">
                              {t.copy && <p>{t.copy}</p>}
                              {t.guide_what && <p><strong>What it is.</strong> {t.guide_what}</p>}
                              {t.guide_do && <p><strong>What to do.</strong> {t.guide_do}</p>}
                              {t.guide_evidence && <p><strong>Evidence to upload.</strong> {t.guide_evidence}</p>}
                              {t.source_label && <p style={muted}>Source: {t.source_url ? <a className="underline" href={t.source_url} target="_blank" rel="noopener noreferrer">{t.source_label}</a> : t.source_label}</p>}
                              <textarea className="input" rows={2} placeholder="Your notes" defaultValue={items[key(t)]?.answers?.note ?? ""} disabled={app.status === "submitted"} onBlur={(e) => saveItem(key(t), st, e.target.value)} />
                              {fl.length > 0 && <ul>{fl.map((f) => <li key={f.id}><button className="underline" onClick={() => openFile(f)}>{f.file_name}</button> <span style={muted}>v{f.version}</span></li>)}</ul>}
                              {app.status !== "submitted" && <input type="file" className="input" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(t, f); e.target.value = ""; }} />}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {templates.length === 0 && <div className="card mt-5 p-4 text-sm">The requirements checklist is being set up.</div>}

          <section className="card mt-6 p-4">
            {app.status === "submitted" ? (
              <p className="text-sm">Recorded as submitted{app.submission_date ? ` on ${app.submission_date}` : ""}{app.submission_reference ? ` (reference ${app.submission_reference})` : ""}. Once {regulatorName || "the regulator"} approves your licence, register to manage your ongoing compliance.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">Regulator’s receipt reference (optional)<input className="input mt-1" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
                <button className="btn btn-primary btn-sm" disabled={done < templates.length || templates.length === 0} onClick={submit}>I have submitted to {regulatorName || "the regulator"}</button>
                {done < templates.length && <span className="text-xs" style={muted}>Complete every requirement first.</span>}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
