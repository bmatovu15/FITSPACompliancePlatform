"use client";

import { Fragment, useMemo, useState } from "react";
import type { ObligationRow, Rule } from "@/lib/programmes/types";
import { Msg, muted, ReadOnlyBanner, useDb } from "./ui";

export default function ObligationsTab({ programmeId, obligations, rules, readOnly }: { programmeId: string; obligations: ObligationRow[]; rules: Record<string, Rule>; readOnly: boolean }) {
  const { supabase, exec, msg, busy } = useDb();
  const [filter, setFilter] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const blank = { ref: "", title: "", grp: "", obligation_type: "", source: "", guidance: "", evidence: "", applies: "", due_date: "" };
  const [draft, setDraft] = useState<Record<string, string>>(blank);

  const audiences = useMemo(() => Array.from(new Set([...Object.keys(rules), ...obligations.map((o) => o.applies)])).filter(Boolean).sort(), [rules, obligations]);
  const groups = useMemo(() => Array.from(new Set(obligations.map((o) => o.grp))).filter(Boolean).sort(), [obligations]);
  const rows = obligations.filter((o) => (showRetired || o.status === "active") && (!filter || `${o.ref} ${o.title} ${o.grp} ${o.applies}`.toLowerCase().includes(filter.toLowerCase())));

  function patch(o: ObligationRow, fields: Partial<ObligationRow>) {
    return exec(() => supabase.from("prog_obligations").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", o.id));
  }

  function create() {
    if (!draft.ref.trim() || !draft.title.trim()) return;
    return exec(async () => {
      const r = await supabase.from("prog_obligations").insert({
        programme_id: programmeId, ref: draft.ref.trim(), title: draft.title.trim(), grp: draft.grp.trim(), obligation_type: draft.obligation_type.trim(),
        source: draft.source.trim(), guidance: draft.guidance.trim(), evidence: draft.evidence.trim(), applies: draft.applies.trim(),
        due_date: draft.due_date || null, status: "active", sort_order: obligations.length,
      });
      if (!r.error) { setDraft(blank); setAdding(false); }
      return r;
    }, "Obligation added.");
  }

  const field = (k: string, label: string, props: { wide?: boolean; area?: boolean; list?: string[] } = {}) => (
    <label className={`text-sm ${props.wide ? "sm:col-span-2" : ""}`}>{label}
      {props.area ? <textarea className="input mt-1" rows={2} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        : <input className="input mt-1" list={props.list ? `dl-${k}` : undefined} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />}
      {props.list && <datalist id={`dl-${k}`}>{props.list.map((v) => <option key={v} value={v} />)}</datalist>}
    </label>
  );

  return (
    <div>
      {readOnly && <ReadOnlyBanner what="obligations" />}
      <div className="flex flex-wrap items-center gap-3">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search by reference, title, group or audience" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="text-sm"><input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show retired</label>
        <span className="text-sm" style={muted}>{rows.length} shown</span>
        {!readOnly && <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add obligation"}</button>}
      </div>

      {adding && !readOnly && (
        <div className="card mt-3 p-4 grid gap-3 sm:grid-cols-2">
          {field("ref", "Reference (unique), e.g. CF-01")}
          {field("grp", "Group", { list: groups })}
          {field("title", "What the member must do", { wide: true })}
          {field("obligation_type", "Type, e.g. Recurring regulatory return")}
          {field("applies", "Applies to (audience)", { list: audiences })}
          {field("source", "Legal source")}
          <label className="text-sm">Due date (optional)<input type="date" className="input mt-1" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></label>
          {field("guidance", "Guidance", { wide: true, area: true })}
          {field("evidence", "Evidence the member should keep", { wide: true, area: true })}
          <div className="sm:col-span-2"><button className="btn btn-primary btn-sm" disabled={busy || !draft.ref.trim() || !draft.title.trim()} onClick={create}>Save obligation</button></div>
        </div>
      )}
      <Msg msg={msg} />

      <div className="mt-4 overflow-x-auto card">
        <table className="data">
          <thead><tr><th>Ref</th><th>Obligation</th><th>Group</th><th>Applies to</th><th>Due</th><th></th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <Fragment key={o.id}>
                <tr style={o.status === "retired" ? { opacity: 0.55 } : undefined}>
                  <td>{o.ref}</td>
                  <td>{o.title}{o.status === "retired" && <span className="badge badge-gray ml-2">Retired</span>}</td>
                  <td>{o.grp}</td>
                  <td>{o.applies || "—"}{o.applies && !rules[o.applies] && <span className="badge badge-red ml-2">no rule</span>}</td>
                  <td>{o.due_date ?? "—"}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(editing === o.id ? null : o.id)}>{editing === o.id ? "Close" : readOnly ? "View" : "Edit"}</button></td>
                </tr>
                {editing === o.id && (
                  <tr>
                    <td colSpan={6}>
                      <ObligationEditor o={o} audiences={audiences} readOnly={readOnly} onSave={(f) => patch(o, f)} busy={busy} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}>Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ObligationEditor({ o, audiences, readOnly, onSave, busy }: { o: ObligationRow; audiences: string[]; readOnly: boolean; onSave: (f: Partial<ObligationRow>) => void; busy: boolean }) {
  const [f, setF] = useState({ title: o.title, grp: o.grp, obligation_type: o.obligation_type, source: o.source, guidance: o.guidance, evidence: o.evidence, applies: o.applies, due_date: o.due_date ?? "" });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <div className="grid gap-2 sm:grid-cols-2 py-2">
      <label className="text-sm sm:col-span-2">Obligation<input className="input mt-1" disabled={readOnly} value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="text-sm">Group<input className="input mt-1" disabled={readOnly} value={f.grp} onChange={(e) => set("grp", e.target.value)} /></label>
      <label className="text-sm">Type<input className="input mt-1" disabled={readOnly} value={f.obligation_type} onChange={(e) => set("obligation_type", e.target.value)} /></label>
      <label className="text-sm">Applies to<select className="input mt-1" disabled={readOnly} value={f.applies} onChange={(e) => set("applies", e.target.value)}>
        <option value="">(none)</option>{audiences.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label className="text-sm">Due date<input type="date" className="input mt-1" disabled={readOnly} value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Legal source<input className="input mt-1" disabled={readOnly} value={f.source} onChange={(e) => set("source", e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Guidance<textarea className="input mt-1" rows={2} disabled={readOnly} value={f.guidance} onChange={(e) => set("guidance", e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Evidence<textarea className="input mt-1" rows={2} disabled={readOnly} value={f.evidence} onChange={(e) => set("evidence", e.target.value)} /></label>
      {!readOnly && (
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn btn-primary btn-sm" disabled={busy || !f.title.trim()} onClick={() => onSave({ ...f, due_date: f.due_date || null })}>Save changes</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSave({ status: o.status === "active" ? "retired" : "active" })}>{o.status === "active" ? "Retire (hide from members)" : "Restore"}</button>
        </div>
      )}
    </div>
  );
}
