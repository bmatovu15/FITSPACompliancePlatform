"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./digital-credit-pathway.module.css";

export type YesNoCond = "Yes" | "No" | "Conditional";

export type DigitalCreditItem = {
  id: string;
  seq: number;
  phase: string;
  type: string;
  requirement: string;
  meaning: string;
  money_lender: YesNoCond;
  ndt_mfi: YesNoCond;
  timing: string | null;
  evidence: string | null;
  level: string | null;
  source: string | null;
  source_link: string | null;
  condition: string | null;
};

export type DigitalCreditFee = {
  id: string;
  sort_order: number;
  route: string;
  event: string;
  amount: number;
  status: string | null;
  note: string | null;
  source: string | null;
  source_link: string | null;
};

type Screen = "landing" | "wizard" | "app";
type Status = "not_started" | "in_progress" | "done" | "na";
type Filter = "all" | "not_started" | "in_progress" | "done" | "conditional";
type Tab = "checklist" | "fees" | "notes";

type PathwayState = {
  routes: { money_lender: boolean; ndt_mfi: boolean };
  pathwaySet: boolean;
  statuses: Record<string, Status>;
  notes: Record<string, string>;
  activePhase: string | null;
  activeFilter: Filter;
  searchTerm: string;
};

const STORAGE_KEY = "dc_pathway_state_v1";

const ROUTE_LABEL: Record<string, string> = {
  money_lender: "Money lender",
  ndt_mfi: "NDT microfinance institution",
};

function defaultState(): PathwayState {
  return {
    routes: { money_lender: false, ndt_mfi: false },
    pathwaySet: false,
    statuses: {},
    notes: {},
    activePhase: null,
    activeFilter: "all",
    searchTerm: "",
  };
}

function loadState(): PathwayState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const d = defaultState();
    return {
      ...d,
      ...parsed,
      routes: { ...d.routes, ...(parsed.routes || {}) },
      statuses: parsed.statuses || {},
      notes: parsed.notes || {},
    };
  } catch {
    return defaultState();
  }
}

function fmtUGX(n: number) {
  if (n === 0) return "Nil";
  return "UGX " + n.toLocaleString("en-US");
}

type Trigger = { label: string; value: string };

// Optional copy overrides sourced from the new `pathway_regulators` table
// (falls back to the values already hardcoded below when a field is null/
// absent, so nothing breaks if it hasn't been filled in yet).
export type DigitalCreditPathwayCopy = {
  heroStats?: { value: string; label: string }[] | null;
  wizardTitle?: string | null;
  wizardNote?: string | null;
  routesHeading?: string | null;
  routesNote?: string | null;
  feesNote?: string | null;
};

