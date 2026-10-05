"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Facts, ObligationRow, ProgrammeData } from "@/lib/programmes/types";
import { eventOffered, unanswered, universe } from "@/lib/programmes/rules";

interface Progress { done: boolean; note: string; doneAt?: string }
interface LoggedEvent { id: string; eventId: string; title: string; at: string; note: string }
interface Workspace { facts: Facts; progress: Record<string, Progress>; log: LoggedEvent[] }

const EMPTY: Workspace = { facts: {}, progress: {}, log: [] };
type Tab = "now" | "events" | "controls" | "profile";

function parse(state: unknown): Workspace {
  if (!state || typeof state !== "object") return EMPTY;
  const s = state as Partial<Workspace>;
  return { facts: s.facts ?? {}, progress: s.progress ?? {}, log: s.log ?? [] };
}

const muted = { color: "var(--color-text-muted)" } as const;

function dueState(o: ObligationRow, done: boolean) {
  if (!o.due_date) return { label: "No fixed date", cls: "badge-gray" };
  if (done) return { label: `Due ${o.due_date}`, cls: "badge-green" };
  const days = Math.ceil((new Date(o.due_date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: `Overdue since ${o.due_date}`, cls: "badge-red" };
  if (days <= 30) return { label: `Due ${o.due_date} (${days} days)`, cls: "badge-amber" };
  return { label: `Due ${o.due_date}`, cls: "badge-gray" };
}

export default function GenericComplyClient({ memberId, data, initialState, draftPreview }: { memberId: string; data: ProgrammeData; initialState: unknown; draftPreview: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [ws, setWs] = useState<Workspace>(() => parse(initialState));
  const [tab, setTab] = useState<Tab>("now");
  const [saveMsg, setSaveMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all" | "done">("open");
  const first = useRef(true);
  const missing = unanswered(data.questions, ws.facts);
  const profileComplete = data.questions.length > 0 && missing.length === 0;

  // Save the whole workspace document shortly after any change.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      const { error } = await supabase.from("member_comply_workspace").upsert(
        { member_id: memberId, module_key: data.programme.id, state: ws as never, profile_set: profileComplete, updated_at: new Date().toISOString() },
        { onConflict: "member_id,module_key" },
      );
      setSaveMsg(error ? `Could not save: ${error.message}` : "All changes saved");
    }, 700);
    return () => clearTimeout(t);
  }, [ws, memberId, data.programme.id, supabase, profileComplete]);

  const mine = useMemo(() => universe(data.obligations, data.rules, ws.facts), [data, ws.facts]);
  const doneCount = mine.filter((o) => ws.progress[o.ref]?.done).length;
  const events = data.events.filter((e) => eventOffered(e.needs, ws.facts));
  const setProgress = (ref: string, patch: Partial<Progress>) =>
    setWs((w) => ({ ...w, progress: { ...w.progress, [ref]: { ...(w.progress[ref] ?? { done: false, note: "" }), ...patch } } }));

  const listed = mine.filter((o) => (filter === "all" ? true : filter === "done" ? ws.progress[o.ref]?.done : !ws.progress[o.ref]?.done));
  const groups = Array.from(new Set(listed.map((o) => o.grp || "General")));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {draftPreview && <div className="card p-3 mb-4 text-sm" style={{ background: "#fbedd9", color: "#93590b" }}>Draft preview: this programme is not published yet. Only FITSPA staff can see it.</div>}
      <p className="text-xs uppercase tracking-wide" style={muted}>{data.regulator?.name ?? "Regulator"}</p>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>{data.programme.name}</h1>
      <p className="mt-1 text-sm" style={muted}>{data.programme.blurb}</p>

      {!profileComplete ? (
        <ProfileForm data={data} facts={ws.facts} onChange={(facts) => setWs((w) => ({ ...w, facts }))} missing={missing} intro />
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="card p-4"><div className="text-xs uppercase" style={muted}>Obligations that apply</div><div className="text-2xl font-semibold">{mine.length}</div></div>
            <div className="card p-4"><div className="text-xs uppercase" style={muted}>Done</div><div className="text-2xl font-semibold">{doneCount} / {mine.length}</div></div>
            <div className="card p-4"><div className="text-xs uppercase" style={muted}>Overdue</div><div className="text-2xl font-semibold">{mine.filter((o) => o.due_date && !ws.progress[o.ref]?.done && new Date(o.due_date) < new Date()).length}</div></div>
          </div>

          <nav className="mt-6 flex flex-wrap gap-1" aria-label="Compliance sections">
            {([["now", "What applies to me"], ["events", `Events (${events.length})`], ["controls", `Control areas (${data.controls.length})`], ["profile", "My profile"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(k)}>{l}</button>
            ))}
            <span className="ml-auto text-xs self-center" style={muted}>{saveMsg}</span>
          </nav>

          {tab === "now" && (
            <section className="mt-4">
              <div className="flex gap-2 mb-3">
                {(["open", "done", "all"] as const).map((f) => <button key={f} className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(f)}>{f === "open" ? "To do" : f === "done" ? "Done" : "All"}</button>)}
              </div>
              {groups.map((g) => (
                <div key={g} className="mb-5">
                  <h2 className="font-semibold">{g}</h2>
                  <div className="mt-2 grid gap-2">
                    {listed.filter((o) => (o.grp || "General") === g).map((o) => {
                      const p = ws.progress[o.ref];
                      const due = dueState(o, !!p?.done);
                      return (
                        <div key={o.ref} className="card p-3">
                          <div className="flex items-start gap-3">
                            <input type="checkbox" aria-label={`Mark ${o.ref} done`} checked={!!p?.done} onChange={(e) => setProgress(o.ref, { done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : undefined })} className="mt-1" />
                            <div className="flex-1">
                              <button className="text-left font-medium" onClick={() => setOpen(open === o.ref ? null : o.ref)}>{o.title}</button>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs"><span style={muted}>{o.ref}</span><span className={`badge ${due.cls}`}>{due.label}</span>{o.obligation_type && <span style={muted}>{o.obligation_type}</span>}</div>
                              {open === o.ref && (
                                <div className="mt-3 grid gap-2 text-sm">
                                  {o.guidance && <p><strong>Guidance.</strong> {o.guidance}</p>}
                                  {o.evidence && <p><strong>Keep as evidence.</strong> {o.evidence}</p>}
                                  {o.source && <p style={muted}>Source: {o.source}</p>}
                                  <textarea className="input" rows={2} placeholder="Your notes (where the evidence is kept, who owns this)" value={p?.note ?? ""} onChange={(e) => setProgress(o.ref, { note: e.target.value })} />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {listed.length === 0 && <div className="card p-4 text-sm">{filter === "open" ? "Nothing left to do. Well done." : "Nothing to show here."}</div>}
            </section>
          )}

          {tab === "events" && (
            <section className="mt-4 grid gap-3">
              <p className="text-sm" style={muted}>Log something that has happened and see what you now need to do about it.</p>
              {events.map((e) => (
                <EventCard key={e.id} title={e.title} description={e.description} obligations={e.obligation_refs.map((r) => data.obligations.find((o) => o.ref === r)).filter((o): o is ObligationRow => !!o)}
                  onLog={(note) => setWs((w) => ({ ...w, log: [{ id: `${Date.now()}`, eventId: e.id, title: e.title, at: new Date().toISOString(), note }, ...w.log] }))} />
              ))}
              {events.length === 0 && <div className="card p-4 text-sm">No events apply to your profile.</div>}
              {ws.log.length > 0 && (
                <div className="card p-4">
                  <h3 className="font-semibold">Your event log</h3>
                  <ul className="mt-2 text-sm grid gap-1">{ws.log.map((l) => <li key={l.id}><span style={muted}>{l.at.slice(0, 10)}</span> {l.title}{l.note ? ` — ${l.note}` : ""}</li>)}</ul>
                </div>
              )}
            </section>
          )}

          {tab === "controls" && (
            <section className="mt-4 grid gap-3">
              {data.controls.map((c) => {
                const rows = mine.filter((o) => c.obligation_refs.includes(o.ref));
                const done = rows.filter((o) => ws.progress[o.ref]?.done).length;
                return (
                  <div key={c.id} className="card p-4">
                    <div className="flex justify-between gap-2"><strong>{c.title}</strong><span className="text-sm" style={muted}>{rows.length ? `${done} of ${rows.length} done` : "Nothing applies to you here"}</span></div>
                    {rows.length > 0 && <div className="mt-2 h-2 rounded" style={{ background: "var(--color-border)" }}><div className="h-2 rounded" style={{ width: `${Math.round((done / rows.length) * 100)}%`, background: "var(--color-primary)" }} /></div>}
                    {rows.length > 0 && <ul className="mt-2 text-sm list-disc pl-5">{rows.map((o) => <li key={o.ref} style={ws.progress[o.ref]?.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{o.title}</li>)}</ul>}
                  </div>
                );
              })}
              {data.controls.length === 0 && <div className="card p-4 text-sm">This programme has no control areas yet.</div>}
            </section>
          )}

          {tab === "profile" && <ProfileForm data={data} facts={ws.facts} onChange={(facts) => setWs((w) => ({ ...w, facts }))} missing={missing} />}
        </>
      )}
    </main>
  );
}

function ProfileForm({ data, facts, onChange, missing, intro }: { data: ProgrammeData; facts: Facts; onChange: (f: Facts) => void; missing: string[]; intro?: boolean }) {
  if (data.questions.length === 0) return <div className="card mt-5 p-4 text-sm">This programme is still being set up by FITSPA.</div>;
  return (
    <section className="card mt-5 p-4">
      <h2 className="font-semibold">{intro ? "Tell us about your business" : "Your answers"}</h2>
      <p className="mt-1 text-sm" style={muted}>{intro ? "Answer once and we will show only the obligations that apply to you. You can change these later." : "Changing an answer changes which obligations apply."}{missing.length > 0 && ` ${missing.length} still to answer.`}</p>
      <div className="mt-4 grid gap-4">
        {data.questions.map((q) => (
          <fieldset key={q.key}>
            <legend className="text-sm font-medium">{q.label}</legend>
            {q.help && <p className="text-xs" style={muted}>{q.help}</p>}
            <div className="mt-1 flex flex-wrap gap-2">
              {q.options.map((o) => (
                <button key={o.value} type="button" aria-pressed={facts[q.key] === o.value} className={`btn btn-sm ${facts[q.key] === o.value ? "btn-primary" : "btn-ghost"}`} onClick={() => onChange({ ...facts, [q.key]: o.value })}>{o.label}</button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function EventCard({ title, description, obligations, onLog }: { title: string; description: string; obligations: ObligationRow[]; onLog: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="card p-4">
      <button className="text-left w-full" onClick={() => setOpen(!open)}><strong>{title}</strong><div className="text-sm" style={muted}>{description}</div></button>
      {open && (
        <div className="mt-3 grid gap-2 text-sm">
          {obligations.length > 0 ? <><strong>You will need to:</strong><ul className="list-disc pl-5">{obligations.map((o) => <li key={o.ref}>{o.title}{o.guidance ? ` — ${o.guidance}` : ""}</li>)}</ul></> : <p style={muted}>No specific obligations are linked to this event.</p>}
          <textarea className="input" rows={2} placeholder="What happened (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div><button className="btn btn-primary btn-sm" onClick={() => { onLog(note); setNote(""); setOpen(false); }}>Add to my event log</button></div>
        </div>
      )}
    </div>
  );
}
