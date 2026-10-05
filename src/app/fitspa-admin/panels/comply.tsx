"use client";
import { useMemo, useState } from "react";
import styles from "../fitspa-admin.module.css";
import { OBLIGATION_TYPES } from "../admin-seed";
import { describeRule, labelsInUse, obligationApplies, questionUsage, ruleMatches, universe, whyApplies } from "../admin-rules";
import type { Cond, Obligation, Programme, Question, Rule } from "../admin-types";
import { fmtDate, slug, todayISO, type Ctx } from "./ctx";
import { Empty, NoProgramme, ProgrammeBar, SubTabs } from "./shared";

const TABS = [
  { key: "obligations", label: "Obligations" },
  { key: "rules", label: "Applicability rules" },
  { key: "questions", label: "Profile questions" },
  { key: "deadlines", label: "Deadlines" },
  { key: "events", label: "Events & controls" },
  { key: "tester", label: "Test a member" },
];

export default function Comply({ ctx }: { ctx: Ctx }) {
  const p = ctx.prog;
  if (!p) return <NoProgramme ctx={ctx} />;
  const sub = TABS.some((t) => t.key === ctx.sub) ? ctx.sub : "obligations";
  return (
    <section className={styles.panel}>
      <ProgrammeBar ctx={ctx} note="What a member of this regulator sees under Comply, and how it is worked out." />
      <SubTabs tabs={TABS} value={sub} onChange={ctx.setSub} />
      {sub === "obligations" && <Obligations ctx={ctx} p={p} />}
      {sub === "rules" && <Rules ctx={ctx} p={p} />}
      {sub === "questions" && <Questions ctx={ctx} p={p} />}
      {sub === "deadlines" && <Deadlines ctx={ctx} p={p} />}
      {sub === "events" && <EventsControls ctx={ctx} p={p} />}
      {sub === "tester" && <Tester ctx={ctx} p={p} />}
    </section>
  );
}

/* ---------------------------------------------------------------- Obligations */

interface OForm { id: string; title: string; group: string; type: string; source: string; guidance: string; evidence: string; due: string; applies: string }

