"use client";
import { useMemo, useState } from "react";
import styles from "../fitspa-admin.module.css";
import { DRAWER_TYPES } from "../admin-seed";
import type { ApplyClass, ApplyFee, Requirement } from "../admin-types";
import { money, slug, type Ctx } from "./ctx";
import { Empty, NoProgramme, ProgrammeBar, SubTabs } from "./shared";

const TABS = [
  { key: "classes", label: "Licence classes & fees" },
  { key: "requirements", label: "Application requirements" },
  { key: "preview", label: "What an applicant sees" },
];
const FEE_TYPES: ApplyFee["type"][] = ["application", "licensing", "annual"];
const pretty = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function Apply({ ctx }: { ctx: Ctx }) {
  const p = ctx.prog;
  if (!p) return <NoProgramme ctx={ctx} />;
  const sub = TABS.some((t) => t.key === ctx.sub) ? ctx.sub : "classes";
  return (
    <section className={styles.panel}>
      <ProgrammeBar ctx={ctx} note="Everything here is what an applicant sees under Apply for this regulator." />
      <SubTabs tabs={TABS} value={sub} onChange={ctx.setSub} />
      {sub === "classes" && <Classes ctx={ctx} />}
      {sub === "requirements" && <Requirements ctx={ctx} />}
      {sub === "preview" && <Preview ctx={ctx} />}
    </section>
  );
}

