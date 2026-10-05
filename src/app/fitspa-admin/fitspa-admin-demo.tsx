"use client";

import { useMemo, useState } from "react";
import styles from "./fitspa-admin.module.css";
import paymentsCatalog from "@/data/payments-comply-catalog.json";
import dlCatalog from "@/data/digital-lending/obligations.json";

type ModuleKey = "payments" | "digital_lending";
type Tab = "overview" | "obligations" | "deadlines" | "requirements" | "members" | "memberview" | "activity";

interface Obligation {
  key: string;
  id: string;
  module: ModuleKey;
  title: string;
  group: string;
  applies: string;
  type: string;
  source: string;
  guidance: string;
  evidence: string;
  due: string; // ISO date set by FITSPA, "" when none
  status: "active" | "retired";
  custom: boolean; // created by FITSPA in this session
  edited: boolean; // changed by FITSPA in this session
  audience: string[]; // custom obligations only: member ids, [] = every member of the module
}

interface Member {
  id: string;
  name: string;
  module: ModuleKey;
  profile: string;
  match: (o: Obligation) => boolean;
  done: number; // sample completion count, as reported by the member workspace
  overdue: number;
  lastActive: string;
}

const PAYMENTS_ROWS = paymentsCatalog as Array<Record<string, any>>;
const DL_ROWS = dlCatalog as Array<Record<string, any>>;

function seedObligations(): Obligation[] {
  const pay: Obligation[] = PAYMENTS_ROWS.map((r) => ({
    key: `P:${r.id}`,
    id: r.id,
    module: "payments",
    title: r.requirement,
    group: r.group,
    applies: r.applies,
    type: r.type,
    source: r.source,
    guidance: r.meaning ?? "",
    evidence: r.evidence ?? "",
    due: "",
    status: "active",
    custom: false,
    edited: false,
    audience: [],
  }));
  const dl: Obligation[] = DL_ROWS.map((r) => ({
    key: `D:${r.ID}`,
    id: r.ID,
    module: "digital_lending",
    title: r.Obligation,
    group: r.domainLabel ?? r.domain ?? "",
    applies: r["Applies to"] ?? "",
    type: r.Behaviour ?? "",
    source: r["Source / provision"] ?? "",
    guidance: r.guide?.what ?? "",
    evidence: r.guide?.keep ?? "",
    due: "",
    status: "active",
    custom: false,
    edited: false,
    audience: [],
  }));
  // A few regulator-set dates so the Deadlines tab and member Calendar are not empty.
  const seededDue: Record<string, string> = { "P:GEN-01": "", };
  return [...pay, ...dl].map((o) => ({ ...o, due: seededDue[o.key] ?? "" }));
}

const MEMBERS: Member[] = [
  {
    id: "m1",
    name: "Sample Pay Ltd",
    module: "payments",
    profile: "Payments · Payment service provider using agents",
    match: (o) => /All NPS|Payment service provider|agents/i.test(o.applies) && !/Electronic money issuer/i.test(o.applies),
    done: 21, overdue: 2, lastActive: "Today",
  },
  {
    id: "m2",
    name: "Sample E-Money Ltd",
    module: "payments",
    profile: "Payments · Electronic money issuer",
    match: (o) => /All NPS|Electronic money|Stored-value/i.test(o.applies),
    done: 34, overdue: 0, lastActive: "Yesterday",
  },
  {
    id: "m3",
    name: "Sample Switch PSO",
    module: "payments",
    profile: "Payments · Payment system operator",
    match: (o) => /All NPS|Payment system operator|participant/i.test(o.applies),
    done: 12, overdue: 1, lastActive: "3 days ago",
  },
  {
    id: "m4",
    name: "Sample Credit (Money Lender)",
    module: "digital_lending",
    profile: "Digital lending · Money Lender",
    match: (o) => /^(Both|Money Lender)/i.test(o.applies),
    done: 40, overdue: 3, lastActive: "Today",
  },
  {
    id: "m5",
    name: "Sample Microfinance (NDTMFI)",
    module: "digital_lending",
    profile: "Digital lending · NDTMFI",
    match: (o) => /^(Both|NDTMFI)/i.test(o.applies),
    done: 28, overdue: 0, lastActive: "2 days ago",
  },
];