function Obligations({ ctx, p }: { ctx: Ctx; p: Programme }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "retired" | "changed">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const members = ctx.state.members.filter((m) => m.programmeId === p.id);
  const labels = Object.keys(p.rules);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return p.obligations.filter((o) => {
      if (status === "active" && o.status !== "active") return false;
      if (status === "retired" && o.status !== "retired") return false;
      if (status === "changed" && !(o.custom || o.edited)) return false;
      return !s || `${o.id} ${o.title} ${o.group} ${o.type} ${o.applies}`.toLowerCase().includes(s);
    });
  }, [p.obligations, q, status]);

  const patch = (key: string, ch: Partial<Obligation>, msg: string) =>
    ctx.patchProgramme(p.id, (x) => ({ ...x, obligations: x.obligations.map((o) => (o.key === key ? { ...o, ...ch, edited: o.custom ? o.edited : true } : o)) }), msg);

  const editRow = p.obligations.find((o) => o.key === editing) ?? null;

  return (
    <>
      <p className={styles.lead}>
        The obligations members of this regulator must meet. Each one names an <b>audience</b>; the audience&rsquo;s rule (next tab) decides which members
        it reaches.
      </p>
      <div className={styles.toolbar}>
        <input className={styles.input} placeholder="Search obligations…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="retired">Retired</option><option value="changed">Changed by FITSPA</option>
        </select>
        <button className={styles.primary} type="button" onClick={() => { setAdding(true); setEditing(null); }}>+ Add obligation</button>
      </div>
      <p className={styles.count}>{rows.length} of {p.obligations.length} obligations</p>

      {adding && (
        <OForm title="Add an obligation" labels={labels} initial={null}
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            ctx.patchProgramme(p.id, (x) => ({
              ...x,
              obligations: [{ key: `X:${Date.now()}`, id: v.id || `NEW-${x.obligations.length + 1}`, title: v.title, group: v.group || "FITSPA-added", type: v.type, source: v.source || "FITSPA guidance", guidance: v.guidance, evidence: v.evidence, applies: v.applies, due: v.due, status: "active", custom: true, edited: false }, ...x.obligations],
            }), `Added obligation “${v.title}” for ${v.applies || "no audience"} — reaches matching ${p.name} members`);
            setAdding(false);
          }} />
      )}
      {editRow && (
        <OForm title={`Edit ${editRow.id}`} labels={labels} initial={editRow} onCancel={() => setEditing(null)}
          onSave={(v) => { patch(editRow.key, { title: v.title, group: v.group, type: v.type, source: v.source, guidance: v.guidance, evidence: v.evidence, due: v.due, applies: v.applies }, `Updated ${editRow.id} “${v.title}”`); setEditing(null); }} />
      )}

      <div className={styles.table} role="table">
        <div className={`${styles.tr} ${styles.th} ${styles.trOb}`} role="row">
          <span>ID</span><span>Obligation</span><span>Applies to</span><span>Reaches</span><span>Status</span><span></span>
        </div>
        {rows.slice(0, 80).map((o) => {
          const n = members.filter((m) => obligationApplies(p, o, m.facts)).length;
          return (
            <div key={o.key} className={`${styles.tr} ${styles.trOb} ${o.status === "retired" ? styles.retired : ""}`} role="row">
              <span className={styles.mono}>{o.id}</span>
              <span>
                <b>{o.title}</b>
                <small>{o.group} · {o.type}{o.due ? ` · due ${fmtDate(o.due)}` : ""}</small>
                {(o.custom || o.edited) && <em className={styles.flag}>{o.custom ? "Added by FITSPA" : "Updated by FITSPA"}</em>}
              </span>
              <span className={p.rules[o.applies] ? "" : styles.warn}>{o.applies || "—"}{!p.rules[o.applies] && <small>no rule</small>}</span>
              <span>{members.length ? `${n} of ${members.length} sample members` : "—"}</span>
              <span><i className={`${styles.pill} ${o.status === "active" ? styles.pillOn : styles.pillOff}`}>{o.status === "active" ? "Active" : "Retired"}</i></span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.linkBtn} onClick={() => { setEditing(o.key); setAdding(false); }}>Edit</button>
                <button type="button" className={styles.linkBtn} onClick={() => patch(o.key, { status: o.status === "active" ? "retired" : "active" }, `${o.status === "active" ? "Retired" : "Reactivated"} ${o.id} “${o.title}”`)}>{o.status === "active" ? "Retire" : "Reactivate"}</button>
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <Empty>No obligations match. {p.obligations.length === 0 ? "Add the first one above." : ""}</Empty>}
        {rows.length > 80 && <p className={styles.more}>Showing the first 80. Use search to narrow the list.</p>}
      </div>
    </>
  );
}

