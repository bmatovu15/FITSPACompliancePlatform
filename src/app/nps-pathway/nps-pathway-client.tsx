"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./nps-pathway.module.css";

export type YesNoCond = "Yes" | "No" | "Conditional";

export type NpsItem = {
  id: string;
  seq: number;
  phase: string;
  type: string;
  requirement: string;
  meaning: string;
  pso: YesNoCond;
  psp_other: YesNoCond;
  psp_emi: YesNoCond;
  instrument: YesNoCond | "Information only";
  timing: string | null;
  evidence: string | null;
  level: string | null;
  source: string | null;
  source_link: string | null;
  condition: string | null;
};

export type NpsFeeTier = {
  id: string;
  sort_order: number;
  category: string;
  class: string;
  threshold: string;
  application_fee: number;
  licensing_fee: number;
  annual_fee: number;
  min_capital: number;
};

type Screen = "landing" | "wizard" | "app";
type Status = "not_started" | "in_progress" | "done" | "na";
type Filter = "all" | "not_started" | "in_progress" | "done" | "conditional";
type Tab = "checklist" | "fees" | "notes";

type PathwayState = {
  routes: { pso: boolean; psp: boolean; instrument: boolean };
  pso_class: string;
  pso_band: string;
  psp_subtype: string;
  psp_emi_band: string;
  instrument_class: string;
  pathwaySet: boolean;
  statuses: Record<string, Status>;
  notes: Record<string, string>;
  activePhase: string | null;
  activeFilter: Filter;
  searchTerm: string;
};

const STORAGE_KEY = "nps_pathway_state_v1";