export default function DigitalCreditPathwayClient({
  items,
  fees,
  isLoggedIn,
  copy,
}: {
  items: DigitalCreditItem[];
  fees: DigitalCreditFee[];
  isLoggedIn?: boolean;
  copy?: DigitalCreditPathwayCopy;
}) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [state, setState] = useState<PathwayState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("checklist");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Public, no-login tool -- localStorage-only persistence, same model as
  // the NPS pathway and the original prototype.
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [state, hydrated]);

  const phases = useMemo(() => {
    const out: string[] = [];
    items.forEach((it) => {
      if (!out.includes(it.phase)) out.push(it.phase);
    });
    return out;
  }, [items]);

  function patch(next: Partial<PathwayState>) {
    setState((s) => ({ ...s, ...next }));
  }

  function routeColumnsForState(): { key: string; label: string; column: keyof DigitalCreditItem }[] {
    const cols: { key: string; label: string; column: keyof DigitalCreditItem }[] = [];
    if (state.routes.money_lender) cols.push({ key: "money_lender", label: "Money lender", column: "money_lender" });
    if (state.routes.ndt_mfi) cols.push({ key: "ndt_mfi", label: "NDT MFI", column: "ndt_mfi" });
    return cols;
  }

  function itemApplicability(item: DigitalCreditItem): Trigger[] {
    const cols = routeColumnsForState();
    const triggers: Trigger[] = [];
    cols.forEach((c) => {
      const v = item[c.column] as string;
      if (v && v !== "No") triggers.push({ label: c.label, value: v });
    });
    return triggers;
  }

  function strongestLevel(triggers: Trigger[]): string | null {
    if (triggers.some((t) => t.value === "Yes")) return "Yes";
    if (triggers.some((t) => t.value === "Conditional")) return "Conditional";
    return null;
  }

  const applicableItems = useMemo(() => {
    return items
      .map((item) => {
        const triggers = itemApplicability(item);
        return { item, triggers, level: strongestLevel(triggers) };
      })
      .filter((x) => x.level !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, state.routes]);

  function getStatus(id: string): Status {
    return state.statuses[id] || "not_started";
  }
  function setStatus(id: string, status: Status) {
    setState((s) => ({ ...s, statuses: { ...s.statuses, [id]: status } }));
  }
  function setNote(id: string, text: string) {
    setState((s) => ({ ...s, notes: { ...s.notes, [id]: text } }));
  }

  function routeSummaryText() {
    const parts: string[] = [];
    if (state.routes.money_lender) parts.push(ROUTE_LABEL.money_lender);
    if (state.routes.ndt_mfi) parts.push(ROUTE_LABEL.ndt_mfi);
    return parts.join("  +  ") || "No route selected";
  }

  function validateWizard() {
    return state.routes.money_lender || state.routes.ndt_mfi;
  }

  const overallProgress = useMemo(() => {
    const relevant = applicableItems.filter((x) => getStatus(x.item.id) !== "na");
    const done = relevant.filter((x) => getStatus(x.item.id) === "done").length;
    return relevant.length ? Math.round((100 * done) / relevant.length) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicableItems, state.statuses]);

  function restart() {
    if (typeof window !== "undefined" && !window.confirm("This clears your route selections and every status you have set. Continue?")) {
      return;
    }
    const d = defaultState();
    setState(d);
    setScreen("landing");
    setActiveTab("checklist");
  }

  if (!hydrated) {
    return <div className={styles.npsRoot} />;
  }

  return (
    <div className={styles.npsRoot}>
      {screen === "landing" && (
        <LandingScreen
          canResume={state.pathwaySet}
          isLoggedIn={!!isLoggedIn}
          onStart={() => setScreen("wizard")}
          onResume={() => setScreen("app")}
          copy={copy}
        />
      )}

      {screen === "wizard" && (
        <WizardScreen
          state={state}
          patch={patch}
          canBuild={validateWizard()}
          onBack={() => setScreen("landing")}
          onBuild={() => {
            patch({ pathwaySet: true });
            setScreen("app");
          }}
          copy={copy}
        />
      )}

      {screen === "app" && (
        <AppScreen
          state={state}
          patch={patch}
          items={items}
          fees={fees}
          phases={phases}
          applicableItems={applicableItems}
          overallProgress={overallProgress}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          expanded={expanded}
          setExpanded={setExpanded}
          getStatus={getStatus}
          setStatus={setStatus}
          setNote={setNote}
          routeSummaryText={routeSummaryText()}
          onEditPathway={() => setScreen("wizard")}
          onRestart={restart}
          copy={copy}
        />
      )}
    </div>
  );
}

const DEFAULT_HERO_STATS: { value: string; label: string }[] = [
  { value: "83", label: "requirement items mapped" },
  { value: "2", label: "licence routes covered" },
  { value: "10", label: "phases, route to launch" },
];

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