function OForm({ title, initial, labels, onSave, onCancel }: { title: string; initial: Obligation | null; labels: string[]; onSave: (v: OForm) => void; onCancel: () => void }) {
  const [v, setV] = useState<OForm>({
    id: initial?.id ?? "", title: initial?.title ?? "", group: initial?.group ?? "", type: initial?.type ?? OBLIGATION_TYPES[0], source: initial?.source ?? "",
    guidance: initial?.guidance ?? "", evidence: initial?.evidence ?? "", due: initial?.due ?? "", applies: initial?.applies ?? labels[0] ?? "",
  });
  const set = (k: keyof OForm, val: string) => setV((x) => ({ ...x, [k]: val }));
  const types = OBLIGATION_TYPES.includes(v.type) ? OBLIGATION_TYPES : [...OBLIGATION_TYPES, v.type];
  return (
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (v.title.trim()) onSave(v); }}>
      <h3>{title}</h3>
      <div className={styles.formGrid}>
        {!initial && <label>Reference<input className={styles.input} value={v.id} onChange={(e) => set("id", e.target.value)} placeholder="e.g. GEN-99" /></label>}
        <label className={initial ? styles.span2 : ""}>Obligation<input className={styles.input} value={v.title} onChange={(e) => set("title", e.target.value)} required /></label>
        <label>Group<input className={styles.input} value={v.group} onChange={(e) => set("group", e.target.value)} placeholder="e.g. Reporting & accounts" /></label>
        <label>Type<select className={styles.input} value={v.type} onChange={(e) => set("type", e.target.value)}>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Source<input className={styles.input} value={v.source} onChange={(e) => set("source", e.target.value)} placeholder="Act, regulation or regulator notice" /></label>
        <label>Next due date<input className={styles.input} type="date" value={v.due} onChange={(e) => set("due", e.target.value)} /></label>
        <label className={styles.span2}>Applies to (audience)
          <select className={styles.input} value={v.applies} onChange={(e) => set("applies", e.target.value)}>
            {labels.length === 0 && <option value="">No audiences yet — add one under Applicability rules</option>}
            {labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className={styles.span2}>Guidance members see<textarea className={styles.textarea} value={v.guidance} onChange={(e) => set("guidance", e.target.value)} /></label>
        <label className={styles.span2}>Evidence to keep<input className={styles.input} value={v.evidence} onChange={(e) => set("evidence", e.target.value)} /></label>
      </div>
      <div className={styles.actionsRow}>
        <button className={styles.primary} type="submit">{initial ? "Save and publish" : "Publish to members"}</button>
        <button className={styles.secondary} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- Rules */

function Rules({ ctx, p }: { ctx: Ctx; p: Programme }) {
  const [name, setName] = useState("");
  const used = labelsInUse(p);
  const members = ctx.state.members.filter((m) => m.programmeId === p.id);
  const setRule = (label: string, fn: (r: Rule) => Rule, msg = "") =>
    ctx.patchProgramme(p.id, (x) => ({ ...x, rules: { ...x.rules, [label]: fn(x.rules[label] ?? { mode: "all", conds: [] }) } }), msg);
  const missing = Object.entries(used).filter(([l, n]) => n > 0 && !p.rules[l]);

  return (
    <>
      <p className={styles.lead}>
        An <b>audience</b> is a plain-language label such as “Licensee using agents”. Its rule says which answers in a member&rsquo;s profile put them in it.
        Change a rule and every obligation with that audience moves for every member at once.
      </p>
      <form className={styles.inlineForm} onSubmit={(e) => {
        e.preventDefault();
        const l = name.trim();
        if (!l || p.rules[l]) return;
        ctx.patchProgramme(p.id, (x) => ({ ...x, rules: { ...x.rules, [l]: { mode: "all", conds: [] } } }), `Added audience “${l}” — now give it a rule`);
        setName("");
      }}>
        <input className={`${styles.input} ${styles.grow}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New audience, e.g. Brokers handling client money" aria-label="New audience" />
        <button className={styles.primary} type="submit" disabled={!name.trim() || !!p.rules[name.trim()]}>+ Add audience</button>
      </form>
      {missing.length > 0 && <p className={styles.alert}>{missing.length} obligation audience(s) have no rule and reach nobody: {missing.map(([l]) => l).join("; ")}</p>}
      {Object.keys(p.rules).length === 0 && <Empty>No audiences yet. Add “All licensees” first, then the narrower ones.</Empty>}
      <div className={styles.ruleList}>
        {Object.entries(p.rules).map(([label, rule]) => {
          const reach = members.filter((m) => ruleMatches(rule, m.facts)).length;
          return (
            <article key={label} className={styles.ruleCard}>
              <header>
                <div>
                  <b>{label}</b>
                  <small>{used[label] ?? 0} obligations · reaches {reach} of {members.length} sample members</small>
                </div>
                <div className={styles.rowActions}>
                  <select className={styles.input} value={rule.mode} aria-label="Rule type" onChange={(e) => setRule(label, (r) => ({ ...r, mode: e.target.value as Rule["mode"] }), `Changed the rule for “${label}” to ${e.target.value}`)}>
                    <option value="always">Every member</option>
                    <option value="all">All of these answers</option>
                    <option value="any">Any of these answers</option>
                    <option value="never">Nobody (switch off)</option>
                  </select>
                  <button type="button" className={styles.linkBtn} disabled={(used[label] ?? 0) > 0} title={(used[label] ?? 0) > 0 ? "Move its obligations to another audience first" : "Delete this audience"}
                    onClick={() => ctx.patchProgramme(p.id, (x) => { const r = { ...x.rules }; delete r[label]; return { ...x, rules: r }; }, `Deleted audience “${label}”`)}>Delete</button>
                </div>
              </header>
              {(rule.mode === "all" || rule.mode === "any") && (
                <div className={styles.condList}>
                  {rule.conds.map((c, i) => (
                    <CondRow key={i} p={p} cond={c}
                      onChange={(nc) => setRule(label, (r) => ({ ...r, conds: r.conds.map((x, j) => (j === i ? nc : x)) }))}
                      onRemove={() => setRule(label, (r) => ({ ...r, conds: r.conds.filter((_, j) => j !== i) }), `Removed a condition from “${label}”`)} />
                  ))}
                  <button type="button" className={styles.linkBtn} disabled={p.questions.length === 0}
                    onClick={() => setRule(label, (r) => ({ ...r, conds: [...r.conds, { q: p.questions[0].key, is: p.questions[0].options[0]?.value ?? "yes" }] }), `Added a condition to “${label}”`)}>+ Add condition</button>
                  {p.questions.length === 0 && <small>Add profile questions first.</small>}
                </div>
              )}
              <p className={styles.sentence}>{describeRule(rule, p.questions)}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}

function CondRow({ p, cond, onChange, onRemove }: { p: Programme; cond: Cond; onChange: (c: Cond) => void; onRemove: () => void }) {
  const q = p.questions.find((x) => x.key === cond.q);
  return (
    <div className={styles.condRow}>
      <select className={styles.input} value={cond.q} aria-label="Question" onChange={(e) => { const nq = p.questions.find((x) => x.key === e.target.value); onChange({ q: e.target.value, is: nq?.options[0]?.value ?? "yes" }); }}>
        {p.questions.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        {!q && <option value={cond.q}>{cond.q} (removed)</option>}
      </select>
      <span>is</span>
      <select className={styles.input} value={cond.is} aria-label="Answer" onChange={(e) => onChange({ ...cond, is: e.target.value })}>
        {(q?.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="button" className={styles.linkBtn} onClick={onRemove}>Remove</button>
    </div>
  );
}

/* ---------------------------------------------------------------- Questions */

function Questions({ ctx, p }: { ctx: Ctx; p: Programme }) {
  const [label, setLabel] = useState("");
  const [help, setHelp] = useState("");
  const [kind, setKind] = useState<Question["kind"]>("yesno");
  const [opts, setOpts] = useState("");
  const use = questionUsage(p);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const options = kind === "single"
      ? opts.split(",").map((s) => s.trim()).filter(Boolean).map((s) => ({ value: slug(s), label: s }))
      : kind === "yesno" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not-sure", label: "Not sure" }];
    if (kind === "single" && options.length < 2) return;
    let key = slug(label);
    if (p.questions.some((q) => q.key === key)) key += "_" + p.questions.length;
    ctx.patchProgramme(p.id, (x) => ({ ...x, questions: [...x.questions, { key, label: label.trim(), help, kind, options }] }), `Added profile question “${label.trim()}” to ${p.name}`);
    setLabel(""); setHelp(""); setOpts("");
  }

  return (
    <>
      <p className={styles.lead}>The questions a member of this regulator answers once when they set up their Comply profile. Rules are built from the answers.</p>
      <form className={styles.form} onSubmit={add}>
        <h3>Add a profile question</h3>
        <div className={styles.formGrid}>
          <label className={styles.span2}>Question<input className={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Holds client money" required /></label>
          <label>Answer type
            <select className={styles.input} value={kind} onChange={(e) => setKind(e.target.value as Question["kind"])}>
              <option value="yesno">Yes / No</option><option value="yesnomaybe">Yes / No / Not sure</option><option value="single">Pick one of several</option>
            </select>
          </label>
          {kind === "single" ? <label>Options, comma separated<input className={styles.input} value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Broker, Dealer, Adviser" /></label> : <span></span>}
          <label className={styles.span2}>Help text<input className={styles.input} value={help} onChange={(e) => setHelp(e.target.value)} /></label>
        </div>
        <div className={styles.actionsRow}><button className={styles.primary} type="submit">Add question</button></div>
      </form>
      {p.questions.length === 0 ? <Empty>No questions yet.</Empty> : (
        <div className={styles.table} role="table">
          <div className={`${styles.tr} ${styles.th} ${styles.trQ}`} role="row"><span>Question</span><span>Answers</span><span>Used by</span><span></span></div>
          {p.questions.map((q) => (
            <div key={q.key} className={`${styles.tr} ${styles.trQ}`} role="row">
              <span><b>{q.label}</b><small>{q.help}</small></span>
              <span>{q.options.map((o) => o.label).join(" · ")}</span>
              <span className={use[q.key] ? "" : styles.warn}>{use[q.key] ? `${use[q.key]} rule conditions` : "Not used by any rule"}</span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.linkBtn} disabled={use[q.key] > 0} title={use[q.key] ? "Remove it from the rules first" : "Delete"}
                  onClick={() => ctx.patchProgramme(p.id, (x) => ({ ...x, questions: x.questions.filter((k) => k.key !== q.key) }), `Removed profile question “${q.label}”`)}>Delete</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Deadlines */

function Deadlines({ ctx, p }: { ctx: Ctx; p: Programme }) {
  const [key, setKey] = useState("");
  const [date, setDate] = useState(todayISO());
  const active = p.obligations.filter((o) => o.status === "active");
  const withDue = active.filter((o) => o.due).sort((a, b) => a.due.localeCompare(b.due));
  const setDue = (o: Obligation, due: string, msg: string) =>
    ctx.patchProgramme(p.id, (x) => ({ ...x, obligations: x.obligations.map((k) => (k.key === o.key ? { ...k, due, edited: k.custom ? k.edited : true } : k)) }), msg);
  const members = ctx.state.members.filter((m) => m.programmeId === p.id);
  return (
    <>
      <p className={styles.lead}>Set the regulator due date for an obligation. It appears on the Calendar and Home list of every member the obligation reaches.</p>
      <div className={styles.toolbar}>
        <select className={`${styles.input} ${styles.grow}`} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Obligation">
          <option value="">Choose an obligation…</option>
          {active.map((o) => <option key={o.key} value={o.key}>{o.id} — {o.title.slice(0, 70)}</option>)}
        </select>
        <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" />
        <button className={styles.primary} type="button" disabled={!key || !date}
          onClick={() => { const o = active.find((x) => x.key === key); if (o) setDue(o, date, `Set due date ${fmtDate(date)} on ${o.id} “${o.title}”`); }}>Set due date</button>
      </div>
      <div className={styles.table} role="table">
        <div className={`${styles.tr} ${styles.th} ${styles.trDue}`} role="row"><span>Due</span><span>Obligation</span><span>Reaches</span><span></span></div>
        {withDue.length === 0 && <Empty>No dates set yet. Pick an obligation above and give it a due date.</Empty>}
        {withDue.map((o) => (
          <div key={o.key} className={`${styles.tr} ${styles.trDue}`} role="row">
            <span><b>{fmtDate(o.due)}</b></span>
            <span><b>{o.title}</b><small>{o.id} · {o.type}</small></span>
            <span>{members.filter((m) => obligationApplies(p, o, m.facts)).length} of {members.length} sample members</span>
            <span className={styles.rowActions}><button type="button" className={styles.linkBtn} onClick={() => setDue(o, "", `Cleared due date on ${o.id}`)}>Clear</button></span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Events & controls */

function IdPicker({ p, ids, onChange }: { p: Programme; ids: string[]; onChange: (ids: string[]) => void }) {
  const [pick, setPick] = useState("");
  const avail = p.obligations.filter((o) => !ids.includes(o.id));
  return (
    <div className={styles.chipsRow}>
      {ids.map((id) => {
        const o = p.obligations.find((x) => x.id === id);
        return <span key={id} className={`${styles.tag} ${o ? "" : styles.tagBad}`} title={o?.title ?? "No such obligation"}>{id}<button type="button" aria-label={`Remove ${id}`} onClick={() => onChange(ids.filter((x) => x !== id))}>×</button></span>;
      })}
      <select className={styles.input} value={pick} aria-label="Add an obligation" onChange={(e) => { if (e.target.value) { onChange([...ids, e.target.value]); } setPick(""); }}>
        <option value="">+ add obligation…</option>
        {avail.map((o) => <option key={o.id} value={o.id}>{o.id} — {o.title.slice(0, 60)}</option>)}
      </select>
    </div>
  );
}

function EventsControls({ ctx, p }: { ctx: Ctx; p: Programme }) {
  const [t, setT] = useState("");
  const [d, setD] = useState("");
  const [ct, setCt] = useState("");
  return (
    <>
      <p className={styles.lead}>
        <b>Events</b> are things that happen to a member (a director changes, an outage). Logging one tells the member which obligations it triggers.
        <b> Control areas</b> group the continuing obligations a member reviews and keeps evidence for.
      </p>
      <h2 className={styles.h2}>Events</h2>
      <form className={styles.inlineForm} onSubmit={(e) => {
        e.preventDefault(); if (!t.trim()) return;
        ctx.patchProgramme(p.id, (x) => ({ ...x, events: [...x.events, { id: slug(t) + "_" + x.events.length, title: t.trim(), desc: d, obligationIds: [], needs: [] }] }), `Added event “${t.trim()}” to ${p.name}`);
        setT(""); setD("");
      }}>
        <input className={`${styles.input} ${styles.grow}`} value={t} onChange={(e) => setT(e.target.value)} placeholder="New event, e.g. Change of compliance officer" aria-label="Event title" />
        <input className={`${styles.input} ${styles.grow}`} value={d} onChange={(e) => setD(e.target.value)} placeholder="When members should log it" aria-label="Event description" />
        <button className={styles.primary} type="submit" disabled={!t.trim()}>+ Add event</button>
      </form>
      {p.events.length === 0 ? <Empty>No events yet.</Empty> : (
        <div className={styles.cardsCol}>
          {p.events.map((e) => (
            <article key={e.id} className={styles.ruleCard}>
              <header>
                <div><b>{e.title}</b><small>{e.desc}</small></div>
                <button type="button" className={styles.linkBtn} onClick={() => ctx.patchProgramme(p.id, (x) => ({ ...x, events: x.events.filter((k) => k.id !== e.id) }), `Removed event “${e.title}”`)}>Remove</button>
              </header>
              <label className={styles.miniLabel}>Triggers these obligations</label>
              <IdPicker p={p} ids={e.obligationIds} onChange={(ids) => ctx.patchProgramme(p.id, (x) => ({ ...x, events: x.events.map((k) => (k.id === e.id ? { ...k, obligationIds: ids } : k)) }), `Updated what “${e.title}” triggers`)} />
              <label className={styles.miniLabel}>Offered to a member only when</label>
              <div className={styles.condList}>
                {e.needs.length === 0 && <small>Always offered</small>}
                {e.needs.map((c, i) => (
                  <CondRow key={i} p={p} cond={c}
                    onChange={(nc) => ctx.patchProgramme(p.id, (x) => ({ ...x, events: x.events.map((k) => (k.id === e.id ? { ...k, needs: k.needs.map((y, j) => (j === i ? nc : y)) } : k)) }), "")}
                    onRemove={() => ctx.patchProgramme(p.id, (x) => ({ ...x, events: x.events.map((k) => (k.id === e.id ? { ...k, needs: k.needs.filter((_, j) => j !== i) } : k)) }), `Removed a condition from event “${e.title}”`)} />
                ))}
                <button type="button" className={styles.linkBtn} disabled={p.questions.length === 0}
                  onClick={() => ctx.patchProgramme(p.id, (x) => ({ ...x, events: x.events.map((k) => (k.id === e.id ? { ...k, needs: [...k.needs, { q: p.questions[0].key, is: p.questions[0].options[0]?.value ?? "yes" }] } : k)) }), `Added a condition to event “${e.title}”`)}>+ Add condition</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className={styles.h2}>Control areas</h2>
      <form className={styles.inlineForm} onSubmit={(e) => {
        e.preventDefault(); if (!ct.trim()) return;
        ctx.patchProgramme(p.id, (x) => ({ ...x, controls: [...x.controls, { id: `CTL-${x.controls.length + 1}`, title: ct.trim(), obligationIds: [] }] }), `Added control area “${ct.trim()}” to ${p.name}`);
        setCt("");
      }}>
        <input className={`${styles.input} ${styles.grow}`} value={ct} onChange={(e) => setCt(e.target.value)} placeholder="New control area, e.g. Client money safeguarding" aria-label="Control area" />
        <button className={styles.primary} type="submit" disabled={!ct.trim()}>+ Add control area</button>
      </form>
      {p.controls.length === 0 ? <Empty>No control areas yet.</Empty> : (
        <div className={styles.cardsCol}>
          {p.controls.map((c) => (
            <article key={c.id} className={styles.ruleCard}>
              <header>
                <div><b>{c.title}</b><small>{c.obligationIds.length} obligations kept under review</small></div>
                <button type="button" className={styles.linkBtn} onClick={() => ctx.patchProgramme(p.id, (x) => ({ ...x, controls: x.controls.filter((k) => k.id !== c.id) }), `Removed control area “${c.title}”`)}>Remove</button>
              </header>
              <IdPicker p={p} ids={c.obligationIds} onChange={(ids) => ctx.patchProgramme(p.id, (x) => ({ ...x, controls: x.controls.map((k) => (k.id === c.id ? { ...k, obligationIds: ids } : k)) }), `Updated control area “${c.title}”`)} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Tester */

export function FactsEditor({ p, facts, onChange }: { p: Programme; facts: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div className={styles.factsGrid}>
      {p.questions.map((q) => (
        <label key={q.key}>
          {q.label}
          <select className={styles.input} value={facts[q.key] ?? ""} onChange={(e) => onChange(q.key, e.target.value)}>
            <option value="">Not answered</option>
            {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

function Tester({ ctx, p }: { ctx: Ctx; p: Programme }) {
  const members = ctx.state.members.filter((m) => m.programmeId === p.id);
  const [facts, setFacts] = useState<Record<string, string>>(() => ({ ...(members[0]?.facts ?? {}) }));
  const [from, setFrom] = useState(members[0]?.id ?? "");
  const [showAll, setShowAll] = useState(false);
  const rows = universe(p, facts);
  const events = p.events.filter((e) => e.needs.every((c) => (facts[c.q] ?? "") === c.is));
  const controlsOn = p.controls.map((c) => ({ ...c, n: c.obligationIds.filter((id) => rows.some((o) => o.id === id)).length })).filter((c) => c.n > 0);
  return (
    <>
      <p className={styles.lead}>Answer the profile questions the way a member would and see exactly which obligations, events and control areas they get, and why.</p>
      <div className={styles.toolbar}>
        <select className={styles.input} value={from} onChange={(e) => { setFrom(e.target.value); const m = members.find((x) => x.id === e.target.value); setFacts({ ...(m?.facts ?? {}) }); }} aria-label="Start from a sample member">
          <option value="">Blank profile</option>
          {members.map((m) => <option key={m.id} value={m.id}>Start from {m.name}</option>)}
        </select>
      </div>
      {p.questions.length === 0 ? <Empty>Add profile questions first.</Empty> : <FactsEditor p={p} facts={facts} onChange={(k, v) => setFacts((f) => ({ ...f, [k]: v }))} />}
      <div className={styles.testSummary}>
        <span><b>{rows.length}</b><small>obligations apply</small></span>
        <span><b>{events.length}</b><small>events offered</small></span>
        <span><b>{controlsOn.length}</b><small>control areas</small></span>
      </div>
      <div className={styles.memberList}>
        {rows.slice(0, showAll ? 400 : 12).map((o) => (
          <article key={o.key} className={styles.memberRow}>
            <div><b>{o.title}</b><small>{o.id} · {o.group} · {o.type}</small></div>
            <div className={styles.whyBox}><small>Why</small>{whyApplies(p, o)}</div>
          </article>
        ))}
        {rows.length === 0 && <Empty>No obligation applies to these answers.</Empty>}
      </div>
      {rows.length > 12 && <button type="button" className={styles.linkBtn} onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${rows.length}`}</button>}
    </>
  );
}
