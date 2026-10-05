"use client";
import { useState } from "react";
import styles from "../fitspa-admin.module.css";
import { readiness, readyScore } from "../admin-readiness";
import type { Programme, Regulator } from "../admin-types";
import { slug, type Ctx } from "./ctx";

function blankProgramme(id: string, regulatorId: string, name: string, source: Programme | undefined): Programme {
  return {
    id, regulatorId, name, blurb: "", status: "draft", screens: "generic",
    phases: source ? [...source.phases] : ["company", "people", "business", "forms", "review"],
    classes: [], requirements: [],
    questions: source ? source.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) })) : [],
    rules: source ? Object.fromEntries(Object.entries(source.rules).filter(([, r]) => r.mode === "always").map(([k, r]) => [k, { ...r, conds: [] }])) : {},
    obligations: [], events: [], controls: [],
  };
}

export default function Regulators({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", short: "", sector: "", website: "", acronyms: "", contact: "", programme: "", start: "blank" });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const id = slug(form.short || form.name) + "_" + Math.random().toString(36).slice(2, 5);
    const reg: Regulator = { id, name: form.name.trim(), short: form.short.trim() || form.name.trim(), sector: form.sector.trim(), website: form.website.trim(), acronyms: form.acronyms.trim(), contact: form.contact.trim(), notes: "", status: "draft" };
    const src = state.programmes.find((p) => p.id === form.start);
    const prog = blankProgramme("prog_" + id, id, form.programme.trim() || `${reg.short} licensing and compliance`, src);
    ctx.update((s) => ({ ...s, regulators: [...s.regulators, reg], programmes: [...s.programmes, prog] }), `Added regulator “${reg.name}” with a draft programme “${prog.name}”`);
    ctx.setProgId(prog.id);
    setAdding(false);
    setForm({ name: "", short: "", sector: "", website: "", acronyms: "", contact: "", programme: "", start: "blank" });
  }

  const editing = state.regulators.find((r) => r.id === editId);

  return (
    <section className={styles.panel}>
      <p className={styles.lead}>
        Every regulator on the platform. Adding one here creates a draft programme with its own Apply, Comply, documents and assistant
        coverage; nothing is shown to members until it is published.
      </p>
      <div className={styles.toolbar}>
        <button className={styles.primary} type="button" onClick={() => { setAdding(true); setEditId(null); }}>+ Add a regulator</button>
      </div>

      {adding && (
        <form className={styles.form} onSubmit={create}>
          <h3>Add a regulator</h3>
          <div className={styles.formGrid}>
            <label>Name<input className={styles.input} required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Uganda Retirement Benefits Regulatory Authority (URBRA)" /></label>
            <label>Short name<input className={styles.input} value={form.short} onChange={(e) => set("short", e.target.value)} placeholder="URBRA" /></label>
            <label>Sector<input className={styles.input} value={form.sector} onChange={(e) => set("sector", e.target.value)} placeholder="Pensions" /></label>
            <label>Website domain for the assistant<input className={styles.input} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="urbra.go.ug" /></label>
            <label className={styles.span2}>Acronyms the regulator uses (the assistant expands them in questions)
              <input className={styles.input} value={form.acronyms} onChange={(e) => set("acronyms", e.target.value)} placeholder="URBRA = Uganda Retirement Benefits Regulatory Authority; NSSF = National Social Security Fund" />
            </label>
            <label>Contact<input className={styles.input} value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="licensing@regulator.go.ug" /></label>
            <label>First programme name<input className={styles.input} value={form.programme} onChange={(e) => set("programme", e.target.value)} placeholder="Retirement benefits scheme licensing" /></label>
            <label className={styles.span2}>Start the programme from
              <select className={styles.input} value={form.start} onChange={(e) => set("start", e.target.value)}>
                <option value="blank">A blank programme</option>
                {state.programmes.map((p) => <option key={p.id} value={p.id}>Copy the questions and phases of: {p.name}</option>)}
              </select>
            </label>
          </div>
          <div className={styles.actionsRow}>
            <button className={styles.primary} type="submit">Create regulator and draft programme</button>
            <button className={styles.secondary} type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <form
          className={styles.form}
          onSubmit={(e) => { e.preventDefault(); ctx.update((s) => s, `Saved the profile of ${editing.short}`); setEditId(null); }}
        >
          <h3>Edit {editing.short}</h3>
          <div className={styles.formGrid}>
            {([["name", "Name"], ["short", "Short name"], ["sector", "Sector"], ["website", "Website domain for the assistant"], ["contact", "Contact"]] as const).map(([k, label]) => (
              <label key={k}>{label}
                <input className={styles.input} value={editing[k]} onChange={(e) => ctx.update((s) => ({ ...s, regulators: s.regulators.map((r) => (r.id === editing.id ? { ...r, [k]: e.target.value } : r)) }), "")} />
              </label>
            ))}
            <label className={styles.span2}>Acronyms the regulator uses
              <input className={styles.input} value={editing.acronyms} onChange={(e) => ctx.update((s) => ({ ...s, regulators: s.regulators.map((r) => (r.id === editing.id ? { ...r, acronyms: e.target.value } : r)) }), "")} />
            </label>
          </div>
          <div className={styles.actionsRow}><button className={styles.primary} type="submit">Done</button></div>
        </form>
      )}

      <div className={styles.table} role="table">
        <div className={`${styles.tr} ${styles.th} ${styles.trReg}`} role="row">
          <span>Regulator</span><span>Programmes</span><span>Documents</span><span>Assistant</span><span>Status</span><span></span>
        </div>
        {state.regulators.map((r) => {
          const progs = state.programmes.filter((p) => p.regulatorId === r.id);
          const docs = state.documents.filter((d) => d.regulatorId === r.id);
          const indexed = docs.filter((d) => d.status === "indexed" && d.inAssistant).length;
          return (
            <div key={r.id} className={`${styles.tr} ${styles.trReg}`} role="row">
              <span><b>{r.name}</b><small>{r.sector || "—"}{r.website ? ` · ${r.website}` : ""}</small></span>
              <span>
                {progs.length === 0 ? <small>None yet</small> : progs.map((p) => {
                  const sc = readyScore(readiness(state, p));
                  return (
                    <button key={p.id} type="button" className={styles.linkBtn} onClick={() => { ctx.setProgId(p.id); ctx.go("overview"); }}>
                      {p.name.split(" (")[0]} · {sc.pct}%
                    </button>
                  );
                })}
              </span>
              <span>{docs.length}</span>
              <span>{indexed > 0 ? "Documents + web" : r.website ? "Web only" : "Not covered"}</span>
              <span><i className={`${styles.pill} ${progs.some((p) => p.status === "published") ? styles.pillOn : styles.pillOff}`}>{progs.length === 0 ? "No programme" : progs.some((p) => p.status === "published") ? "Live" : "Draft"}</i></span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.linkBtn} onClick={() => { setEditId(r.id); setAdding(false); }}>Edit</button>
                {progs.length === 0 && (
                  <button type="button" className={styles.linkBtn} onClick={() => {
                    const prog = blankProgramme("prog_" + r.id, r.id, `${r.short} licensing and compliance`, undefined);
                    ctx.update((s) => ({ ...s, programmes: [...s.programmes, prog] }), `Started a programme for ${r.short}`);
                    ctx.setProgId(prog.id);
                  }}>Start programme</button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