const REQUIREMENTS = [
  { id: "C02", route: "Payments · all routes", title: "Company documents", guidance: "Corporate records that establish legal existence, constitutional documents, current ownership and governance information, certified where required." },
  { id: "C05", route: "Payments · all routes", title: "Board resolution", guidance: "Resolution authorising the application and identifying the licence category or categories being applied for." },
  { id: "F02", route: "Payments · PSO / PSP", title: "Form A", guidance: "Prescribed application form for a Payment System Operator and/or Payment Service Provider, commissioned before upload." },
  { id: "F04", route: "Payments · all routes", title: "Fit & Proper Form B", guidance: "A completed and commissioned Form B for every person included in the fit-and-proper vetting process." },
  { id: "B03", route: "Payments · all routes", title: "Business plan & financial projections", guidance: "Three-year business plan with supporting financial projections, capital implications and projected balance sheet." },
  { id: "B07", route: "Payments · all routes", title: "Minimum paid-up capital", guidance: "Evidence that the applicant holds at least the minimum paid-up capital for the selected licence route." },
  { id: "T07", route: "Payments · electronic platforms", title: "Penetration testing", guidance: "Pre-application penetration test report with remediation evidence or status for material findings." },
  { id: "A01", route: "Payments · all routes", title: "AML/CFT Policy", guidance: "How the applicant prevents, identifies, monitors, escalates and reports money-laundering and terrorist-financing risk." },
  { id: "DL-01", route: "Digital lending · Money Lender", title: "Money lender application form", guidance: "Completed application form with the applicant's business and ownership details." },
  { id: "DL-07", route: "Digital lending · NDTMFI", title: "Capital adequacy evidence", guidance: "Evidence of paid-up capital and the prudential capital position for the NDTMFI route." },
];

const REGULATORS = [
  { name: "Bank of Uganda", match: /Bank of Uganda|BoU|National Payment Systems|NPS/i },
  { name: "Uganda Microfinance Regulatory Authority (UMRA)", match: /UMRA|Money Lender|NDT|Tier 4/i },
  { name: "Personal Data Protection Office (PDPO)", match: /PDPO|Data Protection|Privacy/i },
  { name: "Financial Intelligence Authority (FIA)", match: /FIA|AML|Financial Intelligence/i },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "obligations", label: "Obligations" },
  { key: "deadlines", label: "Deadlines" },
  { key: "requirements", label: "Licence requirements" },
  { key: "members", label: "Members" },
  { key: "memberview", label: "Member view" },
  { key: "activity", label: "Activity" },
];

interface LogEntry {
  at: string;
  text: string;
}

