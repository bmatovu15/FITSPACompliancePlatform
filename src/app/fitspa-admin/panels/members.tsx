"use client";
import { useState } from "react";
import styles from "../fitspa-admin.module.css";
import { universe } from "../admin-rules";
import { fmtDate, type Ctx } from "./ctx";
import { FactsEditor } from "./comply";
import { Empty, SubTabs } from "./shared";

const TABS = [
  { key: "directory", label: "Member directory" },
  { key: "view", label: "Member view" },
];

export default function Members({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const sub = TABS.some((t) => t.key === ctx.sub) ? ctx.sub : "directory";
  const [selId, setSelId] = useState(state.members[0]?.id ?? "");
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [progId, setProgId] = useState(state.programmes[0]?.id ?? "");
  const [chip, setChip] = useState<"all" | "fitspa" | "due">("all");
  const [query, setQuery] = useState("");

  const sel = state.members.find((m) => m.id === selId) ?? state.members[0];
  const selProg = state.programmes.find((p) => p.id === sel?.programmeId);

  function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !progId) return;
    const id = `m${Date.now()}`;
    ctx.update((s) => ({ ...s, members: [...s.members, { id, name: name.trim(), programmeId: progId, facts: {}, done: 0, overdue: 0, lastActive: "Just now" }] }), `Added sample member “${name.trim()}”`);
    setName(""); setSelId(id); setEditId(id);
  }

  const editing = state.members.find((m) => m.id === editId);
  const editProg = state.programmes.find((p) => p.id === editing?.programmeId);

  return (
    <section className={styles.panel}>
      <SubTabs tabs={TABS} value={sub} onChange={ctx.setSub} />
      {sub === "directory" && (
        <>
          <p className={styles.lead}>
            Members answer the profile questions once. Their obligations are worked out from those answers and your rules, so these counts change the moment
            you change a rule, an obligation or a member&rsquo;s answers.
          </p>
          <form className={styles.inlineForm} onSubmit={addMember}>
            <input className={`${styles.input} ${styles.grow}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a sample member, e.g. Kampala Brokers Ltd" aria-label="Member name" />
            <select className={styles.input} value={progId} onChange={(e) => setProgId(e.target.value)} aria-label="Programme">
              {state.programmes.map((p) => <option key={p.id} value={p.id}>{p.name.split(" (")[0]}</option>)}
            </select>
            <button className={styles.primary} type="submit" disabled={!name.trim()}>+ Add member</button>
          </form>
          {editing && editProg && (
            <div className={styles.form}>
              <h3>{editing.name} — licence profile</h3>
              <FactsEditor p={editProg} facts={editing.facts} onChange={(k, v) => ctx.update((s) => ({ ...s, members: s.members.map((m) => (m.id === editing.id ? { ...m, facts: { ...m.facts, [k]: v } } : m)) }), "")} />
              <p className={styles.count}>{universe(editProg, editing.facts).length} obligations apply with these answers</p>
              <div className={styles.actionsRow}>
                <button className={styles.primary} type="button" onClick={() => { ctx.update((s) => s, `Saved the licence profile of ${editing.name}`); setEditId(null); }}>Save profile</button>
              </div>
            </div>
          )}
          <div className={styles.table} role="table">
            <div className={`${styles.tr} ${styles.th} ${styles.trMem}`} role="row">
              <span>Member</span><span>Programme</span><span>Obligations</span><span>Done</span><span>Overdue</span><span>Last active</span><span></span>
            </div>
            {state.members.map((m) => {
              const p = state.programmes.find((x) => x.id === m.programmeId);
              const n = p ? universe(p, m.facts).length : 0;
              return (
                <div key={m.id} className={`${styles.tr} ${styles.trMem}`} role="row">
                  <span><b>{m.name}</b></span>
                  <span>{p ? p.name.split(" (")[0] : "—"}</span>
                  <span><b>{n}</b></span>
                  <span>{Math.min(m.done, n)}</span>
                  <span className={m.overdue ? styles.warn : ""}>{m.overdue}</span>
                  <span>{m.lastActive}</span>
                  <span className={styles.rowActions}>
                    <button type="button" className={styles.linkBtn} onClick={() => { setEditId(m.id); }}>Profile</button>
                    <button type="button" className={styles.linkBtn} onClick={() => { setSelId(m.id); ctx.setSub("view"); }}>View as member</button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {sub === "view" && (!sel || !selProg ? <Empty>Add a member first.</Empty> : (() => {
        const rows = universe(selProg, sel.facts)
          .filter((o) => (chip === "fitspa" ? o.custom || o.edited : chip === "due" ? !!o.due : true))
          .filter((o) => !query.trim() || `${o.id} ${o.title} ${o.group} ${o.type}`.toLowerCase().includes(query.trim().toLowerCase()));
        const events = selProg.events.filter((e) => e.needs.every((c) => (sel.facts[c.q] ?? "") === c.is));
        const docs = state.documents.filter((d) => d.regulatorId === selProg.regulatorId && d.audience !== "staff");
        const reg = state.regulators.find((r) => r.id === selProg.regulatorId);
        return (
          <>
            <div className={styles.viewBanner}>
              <div><strong>This is what the member sees</strong><span>Comply, Documents and the AI assistant for the selected sample member.</span></div>
              <select className={styles.input} value={sel.id} onChange={(e) => setSelId(e.target.value)} aria-label="Sample member">
                {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {selProg.status === "draft" && <p className={styles.alert}>This programme is still a draft, so a real member would not see it yet. Publish it first.</p>}
            <div className={styles.memberFrame}>
              <p className={styles.eyebrow}>{reg?.short} · {selProg.name.toUpperCase()}</p>
              <h2 className={styles.h2}>Your compliance universe</h2>
              <div className={styles.toolbar}>
                <input className={styles.input} placeholder="Search obligations…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {([["all", "All"], ["fitspa", "Updated by FITSPA"], ["due", "With a due date"]] as const).map(([k, label]) => (
                  <button key={k} type="button" className={`${styles.chip} ${chip === k ? styles.chipOn : ""}`} onClick={() => setChip(k)}>{label}</button>
                ))}
              </div>
              <p className={styles.count}>{rows.length} obligations apply to {sel.name}</p>
              <div className={styles.memberList}>
                {rows.slice(0, 40).map((o) => (
                  <article key={o.key} className={styles.memberRow}>
                    <div>
                      <b>{o.title}</b><small>{o.group} · {o.type}</small>
                      {o.guidance && <p>{o.guidance.length > 170 ? `${o.guidance.slice(0, 170)}…` : o.guidance}</p>}
                    </div>
                    <div className={styles.memberMeta}>
                      {(o.custom || o.edited) && <em className={styles.flag}>{o.custom ? "New from FITSPA" : "Updated by FITSPA"}</em>}
                      <span>{o.due ? `Due ${fmtDate(o.due)}` : "No fixed date"}</span>
                    </div>
                  </article>
                ))}
                {rows.length === 0 && <Empty>Nothing matches. Check the member&rsquo;s profile answers and the rules.</Empty>}
                {rows.length > 40 && <p className={styles.more}>Showing the first 40 of {rows.length}.</p>}
              </div>
            </div>
            <div className={styles.cards}>
              <div className={styles.card}><strong>Events they can log</strong><span>{events.length ? events.map((e) => e.title).join(" · ") : "None offered"}</span></div>
              <div className={styles.card}><strong>Documents they can open</strong><span>{docs.length} from {reg?.short}{docs.filter((d) => d.audience === "members").length ? ` (${docs.filter((d) => d.audience === "members").length} members-only)` : ""}</span></div>
              <div className={styles.card}><strong>AI assistant</strong><span>{state.ai.enabled && state.ai.members ? `Available — answers from ${docs.filter((d) => d.inAssistant).length} ${reg?.short} documents${state.ai.useWeb && reg?.website ? ` and ${reg.website}` : ""}` : "Switched off for members"}</span></div>
            </div>
          </>
        );
      })())}
    </section>
  );
}
