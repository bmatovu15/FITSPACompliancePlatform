"use client";

import { useState } from "react";
import type { ControlRow, ObligationRow } from "@/lib/programmes/types";
import { Msg, muted, ReadOnlyBanner, useDb } from "./ui";

const refsOf = (t: string) => t.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

function ControlEditor({ programmeId, c, count, known, readOnly }: { programmeId: string; c: ControlRow | null; count: number; known: Set<string>; readOnly: boolean }) {
  const { supabase, exec, msg, busy } = useDb();
  const [title, setTitle] = useState(c?.title ?? "");
  const [refs, setRefs] = useState((c?.obligation_refs ?? []).join(", "));
  const unknown = refsOf(refs).filter((r) => !known.has(r));
  function save() {
    const obligation_refs = refsOf(refs);
    if (c) return exec(() => supabase.from("prog_controls").update({ title, obligation_refs }).eq("programme_id", programmeId).eq("id", c.id), "Control area saved.");
    return exec(async () => {
      const r = await supabase.from("prog_controls").insert({ programme_id: programmeId, id: `CTL-${count + 1}`, title, obligation_refs, sort_order: count });
      if (!r.error) { setTitle(""); setRefs(""); }
      return r;
    }, "Control area added.");
  }
  return (
    <div className="grid gap-2">
      <input className="input" disabled={readOnly} placeholder="Control area, e.g. Consumer protection" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="input" rows={2} disabled={readOnly} placeholder="Obligation references, comma separated" value={refs} onChange={(e) => setRefs(e.target.value)} />
      {unknown.length > 0 && <p className="text-xs" style={{ color: "#a3372f" }}>Unknown reference{unknown.length > 1 ? "s" : ""}: {unknown.join(", ")}</p>}
      {!readOnly && (
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" disabled={busy || !title.trim()} onClick={save}>{c ? "Save" : "Add control area"}</button>
          {c && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exec(() => supabase.from("prog_controls").delete().eq("programme_id", programmeId).eq("id", c.id), "Control area removed.")}>Remove</button>}
        </div>
      )}
      <Msg msg={msg} />
    </div>
  );
}

export default function ControlsTab({ programmeId, controls, obligations, readOnly }: { programmeId: string; controls: ControlRow[]; obligations: ObligationRow[]; readOnly: boolean }) {
  const known = new Set(obligations.map((o) => o.ref));
  const assigned = new Set(controls.flatMap((c) => c.obligation_refs));
  const loose = obligations.filter((o) => o.status === "active" && !assigned.has(o.ref));
  return (
    <div>
      {readOnly && <ReadOnlyBanner what="control areas" />}
      <p className="text-sm" style={muted}>Control areas group obligations into the themes members manage together (for example Governance, Consumer protection). They give members a map of their control environment.</p>
      <div className="mt-4 grid gap-3">
        {controls.map((c) => <div key={c.id} className="card p-4"><ControlEditor programmeId={programmeId} c={c} count={controls.length} known={known} readOnly={readOnly} /></div>)}
        {controls.length === 0 && <div className="card p-4 text-sm">No control areas yet.</div>}
      </div>
      {loose.length > 0 && <p className="mt-3 text-sm" style={muted}>{loose.length} active obligation{loose.length > 1 ? "s are" : " is"} not in any control area: {loose.slice(0, 12).map((o) => o.ref).join(", ")}{loose.length > 12 ? "…" : ""}</p>}
      {!readOnly && <div className="card mt-4 p-4"><h3 className="font-semibold mb-2">Add a control area</h3><ControlEditor programmeId={programmeId} c={null} count={controls.length} known={known} readOnly={false} /></div>}
    </div>
  );
}