function LandingScreen({
  canResume,
  isLoggedIn,
  onStart,
  onResume,
  copy,
}: {
  canResume: boolean;
  isLoggedIn: boolean;
  onStart: () => void;
  onResume: () => void;
  copy?: DigitalCreditPathwayCopy;
}) {
  const heroStats = copy?.heroStats && copy.heroStats.length ? copy.heroStats : DEFAULT_HERO_STATS;
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>UMRA</div>
          <div>
            <span className={styles.brandTitle}>Digital Credit Licence Pathway</span>
            <span className={styles.brandSubtitle}>Application readiness map · Tier 4 digital lenders</span>
          </div>
        </div>
        {isLoggedIn && (
          <div className={styles["masthead-right"]}>
            <a className={styles["link-btn"]} href="/dashboard/compliance-pathway">
              Already licensed? Go to your Compliance Pathway Wizard →
            </a>
          </div>
        )}
      </header>

      <div className={styles["landing-wrap"]}>
        <section className={styles["landing-hero"]}>
          <div className={styles["hero-eyebrow"]}>
            TIER 4 MICROFINANCE INSTITUTIONS AND MONEY LENDERS ACT<span className={styles.divider}> · </span>PROTOTYPE FOR INTERNAL REVIEW
          </div>
          <h1 className={styles["hero-title"]}>Find out exactly what your digital credit licence needs.</h1>
          <p className={styles["hero-dek"]}>
            Answer one question about your legal route, and this tool builds a filtered, phase-by-phase checklist of
            every document, decision and control the Tier 4 framework and the Digital Lending Guidelines require —
            with the fees that apply to your route.
          </p>
          <div className={styles["cta-row"]}>
            <button className={styles["btn-primary"]} onClick={onStart}>
              Start the assessment →
            </button>
            {canResume && (
              <button className={styles["btn-secondary"]} onClick={onResume}>
                Resume my checklist
              </button>
            )}
          </div>
          <div className={styles["hero-meta"]}>
            {heroStats.map((s, i) => (
              <div key={i}>
                <strong>{s.value}</strong>
                {s.label}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={styles["landing-section-title"]}>{copy?.routesHeading || "Two routes into the framework"}</h2>
          <p className={styles["landing-section-note"]}>
            {copy?.routesNote ||
              "Every digital lender falls into one of these. The assessment asks which applies to your business, then builds your pack from there — and flags the items where facts specific to your model change what's required."}
          </p>
          <div className={styles["route-cards"]}>
            <div className={styles["route-card"]}>
              <span className={styles["rc-label"]}>FORM 1</span>
              <h3>Money lender</h3>
              <p>
                A company that lends money digitally without taking deposits, licensed under the Tier 4 Act and
                Money Lenders Regulations.
              </p>
            </div>
            <div className={styles["route-card"]}>
              <span className={styles["rc-label"]}>FORM 1A</span>
              <h3>Non-deposit-taking microfinance institution</h3>
              <p>
                A company or registered NGO providing microcredit without accepting deposits, licensed under the NDT
                MFI Regulations.
              </p>
            </div>
          </div>
          <p className={styles["source-note"]}>
            Built from the Tier 4 Microfinance Institutions and Money Lenders Act, the Money Lenders Regulations, the
            NDT MFI Regulations (2018), the Lending Conditions Regulations (2024) and the current Digital Lending
            Guidelines (2024). This is a working tool to help map application readiness — not a substitute for legal
            advice or direct confirmation with UMRA.
          </p>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

function WizardScreen({
  state,
  patch,
  canBuild,
  onBack,
  onBuild,
  copy,
}: {
  state: PathwayState;
  patch: (n: Partial<PathwayState>) => void;
  canBuild: boolean;
  onBack: () => void;
  onBuild: () => void;
  copy?: DigitalCreditPathwayCopy;
}) {
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>UMRA</div>
          <div>
            <span className={styles.brandTitle}>Digital Credit Licence Pathway</span>
            <span className={styles.brandSubtitle}>Step 1 of 2 · Define your application</span>
          </div>
        </div>
        <div className={styles["masthead-right"]}>
          <button className={styles["link-btn"]} onClick={onBack}>
            ← Back
          </button>
        </div>
      </header>

      <div className={styles["wizard-wrap"]}>
        <h2 className={styles["wizard-title"]}>{copy?.wizardTitle || "Which route are you applying under?"}</h2>
        <p className={styles["wizard-note"]}>
          {copy?.wizardNote ||
            "Select the route that matches your applicant entity and business model. If you're genuinely unsure which fits — for example a technology-only platform where another licensed entity is the lender of record — select both to compare, and confirm the classification with UMRA before you proceed."}
        </p>

        <div className={styles["wizard-options"]}>
          <label className={`${styles["wizard-option"]} ${state.routes.money_lender ? styles.checked : ""}`}>
            <input
              type="checkbox"
              checked={state.routes.money_lender}
              onChange={(e) => patch({ routes: { ...state.routes, money_lender: e.target.checked } })}
            />
            <div>
              <span className={styles["wo-tag"]}>Form 1</span>
              <h4>Money lender</h4>
              <p>A company that lends money digitally, doesn&apos;t take deposits, and isn&apos;t applying as an NDT MFI.</p>
            </div>
          </label>
          <label className={`${styles["wizard-option"]} ${state.routes.ndt_mfi ? styles.checked : ""}`}>
            <input
              type="checkbox"
              checked={state.routes.ndt_mfi}
              onChange={(e) => patch({ routes: { ...state.routes, ndt_mfi: e.target.checked } })}
            />
            <div>
              <span className={styles["wo-tag"]}>Form 1A</span>
              <h4>Non-deposit-taking microfinance institution</h4>
              <p>A company or registered NGO licensed as an NDT MFI, providing microcredit without accepting deposits.</p>
            </div>
          </label>
        </div>

        <div className={styles["wizard-actions"]}>
          <button className={styles["btn-primary"]} disabled={!canBuild} onClick={onBuild}>
            Build my checklist →
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell (checklist / fees / flags)
// ---------------------------------------------------------------------------

function AppScreen({
  state,
  patch,
  items,
  fees,
  phases,
  applicableItems,
  overallProgress,
  activeTab,
  setActiveTab,
  expanded,
  setExpanded,
  getStatus,
  setStatus,
  setNote,
  routeSummaryText,
  onEditPathway,
  onRestart,
  copy,
}: {
  state: PathwayState;
  patch: (n: Partial<PathwayState>) => void;
  items: DigitalCreditItem[];
  fees: DigitalCreditFee[];
  phases: string[];
  applicableItems: { item: DigitalCreditItem; triggers: Trigger[]; level: string | null }[];
  overallProgress: number;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  expanded: Record<string, boolean>;
  setExpanded: (fn: (e: Record<string, boolean>) => Record<string, boolean>) => void;
  getStatus: (id: string) => Status;
  setStatus: (id: string, s: Status) => void;
  setNote: (id: string, text: string) => void;
  routeSummaryText: string;
  onEditPathway: () => void;
  onRestart: () => void;
  copy?: DigitalCreditPathwayCopy;
}) {
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>UMRA</div>
          <div>
            <span className={styles.brandTitle}>Digital Credit Licence Pathway</span>
            <span className={styles.brandSubtitle}>{routeSummaryText}</span>
          </div>
        </div>
        <div className={styles["masthead-right"]}>
          <span className={styles["route-pill"]}>{overallProgress}% complete</span>
          <button className={styles["link-btn"]} onClick={onEditPathway}>
            Edit pathway
          </button>
          <button className={styles["link-btn"]} onClick={onRestart}>
            Restart
          </button>
        </div>
      </header>

      <div className={styles["app-tabs"]}>
        {(["checklist", "fees", "notes"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`${styles["app-tab"]} ${activeTab === t ? styles.active : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t === "checklist" ? "Checklist" : t === "fees" ? "Fees" : "Open flags"}
          </button>
        ))}
      </div>

      {activeTab === "checklist" && (
        <ChecklistTab
          state={state}
          patch={patch}
          phases={phases}
          applicableItems={applicableItems}
          expanded={expanded}
          setExpanded={setExpanded}
          getStatus={getStatus}
          setStatus={setStatus}
          setNote={setNote}
          notes={state.notes}
        />
      )}
      {activeTab === "fees" && <FeesTab state={state} fees={fees} copy={copy} />}
      {activeTab === "notes" && <FlagsTab applicableItems={applicableItems} />}
    </div>
  );
}

function ChecklistTab({
  state,
  patch,
  phases,
  applicableItems,
  expanded,
  setExpanded,
  getStatus,
  setStatus,
  setNote,
  notes,
}: {
  state: PathwayState;
  patch: (n: Partial<PathwayState>) => void;
  phases: string[];
  applicableItems: { item: DigitalCreditItem; triggers: Trigger[]; level: string | null }[];
  expanded: Record<string, boolean>;
  setExpanded: (fn: (e: Record<string, boolean>) => Record<string, boolean>) => void;
  getStatus: (id: string) => Status;
  setStatus: (id: string, s: Status) => void;
  setNote: (id: string, text: string) => void;
  notes: Record<string, string>;
}) {
  const phase = state.activePhase;
  const filter = state.activeFilter;
  const search = state.searchTerm;

  let visible = phase ? applicableItems.filter((x) => x.item.phase === phase) : applicableItems;

  if (filter === "not_started") visible = visible.filter((x) => getStatus(x.item.id) === "not_started");
  else if (filter === "in_progress") visible = visible.filter((x) => getStatus(x.item.id) === "in_progress");
  else if (filter === "done") visible = visible.filter((x) => getStatus(x.item.id) === "done");
  else if (filter === "conditional") visible = visible.filter((x) => x.level === "Conditional");

  if (search) {
    const term = search.toLowerCase();
    visible = visible.filter((x) => (x.item.requirement + " " + x.item.meaning + " " + x.item.id).toLowerCase().includes(term));
  }

  const byPhase: Record<string, typeof visible> = {};
  visible.forEach((x) => {
    if (!byPhase[x.item.phase]) byPhase[x.item.phase] = [];
    byPhase[x.item.phase].push(x);
  });

  return (
    <div className={`${styles.checklistShell} ${styles.active}`}>
      <nav className={styles["phase-rail"]}>
        <button
          className={`${styles["phase-link"]} ${phase === null ? styles.active : ""}`}
          onClick={() => patch({ activePhase: null })}
        >
          All phases
        </button>
        {phases.map((p) => {
          const inPhase = applicableItems.filter((x) => x.item.phase === p);
          if (inPhase.length === 0) return null;
          const doneCount = inPhase.filter((x) => getStatus(x.item.id) === "done").length;
          return (
            <button
              key={p}
              className={`${styles["phase-link"]} ${phase === p ? styles.active : ""}`}
              onClick={() => patch({ activePhase: p })}
            >
              {p.replace(/^\d+\.\s*/, "")}
              <span className={styles["pl-count"]}>
                {doneCount}/{inPhase.length}
              </span>
            </button>
          );
        })}
      </nav>

      <main className={styles["checklist-main"]}>
        <div className={styles["checklist-toolbar"]}>
          <input
            type="search"
            className={styles["search-box"]}
            placeholder="Search requirements…"
            value={search}
            onChange={(e) => patch({ searchTerm: e.target.value })}
          />
          <div className={styles["filter-group"]}>
            {([
              ["all", "All"],
              ["not_started", "Not started"],
              ["in_progress", "In progress"],
              ["done", "Done"],
              ["conditional", "Conditional only"],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`${styles["filter-chip"]} ${filter === key ? styles.active : ""}`}
                onClick={() => patch({ activeFilter: key })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={styles["empty-state"]}>No requirements match this filter.</div>
        ) : (
          phases.map((p) => {
            const group = byPhase[p];
            if (!group) return null;
            const doneCount = group.filter((x) => getStatus(x.item.id) === "done").length;
            const pct = Math.round((100 * doneCount) / group.length);
            return (
              <div key={p}>
                <div className={styles["phase-heading"]}>{p}</div>
                <div className={styles["phase-progress-bar"]}>
                  <div className={styles["phase-progress-fill"]} style={{ width: pct + "%" }} />
                </div>
                {group.map((x) => (
                  <ReqCard
                    key={x.item.id}
                    x={x}
                    isExpanded={!!expanded[x.item.id]}
                    onToggle={() => setExpanded((e) => ({ ...e, [x.item.id]: !e[x.item.id] }))}
                    status={getStatus(x.item.id)}
                    setStatus={(s) => setStatus(x.item.id, s)}
                    note={notes[x.item.id] || ""}
                    setNote={(text) => setNote(x.item.id, text)}
                  />
                ))}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}

function ReqCard({
  x,
  isExpanded,
  onToggle,
  status,
  setStatus,
  note,
  setNote,
}: {
  x: { item: DigitalCreditItem; triggers: Trigger[]; level: string | null };
  isExpanded: boolean;
  onToggle: () => void;
  status: Status;
  setStatus: (s: Status) => void;
  note: string;
  setNote: (text: string) => void;
}) {
  const item = x.item;
  const statusClass =
    status === "done"
      ? styles["status-done"]
      : status === "in_progress"
      ? styles["status-in_progress"]
      : status === "na"
      ? styles["status-na"]
      : styles["status-not_started"];

  return (
    <div className={`${styles["req-card"]} ${statusClass} ${isExpanded ? styles.expanded : ""}`}>
      <div className={styles["req-head"]} onClick={onToggle}>
        <div className={styles["req-id"]}>{item.id}</div>
        <div className={styles["req-title-wrap"]}>
          <p className={styles["req-title"]}>{item.requirement}</p>
          <div className={styles["req-badges"]}>
            {x.triggers.map((t, i) => (
              <span
                key={i}
                className={`${styles.badge} ${t.value === "Yes" ? styles["badge-yes"] : styles["badge-conditional"]}`}
              >
                {t.label}
                {t.value !== "Yes" ? ` · ${t.value}` : ""}
              </span>
            ))}
            <span className={`${styles.badge} ${styles["badge-type"]}`}>{item.type}</span>
          </div>
        </div>
        <div className={styles["req-chevron"]}>▸</div>
      </div>

      {isExpanded && (
        <div className={styles["req-body"]}>
          <p>{item.meaning}</p>
          <div className={styles["req-meta-grid"]}>
            <div>
              <span className={styles["mg-label"]}>Timing</span>
              <span className={styles["mg-value"]}>{item.timing || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Requirement level</span>
              <span className={styles["mg-value"]}>{item.level || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Evidence / completion check</span>
              <span className={styles["mg-value"]}>{item.evidence || "—"}</span>
            </div>
          </div>
          {item.condition && <div className={styles["req-caveat"]}>⚑ {item.condition}</div>}
          <div className={styles["req-source"]}>
            Source: {item.source || "—"}
            {item.source_link && (
              <>
                {" "}
                ·{" "}
                <a href={item.source_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  view source ↗
                </a>
              </>
            )}
          </div>
          <div className={styles["status-row"]}>
            {([
              ["not_started", "Not started"],
              ["in_progress", "In progress"],
              ["done", "Done"],
              ["na", "Not applicable"],
            ] as [Status, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`${styles["status-btn"]} ${
                  status === key
                    ? key === "not_started"
                      ? styles.activeNotStarted
                      : key === "in_progress"
                      ? styles.activeInProgress
                      : key === "done"
                      ? styles.activeDone
                      : styles.activeNa
                    : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setStatus(key);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            className={styles["notes-field"]}
            placeholder="Notes for this requirement…"
            value={note}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function FeesTab({
  state,
  fees,
  copy,
}: {
  state: PathwayState;
  fees: DigitalCreditFee[];
  copy?: DigitalCreditPathwayCopy;
}) {
  const selectedRoutes: string[] = [];
  if (state.routes.money_lender) selectedRoutes.push("money_lender");
  if (state.routes.ndt_mfi) selectedRoutes.push("ndt_mfi");

  if (selectedRoutes.length === 0) {
    return (
      <div className={styles["fees-wrap"]}>
        <div className={styles["empty-state"]}>No route selected yet.</div>
      </div>
    );
  }

  let totalApplication = 0;
  let totalAnnual = 0;
  selectedRoutes.forEach((r) => {
    const label = ROUTE_LABEL[r];
    const appRow = fees.find((f) => f.route === label && f.event === "Initial application");
    const annRow = fees.find((f) => f.route === label && f.event === "Annual licence fee");
    if (appRow) totalApplication += appRow.amount;
    if (annRow) totalAnnual += annRow.amount;
  });

  return (
    <div className={styles["fees-wrap"]}>
      <div className={styles["fees-summary"]}>
        <FeeStat label="Application fee (est.)" value={fmtUGX(totalApplication)} note="Payable per route, at submission" />
        <FeeStat label="Annual licence fee (est.)" value={fmtUGX(totalAnnual)} note="Payable on issue and each renewal" />
        <FeeStat label="Additional place / branch" value="UGX 300,000" note="Per additional place of business, each route" />
        <FeeStat
          label="Routes selected"
          value={selectedRoutes.map((r) => ROUTE_LABEL[r]).join(" + ")}
          note="Fees below are itemised per route"
        />
      </div>
      <p className={styles["combined-note"]}>
        {copy?.feesNote ||
          "If you are applying under both routes for two separate lending entities, budget the application and annual fee for each route separately — they are not combined into a single fee the way NPS categories can be."}
      </p>

      {selectedRoutes.map((r) => (
        <FeeTable key={r} title={`${ROUTE_LABEL[r]} — fee schedule`} rows={fees.filter((f) => f.route === ROUTE_LABEL[r])} />
      ))}
    </div>
  );
}

function FeeStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={styles["fee-stat"]}>
      <div className={styles["fs-label"]}>{label}</div>
      <div className={styles["fs-value"]}>{value}</div>
      <div className={styles["fs-note"]}>{note}</div>
    </div>
  );
}

function FeeTable({ title, rows }: { title: string; rows: DigitalCreditFee[] }) {
  return (
    <div>
      <h3 className={styles["fee-table-title"]}>{title}</h3>
      <table className={styles["fee-table"]}>
        <thead>
          <tr>
            <th>Fee or event</th>
            <th>Amount</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.event}</td>
              <td>{fmtUGX(r.amount)}</td>
              <td>{r.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlagsTab({ applicableItems }: { applicableItems: { item: DigitalCreditItem; triggers: Trigger[]; level: string | null }[] }) {
  const flagged = applicableItems.filter((x) => x.item.condition);
  return (
    <div className={styles["flags-wrap"]}>
      {flagged.length === 0 ? (
        <div className={styles["empty-state"]}>No open judgment calls for this pathway.</div>
      ) : (
        <>
          <p className={styles["flags-intro"]}>
            These items carry a caveat in the source map — either the law and UMRA guidance diverge, or the
            requirement depends on facts specific to your business. Confirm each with UMRA or counsel before treating
            it as settled.
          </p>
          {flagged.map((x) => (
            <div key={x.item.id} className={styles["flag-item"]}>
              <h4>
                {x.item.id} · {x.item.requirement}
              </h4>
              <p>{x.item.condition}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