function Classes({ ctx }: { ctx: Ctx }) {
  const p = ctx.prog!;
  const [label, setLabel] = useState("");
  const [cap, setCap] = useState("");
  const [fees, setFees] = useState({ application: "", licensing: "", annual: "" });

  const setClass = (key: string, fn: (c: ApplyClass) => ApplyClass, msg = "") =>
    ctx.patchProgramme(p.id, (x) => ({ ...x, classes: x.classes.map((c) => (c.key === key ? fn(c) : c)) }), msg);

  function setFee(c: ApplyClass, type: ApplyFee["type"], raw: string) {
    const amount = raw === "" ? NaN : Number(raw);
    setClass(c.key, (k) => ({
      ...k,
      fees: Number.isNaN(amount) ? k.fees.filter((f) => f.type !== type) : [...k.fees.filter((f) => f.type !== type), { type, amount }],
    }));
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const f: ApplyFee[] = FEE_TYPES.filter((t) => fees[t] !== "").map((t) => ({ type: t, amount: Number(fees[t]) }));
    ctx.patchProgramme(p.id, (x) => ({ ...x, classes: [...x.classes, { key: slug(label) + "_" + (x.classes.length + 1), label: label.trim(), minCapital: cap === "" ? null : Number(cap), fees: f }] }), `Added licence class “${label.trim()}” to ${p.name}`);
    setLabel(""); setCap(""); setFees({ application: "", licensing: "", annual: "" });
  }

  return (
    <>
      <p className={styles.lead}>The licence classes an applicant chooses between, the minimum paid-up capital for each, and the fees shown on the fees step.</p>
      <form className={styles.inlineForm} onSubmit={add}>
        <input className={`${styles.input} ${styles.grow}`} placeholder="New licence class, e.g. Broker-dealer" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Licence class name" />
        <input className={styles.input} type="number" min={0} placeholder="Minimum capital (UGX)" value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Minimum capital" />
        {FEE_TYPES.map((t) => (
          <input key={t} className={styles.input} type="number" min={0} placeholder={`${pretty(t)} fee`} value={fees[t]} onChange={(e) => setFees((f) => ({ ...f, [t]: e.target.value }))} aria-label={`${t} fee`} />
        ))}
        <button className={styles.primary} type="submit" disabled={!label.trim()}>+ Add class</button>
      </form>
      {p.classes.length === 0 ? (
        <Empty>No licence classes yet. Applicants cannot start an application until at least one is added.</Empty>
      ) : (
        <div className={styles.table} role="table">
          <div className={`${styles.tr} ${styles.th} ${styles.trCls}`} role="row">
            <span>Licence class</span><span>Minimum capital</span><span>Application fee</span><span>Licence fee</span><span>Annual fee</span><span></span>
          </div>
          {p.classes.map((c) => (
            <div key={c.key} className={`${styles.tr} ${styles.trCls}`} role="row">
              <span>
                <input className={`${styles.input} ${styles.flat}`} value={c.label} onChange={(e) => setClass(c.key, (k) => ({ ...k, label: e.target.value }))} aria-label="Class name" />
              </span>
              <span>
                <input className={`${styles.input} ${styles.flat}`} type="number" value={c.minCapital ?? ""} placeholder="None" onChange={(e) => setClass(c.key, (k) => ({ ...k, minCapital: e.target.value === "" ? null : Number(e.target.value) }))} aria-label="Minimum capital" />
              </span>
              {FEE_TYPES.map((t) => (
                <span key={t}>
                  <input className={`${styles.input} ${styles.flat}`} type="number" value={c.fees.find((f) => f.type === t)?.amount ?? ""} placeholder="—" onChange={(e) => setFee(c, t, e.target.value)} aria-label={`${t} fee`} />
                </span>
              ))}
              <span className={styles.rowActions}>
                <button type="button" className={styles.linkBtn} onClick={() => ctx.patchProgramme(p.id, (x) => ({ ...x, classes: x.classes.filter((k) => k.key !== c.key) }), `Removed licence class “${c.label}”`)}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.actionsRow}>
        <button className={styles.secondary} type="button" onClick={() => ctx.patchProgramme(p.id, (x) => x, `Published licence classes and fees for ${p.name} to the Apply pages`)}>Publish classes and fees to Apply</button>
      </div>
    </>
  );
}

function Requirements({ ctx }: { ctx: Ctx }) {
  const p = ctx.prog!;
  const [phase, setPhase] = useState("");
  const [newPhase, setNewPhase] = useState("");
  const [title, setTitle] = useState("");
  const [drawer, setDrawer] = useState("generic_upload");
  const [route, setRoute] = useState("");
  const [guidance, setGuidance] = useState("");
  const [filter, setFilter] = useState("all");
  const routes = useMemo(() => Array.from(new Set(p.requirements.map((r) => r.route).filter(Boolean))), [p.requirements]);
  const activePhase = phase || p.phases[0] || "";

  const patch = (id: string, ch: Partial<Requirement>, msg = "") =>
    ctx.patchProgramme(p.id, (x) => ({ ...x, requirements: x.requirements.map((r) => (r.id === id ? { ...r, ...ch } : r)) }), msg);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const ph = newPhase.trim() ? slug(newPhase) : activePhase;
    if (!title.trim() || !ph) return;
    const id = `${slug(p.id).toUpperCase().slice(0, 3)}-${String(p.requirements.length + 1).padStart(2, "0")}`;
    ctx.patchProgramme(p.id, (x) => ({
      ...x,
      phases: x.phases.includes(ph) ? x.phases : [...x.phases, ph],
      requirements: [...x.requirements, { id, phase: ph, title: title.trim(), drawer, route, guidance, mandatory: true }],
    }), `Added application requirement “${title.trim()}” (${pretty(ph)}) to ${p.name}`);
    setTitle(""); setGuidance(""); setNewPhase(""); setPhase(ph);
  }

  return (
    <>
      <p className={styles.lead}>
        The checklist an applicant works through, grouped into phases. The <em>screen</em> decides which upload or form the applicant gets,
        and <em>route</em> limits a requirement to one licence route.
      </p>
      <form className={styles.form} onSubmit={add}>
        <h3>Add a requirement</h3>
        <div className={styles.formGrid}>
          <label>Phase
            <select className={styles.input} value={activePhase} onChange={(e) => setPhase(e.target.value)} disabled={!!newPhase.trim()}>
              {p.phases.map((ph) => <option key={ph} value={ph}>{pretty(ph)}</option>)}
            </select>
          </label>
          <label>…or a new phase<input className={styles.input} value={newPhase} onChange={(e) => setNewPhase(e.target.value)} placeholder="e.g. Trading systems" /></label>
          <label className={styles.span2}>Requirement<input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Provide the compliance officer’s CV" required /></label>
          <label>Screen the applicant gets
            <select className={styles.input} value={drawer} onChange={(e) => setDrawer(e.target.value)}>
              {DRAWER_TYPES.map((d) => <option key={d} value={d}>{pretty(d)}</option>)}
            </select>
          </label>
          <label>Route (blank = every route)<input className={styles.input} value={route} onChange={(e) => setRoute(e.target.value)} list="routes" placeholder="e.g. broker" /></label>
          <datalist id="routes">{routes.map((r) => <option key={r} value={r} />)}</datalist>
          <label className={styles.span2}>Guidance the applicant sees<textarea className={styles.textarea} value={guidance} onChange={(e) => setGuidance(e.target.value)} /></label>
        </div>
        <div className={styles.actionsRow}><button className={styles.primary} type="submit">Add requirement</button></div>
      </form>

      <div className={styles.toolbar}>
        <select className={styles.input} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Phase filter">
          <option value="all">All phases</option>
          {p.phases.map((ph) => <option key={ph} value={ph}>{pretty(ph)}</option>)}
        </select>
        <span className={styles.count}>{p.requirements.filter((r) => filter === "all" || r.phase === filter).length} requirements</span>
      </div>
      {p.requirements.length === 0 ? (
        <Empty>No requirements yet. An applicant would see an empty checklist.</Empty>
      ) : (
        <div className={styles.table} role="table">
          <div className={`${styles.tr} ${styles.th} ${styles.trReq}`} role="row">
            <span>Ref</span><span>Requirement and guidance</span><span>Phase</span><span>Screen</span><span>Route</span><span></span>
          </div>
          {p.requirements.filter((r) => filter === "all" || r.phase === filter).slice(0, 60).map((r) => (
            <div key={r.id} className={`${styles.tr} ${styles.trReq}`} role="row">
              <span className={styles.mono}>{r.id}</span>
              <span>
                <input className={`${styles.input} ${styles.flat}`} value={r.title} onChange={(e) => patch(r.id, { title: e.target.value })} aria-label="Requirement" />
                <textarea className={`${styles.textarea} ${styles.miniTa}`} value={r.guidance} placeholder="Guidance the applicant sees…" onChange={(e) => patch(r.id, { guidance: e.target.value })} />
              </span>
              <span>{pretty(r.phase)}</span>
              <span>
                <select className={`${styles.input} ${styles.flat}`} value={r.drawer} onChange={(e) => patch(r.id, { drawer: e.target.value })}>
                  {DRAWER_TYPES.map((d) => <option key={d} value={d}>{pretty(d)}</option>)}
                </select>
              </span>
              <span><input className={`${styles.input} ${styles.flat}`} value={r.route} placeholder="All" onChange={(e) => patch(r.id, { route: e.target.value })} aria-label="Route" /></span>
              <span className={styles.rowActions}>
                <button type="button" className={styles.linkBtn} onClick={() => ctx.patchProgramme(p.id, (x) => x, `Published guidance for ${r.id} “${r.title}” to Apply`)}>Publish</button>
                <button type="button" className={styles.linkBtn} onClick={() => ctx.patchProgramme(p.id, (x) => ({ ...x, requirements: x.requirements.filter((q) => q.id !== r.id) }), `Removed requirement ${r.id} “${r.title}”`)}>Remove</button>
              </span>
            </div>
          ))}
          {p.requirements.length > 60 && filter === "all" && <p className={styles.more}>Showing the first 60. Pick a phase to see the rest.</p>}
        </div>
      )}
    </>
  );
}

function Preview({ ctx }: { ctx: Ctx }) {
  const p = ctx.prog!;
  const [classKey, setClassKey] = useState("");
  const cls = p.classes.find((c) => c.key === classKey) ?? p.classes[0];
  const routes = Array.from(new Set(p.requirements.map((r) => r.route).filter(Boolean)));
  const autoRoute = cls && routes.includes(cls.key) ? cls.key : "";
  const [route, setRoute] = useState<string | null>(null);
  const activeRoute = route ?? autoRoute;
  const shown = p.requirements.filter((r) => !r.route || !activeRoute || r.route === activeRoute);
  return (
    <>
      <div className={styles.viewBanner}>
        <div>
          <strong>This is what an applicant sees</strong>
          <span>Apply → {p.name}. Built only from the classes, fees and requirements you entered.</span>
        </div>
        <select className={styles.input} value={cls?.key ?? ""} onChange={(e) => { setClassKey(e.target.value); setRoute(null); }} aria-label="Licence class">
          {p.classes.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      {!cls ? <Empty>Add a licence class first.</Empty> : (
        <div className={styles.memberFrame}>
          <p className={styles.eyebrow}>YOUR LICENCE ROUTE</p>
          <h2 className={styles.h2}>{cls.label}</h2>
          <div className={styles.kvRow}>
            <span><small>Minimum paid-up capital</small><b>{money(cls.minCapital)}</b></span>
            {FEE_TYPES.map((t) => (
              <span key={t}><small>{pretty(t)} fee</small><b>{money(cls.fees.find((f) => f.type === t)?.amount)}</b></span>
            ))}
          </div>
          {routes.length > 0 && (
            <div className={styles.toolbar}>
              <button type="button" className={`${styles.chip} ${activeRoute === "" ? styles.chipOn : ""}`} onClick={() => setRoute("")}>All routes</button>
              {routes.map((r) => <button key={r} type="button" className={`${styles.chip} ${activeRoute === r ? styles.chipOn : ""}`} onClick={() => setRoute(r)}>{pretty(r)}</button>)}
            </div>
          )}
          {p.phases.map((ph) => {
            const rows = shown.filter((r) => r.phase === ph);
            if (!rows.length) return null;
            return (
              <div key={ph} className={styles.phaseBlock}>
                <h3>{pretty(ph)} <small>{rows.length} steps</small></h3>
                {rows.map((r) => (
                  <div key={r.id} className={styles.checkRow}>
                    <span className={styles.box} aria-hidden="true"></span>
                    <span><b>{r.title}</b>{r.guidance && <small>{r.guidance}</small>}<em>{pretty(r.drawer)}</em></span>
                  </div>
                ))}
              </div>
            );
          })}
          {shown.length === 0 && <Empty>No requirements for this route yet.</Empty>}
        </div>
      )}
    </>
  );
}
