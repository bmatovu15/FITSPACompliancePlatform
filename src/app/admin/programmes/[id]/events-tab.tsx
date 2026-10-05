"use client";

import { useState } from "react";
import type { Cond, EventRow, ObligationRow, Question } from "@/lib/programmes/types";
import { Msg, muted, ReadOnlyBanner, slug, useDb } from "./ui";

function refsOf(text: string) {
  return text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function EventEditor({ programmeId, ev, questions, known, readOnly }: { programmeId: string; ev: EventRow | null; questions: Question[]; known: Set<string>; readOnly: boolean }) {
  const { supabase, exec, msg, busy } = useDb();
  const [title, setTitle] = useState(ev?.title ?? "");
  const [description, setDescription] = useState(ev?.description ?? "");
  const [refs, setRefs] = useState((ev?.obligation_refs ?? []).join(", "));
  const [needs, setNeeds] = useState<Cond[]>(ev?.needs ?? []);
  const unknown = refsOf(refs).filter((r) => !known.has(r));

  function save() {
    const obligation_refs = refsOf(refs);
    if (ev) return exec(() => supabase.from("prog_events").update({ title, description, obligation_refs, needs }).eq("programme_id", programmeId).eq("id", ev.id), "Event saved.");
    return exec(async () => {
      const r = await supabase.from("prog_events").insert({ programme_id: programmeId, id: slug(title), title, description, obligation_refs, needs, sort_order: 999 });
      if (!r.error) { setTitle(""); setDescription(""); setRefs(""); setNeeds([]); }
      return r;
    }, "Event added.");
  }

  return (
    <div className="grid gap-2 py-2">
      <label className="text-sm">What happened<input className="input mt-1" disabled={readOnly} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="text-sm">Explanation for members<input className="input mt-1" disabled={readOnly} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="text-sm">Obligations it triggers (references, comma separated)
        <input className="input mt-1" disabled={readOnly} value={refs} onChange={(e) => setRefs(e.target.value)} />
      </label>
      {unknown.length > 0 && <p className="text-xs" style={{ color: "#a3372f" }}>Unknown reference{unknown.length > 1 ? "s" : ""}: {unknown.join(", ")}</p>}
      <div className="text-sm">Only offer this event to members who answered:</div>
      {needs.length === 0 && <div className="text-xs" style={muted}>Nothing — every member sees it.</div>}
      {needs.map((c, i) => {
        const q = questions.find((x) => x.key === c.q);
        return (
          <div key={i} className="flex flex-wrap gap-2">
            <select className="input" style={{ flex: 2 }} disabled={readOnly} value={c.q} onChange={(e) => { const nq = questions.find((x) => x.key === e.target.value); setNeeds(needs.map((x, j) => (j === i ? { q: e.target.value, is: nq?.options[0]?.value ?? "" } : x))); }}>
              {questions.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <select className="input" style={{ flex: 1 }} disabled={readOnly} value={c.is} onChange={(e) => setNeeds(needs.map((x, j) => (j === i ? { ...x, is: e.target.value } : x)))}>
              {(q?.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {!readOnly && <button className="btn btn-ghost btn-sm" onClick={() => setNeeds(needs.filter((_, j) => j !== i))}>×</button>}
          </div>
        );
      })}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" disabled={!questions.length} onClick={() => setNeeds([...needs, { q: questions[0].key, is: questions[0].options[0]?.value ?? "" }])}>+ Add condition</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !title.trim()} onClick={save}>{ev ? "Save event" : "Add event"}</button>
          {ev && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => exec(() => supabase.from("prog_events").delete().eq("programme_id", programmeId).eq("id", ev.id), "Event removed.")}>Remove</button>}
        </div>
      )}
      <Msg msg={msg} />
    </div>
  );
}

export default function EventsTab({ programmeId, events, questions, obligations, readOnly }: { programmeId: string; events: EventRow[]; questions: Question[]; obligations: ObligationRow[]; readOnly: boolean }) {
  const known = new Set(obligations.map((o) => o.ref));
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div>
      {readOnly && <ReadOnlyBanner what="events" />}
      <p className="text-sm" style={muted}>
        Events are things that happen during a licence’s life (an outage, a director change, a new agent network). Each one points members to the obligations they now have to act on.
      </p>
      <div className="mt-4 grid gap-3">
        {events.map((e) => (
          <div key={e.id} className="card p-4">
            <button className="text-left w-full" onClick={() => setOpenId(openId === e.id ? null : e.id)}>
              <strong>{e.title}</strong>
              <div className="text-xs" style={muted}>{e.obligation_refs.length} obligation{e.obligation_refs.length === 1 ? "" : "s"}{e.needs.length ? ` · only when ${e.needs.map((n) => `${n.q}=${n.is}`).join(", ")}` : ""}</div>
            </button>
            {openId === e.id && <EventEditor programmeId={programmeId} ev={e} questions={questions} known={known} readOnly={readOnly} />}
          </div>
        ))}
        {events.length === 0 && <div className="card p-4 text-sm">No events yet.</div>}
      </div>
      {!readOnly && (
        <div className="card mt-4 p-4">
          <h3 className="font-semibold">Add an event</h3>
          <EventEditor programmeId={programmeId} ev={null} questions={questions} known={known} readOnly={false} />
        </div>
      )}
    </div>
  );
}