export default function FitspaAdminDemo() {
  const [tab, setTab] = useState<Tab>("overview");
  const [obligations, setObligations] = useState<Obligation[]>(seedObligations);
  const [requirements, setRequirements] = useState(REQUIREMENTS);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [moduleFilter, setModuleFilter] = useState<"all" | ModuleKey>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "retired" | "changed">("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewMemberId, setViewMemberId] = useState("m1");
  const [viewChip, setViewChip] = useState<"all" | "fitspa" | "due">("all");
  const [viewQuery, setViewQuery] = useState("");
  const [toast, setToast] = useState("");

  function record(text: string) {
    setLog((l) => [{ at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), text }, ...l]);
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  }

  function patch(key: string, change: Partial<Obligation>, message: string) {
    setObligations((rows) => rows.map((o) => (o.key === key ? { ...o, ...change, edited: o.custom ? o.edited : true } : o)));
    record(message);
  }

  function reset() {
    setObligations(seedObligations());
    setRequirements(REQUIREMENTS);
    setLog([]);
    setEditing(null);
    setAdding(false);
    setToast("");
  }

  const counts = useMemo(() => {
    const active = obligations.filter((o) => o.status === "active").length;
    return {
      total: obligations.length,
      active,
      retired: obligations.length - active,
      changed: obligations.filter((o) => o.custom || o.edited).length,
      withDue: obligations.filter((o) => o.due && o.status === "active").length,
    };
  }, [obligations]);

  function applicableTo(m: Member, o: Obligation) {
    if (o.module !== m.module || o.status !== "active") return false;
    if (o.custom) return o.audience.length === 0 || o.audience.includes(m.id);
    return m.match(o);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return obligations.filter((o) => {
      if (moduleFilter !== "all" && o.module !== moduleFilter) return false;
      if (statusFilter === "active" && o.status !== "active") return false;
      if (statusFilter === "retired" && o.status !== "retired") return false;
      if (statusFilter === "changed" && !(o.custom || o.edited)) return false;
      if (q && !`${o.id} ${o.title} ${o.group} ${o.type} ${o.applies}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [obligations, moduleFilter, statusFilter, query]);

  const viewMember = MEMBERS.find((m) => m.id === viewMemberId) ?? MEMBERS[0];
  const memberRows = useMemo(() => {
    const q = viewQuery.trim().toLowerCase();
    return obligations
      .filter((o) => applicableTo(viewMember, o))
      .filter((o) => (viewChip === "fitspa" ? o.custom || o.edited : viewChip === "due" ? !!o.due : true))
      .filter((o) => !q || `${o.id} ${o.title} ${o.group} ${o.type}`.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obligations, viewMember, viewChip, viewQuery]);

  const deadlines = useMemo(
    () => obligations.filter((o) => o.due && o.status === "active").sort((a, b) => a.due.localeCompare(b.due)),
    [obligations]
  );

  const editRow = obligations.find((o) => o.key === editing) ?? null;

  return (
    <div className={styles.root}>
      <div className={styles.demoBar} role="note">
        <strong>Demonstration</strong>
        <span>
          No login is needed here and no live data is touched. This runs on the published obligation catalogue and five sample
          members; changes live only in this browser tab.
        </span>
        <button type="button" className={styles.linkBtn} onClick={reset}>
          Reset demo
        </button>
      </div>

      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>FITSPA ADMIN</p>
          <h1 className={styles.title}>Manage every obligation, in one place.</h1>
          <p className={styles.dek}>
            FITSPA owns the obligation catalogue. When it is changed here, it changes on every member&rsquo;s Comply pages.
            Try it: edit, retire or add an obligation, then open <em>Member view</em>.
          </p>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
            {t.key === "activity" && log.length > 0 ? <span className={styles.badge}>{log.length}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className={styles.panel}>
          <div className={styles.stats}>
            <Stat n={counts.active} label="Active obligations" note={`${counts.total} in the catalogue`} />
            <Stat n={counts.retired} label="Retired" note="Hidden from members" />
            <Stat n={counts.changed} label="Changed this session" note="Shown to members as updated" />
            <Stat n={MEMBERS.length} label="Sample members" note="Payments and digital lending" />
          </div>

          <h2 className={styles.h2}>How it works</h2>
          <ol className={styles.flow}>
            <li>
              <b>FITSPA manages</b>
              <span>Add, edit, retire and date obligations in the Obligations and Deadlines tabs.</span>
            </li>
            <li>
              <b>Members see it</b>
              <span>Each member&rsquo;s Comply Obligations and Calendar update for their licence profile.</span>
            </li>
            <li>
              <b>Members act</b>
              <span>They confirm, upload evidence and ask experts for help from their own workspace.</span>
            </li>
            <li>
              <b>FITSPA oversees</b>
              <span>Completion and overdue counts per member roll back up in the Members tab.</span>
            </li>
          </ol>

          <h2 className={styles.h2}>Regulators covered</h2>
          <div className={styles.cards}>
            {REGULATORS.map((r) => {
              const n = obligations.filter((o) => o.status === "active" && r.match.test(`${o.source} ${o.group} ${o.applies}`)).length;
              return (
                <div key={r.name} className={styles.card}>
                  <strong>{r.name}</strong>
                  <span>{n} active obligations reference this regulator</span>
                </div>
              );
            })}
          </div>
          <div className={styles.actionsRow}>
            <button className={styles.primary} type="button" onClick={() => { setTab("obligations"); setAdding(true); }}>
              Add an obligation
            </button>
            <button className={styles.secondary} type="button" onClick={() => setTab("memberview")}>
              See what members see
            </button>
          </div>
        </section>
      )}

      {tab === "obligations" && (
        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <input className={styles.input} placeholder="Search obligations…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className={styles.input} value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as any)}>
              <option value="all">All modules</option>
              <option value="payments">Payments</option>
              <option value="digital_lending">Digital lending</option>
            </select>
            <select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
              <option value="changed">Changed by FITSPA</option>
            </select>
            <button className={styles.primary} type="button" onClick={() => { setAdding(true); setEditing(null); }}>
              + Add obligation
            </button>
          </div>
          <p className={styles.count}>{filtered.length} of {obligations.length} obligations</p>

          {adding && (
            <ObligationForm
              title="Add an obligation"
              initial={null}
              onCancel={() => setAdding(false)}
              onSave={(v) => {
                const key = `X:${Date.now()}`;
                setObligations((rows) => [
                  {
                    key, id: v.id || "NEW", module: v.module, title: v.title, group: v.group || "FITSPA-added",
                    applies: v.audience.length ? "Selected members" : "All members in this module", type: v.type,
                    source: v.source || "FITSPA guidance", guidance: v.guidance, evidence: v.evidence, due: v.due,
                    status: "active", custom: true, edited: false, audience: v.audience,
                  },
                  ...rows,
                ]);
                setAdding(false);
                record(`Added obligation “${v.title}” — now visible to ${v.audience.length ? "selected" : "all"} ${v.module === "payments" ? "payments" : "digital lending"} members`);
              }}
            />
          )}

          {editRow && (
            <ObligationForm
              title={`Edit ${editRow.id}`}
              initial={editRow}
              onCancel={() => setEditing(null)}
              onSave={(v) => {
                patch(editRow.key, { title: v.title, type: v.type, source: v.source, guidance: v.guidance, evidence: v.evidence, due: v.due }, `Updated ${editRow.id} “${v.title}”`);
                setEditing(null);
              }}
            />
          )}

          <div className={styles.table} role="table">
            <div className={`${styles.tr} ${styles.th}`} role="row">
              <span>ID</span><span>Obligation</span><span>Module</span><span>Next due</span><span>Status</span><span></span>
            </div>
            {filtered.slice(0, 80).map((o) => (
              <div key={o.key} className={`${styles.tr} ${o.status === "retired" ? styles.retired : ""}`} role="row">
                <span className={styles.mono}>{o.id}</span>
                <span>
                  <b>{o.title}</b>
                  <small>{o.group} · {o.type}</small>
                  {(o.custom || o.edited) && <em className={styles.flag}>{o.custom ? "Added by FITSPA" : "Updated by FITSPA"}</em>}
                </span>
                <span>{o.module === "payments" ? "Payments" : "Digital lending"}</span>
                <span>{fmtDate(o.due)}</span>
                <span><i className={`${styles.pill} ${o.status === "active" ? styles.pillOn : styles.pillOff}`}>{o.status === "active" ? "Active" : "Retired"}</i></span>
                <span className={styles.rowActions}>
                  <button type="button" className={styles.linkBtn} onClick={() => { setEditing(o.key); setAdding(false); }}>Edit</button>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => patch(o.key, { status: o.status === "active" ? "retired" : "active" }, `${o.status === "active" ? "Retired" : "Reactivated"} ${o.id} “${o.title}”`)}
                  >
                    {o.status === "active" ? "Retire" : "Reactivate"}
                  </button>
                </span>
              </div>
            ))}
            {filtered.length > 80 && <p className={styles.more}>Showing the first 80. Use search or filters to narrow the list.</p>}
          </div>
        </section>
      )}

      {tab === "deadlines" && (
        <section className={styles.panel}>
          <p className={styles.lead}>Set the regulator due date for an obligation. It appears on each applicable member&rsquo;s Calendar and Home list.</p>
          <div className={styles.setDue}>
            <DueSetter
              options={obligations.filter((o) => o.status === "active")}
              onSet={(o, date) => patch(o.key, { due: date }, `Set due date ${fmtDate(date)} on ${o.id} “${o.title}”`)}
            />
          </div>
          <div className={styles.table} role="table">
            <div className={`${styles.tr} ${styles.th} ${styles.trDue}`} role="row">
              <span>Due</span><span>Obligation</span><span>Module</span><span></span>
            </div>
            {deadlines.length === 0 && <p className={styles.empty}>No dates set yet. Pick an obligation above and give it a due date.</p>}
            {deadlines.map((o) => (
              <div key={o.key} className={`${styles.tr} ${styles.trDue}`} role="row">
                <span><b>{fmtDate(o.due)}</b></span>
                <span><b>{o.title}</b><small>{o.id} · {o.type}</small></span>
                <span>{o.module === "payments" ? "Payments" : "Digital lending"}</span>
                <span className={styles.rowActions}>
                  <button type="button" className={styles.linkBtn} onClick={() => patch(o.key, { due: "" }, `Cleared due date on ${o.id}`)}>Clear</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "requirements" && (
        <section className={styles.panel}>
          <p className={styles.lead}>The licence requirement guidance members see in the Apply checklists. A sample of the full set.</p>
          <div className={styles.cards}>
            {requirements.map((r) => (
              <div key={r.id} className={styles.card}>
                <small className={styles.mono}>{r.id} · {r.route}</small>
                <strong>{r.title}</strong>
                <textarea
                  className={styles.textarea}
                  value={r.guidance}
                  onChange={(e) => setRequirements((rs) => rs.map((x) => (x.id === r.id ? { ...x, guidance: e.target.value } : x)))}
                />
                <button type="button" className={styles.linkBtn} onClick={() => record(`Published updated Apply guidance for ${r.id} “${r.title}”`)}>
                  Publish to Apply
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "members" && (
        <section className={styles.panel}>
          <p className={styles.lead}>Every member sees the obligations FITSPA has published for their licence profile. These counts update as you change the catalogue.</p>
          <div className={styles.table} role="table">
            <div className={`${styles.tr} ${styles.th} ${styles.trMem}`} role="row">
              <span>Member</span><span>Profile</span><span>Obligations</span><span>Done</span><span>Overdue</span><span>Last active</span><span></span>
            </div>
            {MEMBERS.map((m) => {
              const n = obligations.filter((o) => applicableTo(m, o)).length;
              return (
                <div key={m.id} className={`${styles.tr} ${styles.trMem}`} role="row">
                  <span><b>{m.name}</b></span>
                  <span>{m.profile}</span>
                  <span><b>{n}</b></span>
                  <span>{Math.min(m.done, n)}</span>
                  <span className={m.overdue ? styles.warn : ""}>{m.overdue}</span>
                  <span>{m.lastActive}</span>
                  <span className={styles.rowActions}>
                    <button type="button" className={styles.linkBtn} onClick={() => { setViewMemberId(m.id); setTab("memberview"); }}>View as member</button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "memberview" && (
        <section className={styles.panel}>
          <div className={styles.viewBanner}>
            <div>
              <strong>This is what the member sees</strong>
              <span>Comply → Obligations for the selected sample member. It reads the same catalogue you edit here.</span>
            </div>
            <select className={styles.input} value={viewMemberId} onChange={(e) => setViewMemberId(e.target.value)} aria-label="Sample member">
              {MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.memberFrame}>
            <p className={styles.eyebrow}>{viewMember.profile.toUpperCase()}</p>
            <h2 className={styles.h2}>Your compliance universe</h2>
            <div className={styles.toolbar}>
              <input className={styles.input} placeholder="Search obligations…" value={viewQuery} onChange={(e) => setViewQuery(e.target.value)} />
              {([["all", "All"], ["fitspa", "Updated by FITSPA"], ["due", "With a due date"]] as const).map(([k, label]) => (
                <button key={k} type="button" className={`${styles.chip} ${viewChip === k ? styles.chipOn : ""}`} onClick={() => setViewChip(k)}>{label}</button>
              ))}
            </div>
            <p className={styles.count}>{memberRows.length} obligations apply to {viewMember.name}</p>
            <div className={styles.memberList}>
              {memberRows.slice(0, 60).map((o) => (
                <article key={o.key} className={styles.memberRow}>
                  <div>
                    <b>{o.title}</b>
                    <small>{o.group} · {o.type}</small>
                    {o.guidance && <p>{o.guidance.length > 170 ? `${o.guidance.slice(0, 170)}…` : o.guidance}</p>}
                  </div>
                  <div className={styles.memberMeta}>
                    {(o.custom || o.edited) && <em className={styles.flag}>{o.custom ? "New from FITSPA" : "Updated by FITSPA"}</em>}
                    <span>{o.due ? `Due ${fmtDate(o.due)}` : "No fixed date"}</span>
                  </div>
                </article>
              ))}
              {memberRows.length === 0 && <p className={styles.empty}>Nothing matches. Reactivate an obligation or clear the filters.</p>}
              {memberRows.length > 60 && <p className={styles.more}>Showing the first 60 of {memberRows.length}.</p>}
            </div>
          </div>
        </section>
      )}

      {tab === "activity" && (
        <section className={styles.panel}>
          {log.length === 0 ? (
            <p className={styles.empty}>No changes yet. Anything you change in this demo is listed here with the time.</p>
          ) : (
            <ul className={styles.log}>
              {log.map((l, i) => (
                <li key={i}><time>{l.at}</time><span>FITSPA Admin (demo)</span><p>{l.text}</p></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
  );
}

function Stat({ n, label, note }: { n: number; label: string; note: string }) {
  return (
    <div className={styles.stat}>
      <b>{n}</b>
      <span>{label}</span>
      <small>{note}</small>
    </div>
  );
}

function DueSetter({ options, onSet }: { options: Obligation[]; onSet: (o: Obligation, date: string) => void }) {
  const [key, setKey] = useState("");
  const [date, setDate] = useState(today());
  const picked = options.find((o) => o.key === key);
  return (
    <div className={styles.toolbar}>
      <select className={`${styles.input} ${styles.grow}`} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Obligation">
        <option value="">Choose an obligation…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.id} — {o.title.slice(0, 70)}</option>
        ))}
      </select>
      <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className={styles.primary} type="button" disabled={!picked || !date} onClick={() => picked && onSet(picked, date)}>
        Set due date
      </button>
    </div>
  );
}

interface FormValues {
  id: string; module: ModuleKey; title: string; group: string; type: string; source: string;
  guidance: string; evidence: string; due: string; audience: string[];
}

function ObligationForm({
  title, initial, onSave, onCancel,
}: {
  title: string;
  initial: Obligation | null;
  onSave: (v: FormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<FormValues>({
    id: initial?.id ?? "", module: initial?.module ?? "payments", title: initial?.title ?? "", group: initial?.group ?? "",
    type: initial?.type ?? "Regulatory return", source: initial?.source ?? "", guidance: initial?.guidance ?? "",
    evidence: initial?.evidence ?? "", due: initial?.due ?? "", audience: initial?.audience ?? [],
  });
  const set = (k: keyof FormValues, val: any) => setV((x) => ({ ...x, [k]: val }));
  const isNew = initial === null;
  const modMembers = MEMBERS.filter((m) => m.module === v.module);
  return (
    <form
      className={styles.form}
      onSubmit={(e) => { e.preventDefault(); if (v.title.trim()) onSave(v); }}
    >
      <h3>{title}</h3>
      <div className={styles.formGrid}>
        {isNew && (
          <label>Module
            <select className={styles.input} value={v.module} onChange={(e) => { set("module", e.target.value); set("audience", []); }}>
              <option value="payments">Payments</option>
              <option value="digital_lending">Digital lending</option>
            </select>
          </label>
        )}
        {isNew && <label>Reference<input className={styles.input} value={v.id} onChange={(e) => set("id", e.target.value)} placeholder="e.g. GEN-99" /></label>}
        <label className={styles.span2}>Obligation<input className={styles.input} value={v.title} onChange={(e) => set("title", e.target.value)} required /></label>
        <label>Type
          <select className={styles.input} value={v.type} onChange={(e) => set("type", e.target.value)}>
            {["Regulatory return", "Prior approval", "Continuous control", "Event-driven notification", "Annual filing", "Governance control"].map((t) => <option key={t}>{t}</option>)}
            {!["Regulatory return", "Prior approval", "Continuous control", "Event-driven notification", "Annual filing", "Governance control"].includes(v.type) && <option>{v.type}</option>}
          </select>
        </label>
        <label>Source<input className={styles.input} value={v.source} onChange={(e) => set("source", e.target.value)} placeholder="Act, regulation or regulator notice" /></label>
        <label>Next due date<input className={styles.input} type="date" value={v.due} onChange={(e) => set("due", e.target.value)} /></label>
        <label className={styles.span2}>Guidance members see<textarea className={styles.textarea} value={v.guidance} onChange={(e) => set("guidance", e.target.value)} /></label>
        <label className={styles.span2}>Evidence to keep<input className={styles.input} value={v.evidence} onChange={(e) => set("evidence", e.target.value)} /></label>
        {isNew && (
          <fieldset className={styles.span2}>
            <legend>Who it applies to</legend>
            <label className={styles.check}><input type="checkbox" checked={v.audience.length === 0} onChange={() => set("audience", [])} />All {v.module === "payments" ? "payments" : "digital lending"} members</label>
            {modMembers.map((m) => (
              <label key={m.id} className={styles.check}>
                <input type="checkbox" checked={v.audience.includes(m.id)}
                  onChange={(e) => set("audience", e.target.checked ? [...v.audience, m.id] : v.audience.filter((a) => a !== m.id))} />
                {m.name}
              </label>
            ))}
          </fieldset>
        )}
      </div>
      <div className={styles.actionsRow}>
        <button className={styles.primary} type="submit">{isNew ? "Publish to members" : "Save and publish"}</button>
        <button className={styles.secondary} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