function defaultState(): PathwayState {
  return {
    routes: { pso: false, psp: false, instrument: false },
    pso_class: "",
    pso_band: "",
    psp_subtype: "",
    psp_emi_band: "",
    instrument_class: "",
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

const PSO_CLASS_LABEL: Record<string, string> = {
  funds_transfer: "Funds transfer",
  clearing: "Clearing/switch",
  settlement: "Settlement",
  third_party: "Third-party system",
};

type Trigger = { label: string; value: string };

export default function NpsPathwayClient({ items, fees }: { items: NpsItem[]; fees: NpsFeeTier[] }) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [state, setState] = useState<PathwayState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("checklist");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Load persisted progress once, client-side only (same localStorage-only
  // persistence model as the original prototype -- this is a public,
  // no-login tool, so there's no member account to attach server-side state
  // to).
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

  function routeColumnsForState(): { key: string; label: string; column: keyof NpsItem }[] {
    const cols: { key: string; label: string; column: keyof NpsItem }[] = [];
    if (state.routes.pso) cols.push({ key: "pso", label: "PSO", column: "pso" });
    if (state.routes.psp) {
      if (state.psp_subtype === "emi") cols.push({ key: "psp_emi", label: "PSP · EMI", column: "psp_emi" });
      else cols.push({ key: "psp_other", label: "PSP", column: "psp_other" });
    }
    if (state.routes.instrument) cols.push({ key: "instrument", label: "Instrument issuer", column: "instrument" });
    return cols;
  }

  function itemApplicability(item: NpsItem): Trigger[] {
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
    if (triggers.some((t) => t.value === "Information only")) return "Information only";
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
  }, [items, state.routes, state.psp_subtype]);

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
    if (state.routes.pso) parts.push("PSO" + (state.pso_class ? " · " + (PSO_CLASS_LABEL[state.pso_class] || state.pso_class) : ""));
    if (state.routes.psp) parts.push("PSP" + (state.psp_subtype ? " · " + (state.psp_subtype === "emi" ? "EMI" : "Other") : ""));
    if (state.routes.instrument) parts.push("Instrument issuer");
    return parts.join("  ·  ") || "No route selected";
  }

  function validateWizard() {
    const anyRoute = state.routes.pso || state.routes.psp || state.routes.instrument;
    let ok = anyRoute;
    if (state.routes.pso && !state.pso_class) ok = false;
    if (state.routes.pso && state.pso_class === "funds_transfer" && !state.pso_band) ok = false;
    if (state.routes.psp && !state.psp_subtype) ok = false;
    if (state.routes.psp && state.psp_subtype === "emi" && !state.psp_emi_band) ok = false;
    if (state.routes.instrument && !state.instrument_class) ok = false;
    return ok;
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
          onStart={() => setScreen("wizard")}
          onResume={() => setScreen("app")}
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
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

function LandingScreen({
  canResume,
  onStart,
  onResume,
}: {
  canResume: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>BoU</div>
          <div>
            <span className={styles.brandTitle}>NPS Licence Pathway</span>
            <span className={styles.brandSubtitle}>Application readiness map · Bank of Uganda</span>
          </div>
        </div>
      </header>

      <div className={styles["landing-wrap"]}>
        <section className={styles["landing-hero"]}>
          <div className={styles["hero-eyebrow"]}>
            NATIONAL PAYMENT SYSTEMS ACT, 2020<span className={styles.divider}> · </span>PROTOTYPE FOR INTERNAL REVIEW
          </div>
          <h1 className={styles["hero-title"]}>Find out exactly what your licence application needs.</h1>
          <p className={styles["hero-dek"]}>
            Answer a few questions about what your business does, and this tool builds a filtered, phase-by-phase
            checklist of every document, decision and approval the National Payment Systems framework requires —
            with the fees and minimum capital that apply to your route.
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
            <div>
              <strong>73</strong>requirement items mapped
            </div>
            <div>
              <strong>3</strong>licence routes covered
            </div>
            <div>
              <strong>9</strong>phases, route to launch
            </div>
          </div>
        </section>

        <section>
          <h2 className={styles["landing-section-title"]}>Three routes into the framework</h2>
          <p className={styles["landing-section-note"]}>
            Every applicant falls into one or more of these. The assessment asks which apply to your business, then
            builds your pack from there.
          </p>
          <div className={styles["route-cards"]}>
            <div className={styles["route-card"]}>
              <span className={styles["rc-label"]}>FORM A</span>
              <h3>Payment system operator</h3>
              <p>
                You operate the system or platform through which monetary value moves — funds transfer,
                clearing/switch, settlement, or a third-party system.
              </p>
            </div>
            <div className={styles["route-card"]}>
              <span className={styles["rc-label"]}>FORM A</span>
              <h3>Payment service provider</h3>
              <p>
                You directly provide a payment service — as an electronic-money issuer, or another PSP class such as
                payment services involving tokens.
              </p>
            </div>
            <div className={styles["route-card"]}>
              <span className={styles["rc-label"]}>FORM C</span>
              <h3>Payment-instrument issuer</h3>
              <p>
                You issue a card, electronic device or paper instrument used to make payments — a narrower route,
                unless you also provide a service above.
              </p>
            </div>
          </div>
          <p className={styles["source-note"]}>
            Built from the NPS Act (Cap. 59, consolidated 2023), the NPS Regulations (SI 18/2021) and current Bank of
            Uganda application guidance. This is a working tool to help map application readiness — not a substitute
            for legal advice or direct confirmation with BoU.
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
}: {
  state: PathwayState;
  patch: (n: Partial<PathwayState>) => void;
  canBuild: boolean;
  onBack: () => void;
  onBuild: () => void;
}) {
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>BoU</div>
          <div>
            <span className={styles.brandTitle}>NPS Licence Pathway</span>
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
        <h2 className={styles["wizard-title"]}>What is your business applying to do?</h2>
        <p className={styles["wizard-note"]}>
          Select every activity that applies. Many applicants need more than one — for example, an electronic-money
          issuer that also runs its own switch needs both routes, and pays fees for each.
        </p>

        <div className={styles["wizard-options"]}>
          <label className={`${styles["wizard-option"]} ${state.routes.pso ? styles.checked : ""}`}>
            <input
              type="checkbox"
              checked={state.routes.pso}
              onChange={(e) => patch({ routes: { ...state.routes, pso: e.target.checked } })}
            />
            <div>
              <span className={styles["wo-tag"]}>Form A</span>
              <h4>Operate a payment system</h4>
              <p>Funds transfer, clearing/switch, settlement, or a third-party system such as an aggregator or gateway.</p>
            </div>
          </label>
          <label className={`${styles["wizard-option"]} ${state.routes.psp ? styles.checked : ""}`}>
            <input
              type="checkbox"
              checked={state.routes.psp}
              onChange={(e) => patch({ routes: { ...state.routes, psp: e.target.checked } })}
            />
            <div>
              <span className={styles["wo-tag"]}>Form A</span>
              <h4>Provide a payment service</h4>
              <p>Electronic-money issuance, payment services including tokens, or another payment-service class.</p>
            </div>
          </label>
          <label className={`${styles["wizard-option"]} ${state.routes.instrument ? styles.checked : ""}`}>
            <input
              type="checkbox"
              checked={state.routes.instrument}
              onChange={(e) => patch({ routes: { ...state.routes, instrument: e.target.checked } })}
            />
            <div>
              <span className={styles["wo-tag"]}>Form C</span>
              <h4>Issue a payment instrument</h4>
              <p>A payment card, electronic device, or paper-based instrument used to make payments.</p>
            </div>
          </label>
        </div>

        {state.routes.pso && (
          <div className={styles["sub-question"]}>
            <h5>Payment system operator — select your class</h5>
            <div className={styles["sq-row"]}>
              <select
                value={state.pso_class}
                onChange={(e) => patch({ pso_class: e.target.value, pso_band: "" })}
              >
                <option value="">Choose a class…</option>
                <option value="funds_transfer">Funds transfer system</option>
                <option value="clearing">Clearing system or switch</option>
                <option value="settlement">Settlement system</option>
                <option value="third_party">Third-party system (aggregator, integrator, gateway)</option>
              </select>
              {state.pso_class === "funds_transfer" && (
                <select value={state.pso_band} onChange={(e) => patch({ pso_band: e.target.value })}>
                  <option value="">Transaction volume band…</option>
                  <option value="large">Large — monthly value &gt; UGX 100bn</option>
                  <option value="medium">Medium — &gt; UGX 1bn and ≤ UGX 100bn</option>
                  <option value="small">Small — ≤ UGX 1bn per month</option>
                </select>
              )}
            </div>
          </div>
        )}

        {state.routes.psp && (
          <div className={styles["sub-question"]}>
            <h5>Payment service provider — select your subtype</h5>
            <div className={styles["sq-row"]}>
              <select
                value={state.psp_subtype}
                onChange={(e) => patch({ psp_subtype: e.target.value, psp_emi_band: "" })}
              >
                <option value="">Choose a subtype…</option>
                <option value="emi">Electronic-money issuer</option>
                <option value="other">Any other PSP (e.g. payment services / tokens)</option>
              </select>
              {state.psp_subtype === "emi" && (
                <select value={state.psp_emi_band} onChange={(e) => patch({ psp_emi_band: e.target.value })}>
                  <option value="">Trust-account value band…</option>
                  <option value="large">Large — trust value &gt; UGX 100bn</option>
                  <option value="medium1">Medium 1 — &gt; UGX 50bn and ≤ UGX 100bn</option>
                  <option value="medium2">Medium 2 — &gt; UGX 5bn and ≤ UGX 50bn</option>
                  <option value="medium3">Medium 3 — &gt; UGX 500m and ≤ UGX 5bn</option>
                  <option value="small1">Small 1 — &gt; UGX 250m and ≤ UGX 500m</option>
                  <option value="small2">Small 2 — ≤ UGX 250m</option>
                </select>
              )}
            </div>
          </div>
        )}

        {state.routes.instrument && (
          <div className={styles["sub-question"]}>
            <h5>Payment-instrument issuer — select your class</h5>
            <div className={styles["sq-row"]}>
              <select
                value={state.instrument_class}
                onChange={(e) => patch({ instrument_class: e.target.value })}
              >
                <option value="">Choose a class…</option>
                <option value="card">Payment card</option>
                <option value="device">Electronic device</option>
                <option value="paper">Paper-based instrument</option>
                <option value="other">Other class determined by BoU</option>
              </select>
            </div>
          </div>
        )}

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
}: {
  state: PathwayState;
  patch: (n: Partial<PathwayState>) => void;
  items: NpsItem[];
  fees: NpsFeeTier[];
  phases: string[];
  applicableItems: { item: NpsItem; triggers: Trigger[]; level: string | null }[];
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
}) {
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>BoU</div>
          <div>
            <span className={styles.brandTitle}>NPS Licence Pathway</span>
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
            {t === "checklist" ? "Checklist" : t === "fees" ? "Fees & capital" : "Open flags"}
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
      {activeTab === "fees" && <FeesTab state={state} fees={fees} />}
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
  applicableItems: { item: NpsItem; triggers: Trigger[]; level: string | null }[];
  expanded: Record<string, boolean>;
  setExpanded: (fn: (e: Record<string, boolean>) => Record<string, boolean>) => void;
  getStatus: (id: string) => Status;
  setStatus: (id: string, s: Status) => void;
  setNote: (id: string, text: string) => void;
  notes: Record<string, string>;
}) {
  let visible = state.activePhase ? applicableItems.filter((x) => x.item.phase === state.activePhase) : applicableItems;

  if (state.activeFilter === "not_started") visible = visible.filter((x) => getStatus(x.item.id) === "not_started");
  else if (state.activeFilter === "in_progress") visible = visible.filter((x) => getStatus(x.item.id) === "in_progress");
  else if (state.activeFilter === "done") visible = visible.filter((x) => getStatus(x.item.id) === "done");
  else if (state.activeFilter === "conditional") visible = visible.filter((x) => x.level === "Conditional");

  if (state.searchTerm) {
    const term = state.searchTerm.toLowerCase();
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
          className={`${styles["phase-link"]} ${state.activePhase === null ? styles.active : ""}`}
          onClick={() => patch({ activePhase: null })}
        >
          All phases
        </button>
        {phases.map((phase) => {
          const inPhase = applicableItems.filter((x) => x.item.phase === phase);
          if (inPhase.length === 0) return null;
          const doneCount = inPhase.filter((x) => getStatus(x.item.id) === "done").length;
          return (
            <button
              key={phase}
              className={`${styles["phase-link"]} ${state.activePhase === phase ? styles.active : ""}`}
              onClick={() => patch({ activePhase: phase })}
            >
              {phase.replace(/^\d+\.\s*/, "")}
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
            value={state.searchTerm}
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
                className={`${styles["filter-chip"]} ${state.activeFilter === key ? styles.active : ""}`}
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
          phases.map((phase) => {
            const group = byPhase[phase];
            if (!group) return null;
            const doneCount = group.filter((x) => getStatus(x.item.id) === "done").length;
            const pct = Math.round((100 * doneCount) / group.length);
            return (
              <div key={phase}>
                <div className={styles["phase-heading"]}>{phase}</div>
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
  x: { item: NpsItem; triggers: Trigger[]; level: string | null };
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
                className={`${styles.badge} ${t.value === "Yes" ? styles["badge-yes"] : t.value === "Conditional" ? styles["badge-conditional"] : styles["badge-info"]}`}
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

function FeesTab({ state, fees }: { state: PathwayState; fees: NpsFeeTier[] }) {
  if (!state.routes.pso && !state.routes.psp && !state.routes.instrument) {
    return (
      <div className={styles["fees-wrap"]}>
        <div className={styles["empty-state"]}>No route selected yet.</div>
      </div>
    );
  }

  let relevantRows: NpsFeeTier[] = [];
  if (state.routes.pso) relevantRows = relevantRows.concat(fees.filter((r) => r.category === "PSO"));
  if (state.routes.psp) {
    relevantRows = relevantRows.concat(
      fees.filter((r) => (state.psp_subtype === "emi" ? r.class === "Electronic-money issuer" : r.class === "Any other PSP"))
    );
  }
  if (state.routes.instrument) relevantRows = relevantRows.concat(fees.filter((r) => r.category === "Payment instrument issuer"));

  function isHighlighted(row: NpsFeeTier): boolean {
    if (row.category === "PSO") {
      const classMap: Record<string, string> = {
        funds_transfer: "Funds transfer system",
        clearing: "Clearing system or switch",
        settlement: "Settlement system",
        third_party: "Third-party system",
      };
      if (row.class !== classMap[state.pso_class]) return false;
      if (state.pso_class === "funds_transfer") {
        const bandWord: Record<string, string> = { large: "Large", medium: "Medium", small: "Small" };
        const word = bandWord[state.pso_band];
        return !!word && row.threshold.indexOf(word) === 0;
      }
      return true;
    }
    if (row.class === "Electronic-money issuer") {
      const bandMap: Record<string, string> = {
        large: "Large",
        medium1: "Medium 1",
        medium2: "Medium 2",
        medium3: "Medium 3",
        small1: "Small 1",
        small2: "Small 2",
      };
      return !!state.psp_emi_band && row.threshold.indexOf(bandMap[state.psp_emi_band]) === 0;
    }
    if (row.class === "Any other PSP") return true;
    if (row.category === "Payment instrument issuer") return true;
    return false;
  }

  let totalApp = 0;
  let totalLicensing = 0;
  let totalAnnual = 0;
  const capitalCandidates: number[] = [];
  (["PSO", "PSP", "Payment instrument issuer"] as const).forEach((catGroup) => {
    const rowsForCat = relevantRows.filter((r) => r.category === catGroup);
    if (rowsForCat.length === 0) return;
    const hl = rowsForCat.filter(isHighlighted);
    const pick = hl.length ? hl[0] : rowsForCat[0];
    totalApp += pick.application_fee;
    totalLicensing += pick.licensing_fee;
    totalAnnual += pick.annual_fee;
    capitalCandidates.push(pick.min_capital);
  });
  const maxCapital = capitalCandidates.length ? Math.max(...capitalCandidates) : 0;

  return (
    <div className={styles["fees-wrap"]}>
      <div className={styles["fees-summary"]}>
        <FeeStat label="Application fee (est.)" value={fmtUGX(totalApp)} note="Payable per category/class, at submission" />
        <FeeStat label="Licensing fee (est.)" value={fmtUGX(totalLicensing)} note="Payable once BoU approves" />
        <FeeStat label="Annual fee (est.)" value={fmtUGX(totalAnnual)} note="Due by 31 January each year" />
        <FeeStat label="Minimum capital" value={fmtUGX(maxCapital)} note="Highest threshold across your selected categories governs" />
      </div>
      <p className={styles["combined-note"]}>
        Combined applications: fees are payable for each licence category or class included, while the minimum
        capital requirement is the highest threshold among the combined licences. Estimates above assume one class
        per category — adjust in &quot;Edit pathway&quot; if you are applying for more than one class within the
        same category.
      </p>

      {state.routes.pso && <FeeTable title="Payment system operator — fees by class" rows={fees.filter((r) => r.category === "PSO")} isHighlighted={isHighlighted} />}
      {state.routes.psp && <FeeTable title="Payment service provider — fees by class" rows={fees.filter((r) => r.category === "PSP")} isHighlighted={isHighlighted} />}
      {state.routes.instrument && (
        <FeeTable title="Payment-instrument issuer — fees" rows={fees.filter((r) => r.category === "Payment instrument issuer")} isHighlighted={isHighlighted} />
      )}
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

function FeeTable({ title, rows, isHighlighted }: { title: string; rows: NpsFeeTier[]; isHighlighted: (r: NpsFeeTier) => boolean }) {
  return (
    <div>
      <h3 className={styles["fee-table-title"]}>{title}</h3>
      <table className={styles["fee-table"]}>
        <thead>
          <tr>
            <th>Class</th>
            <th>Threshold / description</th>
            <th>Application fee</th>
            <th>Licensing fee</th>
            <th>Annual fee</th>
            <th>Minimum capital</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={isHighlighted(r) ? styles.highlighted : ""}>
              <td>{r.class}</td>
              <td>{r.threshold}</td>
              <td>{fmtUGX(r.application_fee)}</td>
              <td>{fmtUGX(r.licensing_fee)}</td>
              <td>{fmtUGX(r.annual_fee)}</td>
              <td>{fmtUGX(r.min_capital)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlagsTab({ applicableItems }: { applicableItems: { item: NpsItem; triggers: Trigger[]; level: string | null }[] }) {
  const flagged = applicableItems.filter((x) => x.item.condition);
  return (
    <div className={styles["flags-wrap"]}>
      {flagged.length === 0 ? (
        <div className={styles["empty-state"]}>No open judgment calls for this pathway.</div>
      ) : (
        <>
          <p className={styles["flags-intro"]}>
            These items carry a caveat in the source map — either the law and BoU guidance diverge, or the
            requirement depends on facts specific to your business. Confirm each with BoU or counsel before treating
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
