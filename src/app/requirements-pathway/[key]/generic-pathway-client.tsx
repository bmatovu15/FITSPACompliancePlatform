"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../requirements-pathway.module.css";
import type { PathwayFee, PathwayRegulator, PathwayRequirement, PathwayRoute, PathwaySubquestion } from "@/lib/types";

// ---------------------------------------------------------------------------
// Generic "licence readiness" wizard engine: works for any pathway_regulators
// row whose key is NOT 'nps' or 'digital_credit' (those keep their bespoke,
// hand-built pages under src/app/nps-pathway and src/app/digital-credit-
// pathway). Implements the same Landing -> Wizard -> App (Checklist / Fees /
// Flags) flow those bespoke tools implement, but driven entirely by the
// `routes` v2 jsonb schema on pathway_regulators and by `pathway_requirements`
// / `pathway_fees` rows, instead of hand-written per-regulator branching.
//
// See src/app/nps-pathway/nps-pathway-client.tsx's renderSubQuestions-
// equivalent logic, routeColumnsForState/itemApplicability and
// renderFees/isHighlighted/feeTable for the bespoke logic this generalizes.
// ---------------------------------------------------------------------------

type Screen = "landing" | "wizard" | "app";
type Status = "not_started" | "in_progress" | "done" | "na";
type Filter = "all" | "not_started" | "in_progress" | "done" | "conditional";
type Tab = "checklist" | "fees" | "notes";
type Trigger = { label: string; value: string };

type PathwayState = {
  routeKeys: Record<string, boolean>;
  answers: Record<string, string>;
  pathwaySet: boolean;
  statuses: Record<string, Status>;
  notes: Record<string, string>;
  activePhase: string | null;
  activeFilter: Filter;
  searchTerm: string;
};

function defaultState(): PathwayState {
  return {
    routeKeys: {},
    answers: {},
    pathwaySet: false,
    statuses: {},
    notes: {},
    activePhase: null,
    activeFilter: "all",
    searchTerm: "",
  };
}

function loadState(storageKey: string): PathwayState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const d = defaultState();
    return {
      ...d,
      ...parsed,
      routeKeys: { ...d.routeKeys, ...(parsed.routeKeys || {}) },
      answers: { ...d.answers, ...(parsed.answers || {}) },
      statuses: parsed.statuses || {},
      notes: parsed.notes || {},
    };
  } catch {
    return defaultState();
  }
}

function fmtMoney(n: number | null | undefined) {
  const v = n ?? 0;
  if (v === 0) return "Nil";
  return "UGX " + v.toLocaleString("en-US");
}

// A subquestion is visible once its (optional) show_if condition is met by
// the current answers -- lets a route nest a follow-up question (e.g. a
// trust-value band) behind an earlier one (e.g. an EMI subtype choice).
function isSubquestionVisible(sq: PathwaySubquestion, answers: Record<string, string>): boolean {
  if (!sq.show_if) return true;
  return answers[sq.show_if.key] === sq.show_if.equals;
}

function visibleSubquestions(route: PathwayRoute, answers: Record<string, string>): PathwaySubquestion[] {
  return (route.subquestions ?? []).filter((sq) => isSubquestionVisible(sq, answers));
}

// The effective applicability column for a route: the route's own top-level
// `column` (if set), overridden by the `column` on the selected option of
// any of its visible subquestions (this is how e.g. the PSP route's
// EMI-vs-other choice picks PSP_EMI vs PSP_OTHER).
function effectiveColumn(route: PathwayRoute, answers: Record<string, string>): string | undefined {
  let column = route.column;
  for (const sq of visibleSubquestions(route, answers)) {
    const opt = sq.options.find((o) => o.value === answers[sq.key]);
    if (opt?.column) column = opt.column;
  }
  return column;
}

// The fee class / band narrowing implied by a route's currently-visible,
// currently-answered subquestions (tiered fee_shape only).
function feeMatchForRoute(route: PathwayRoute, answers: Record<string, string>): { feeClass?: string; bandMatch?: string } {
  let feeClass: string | undefined;
  let bandMatch: string | undefined;
  for (const sq of visibleSubquestions(route, answers)) {
    const opt = sq.options.find((o) => o.value === answers[sq.key]);
    if (opt?.feeClass) feeClass = opt.feeClass;
    if (opt?.bandMatch) bandMatch = opt.bandMatch;
  }
  return { feeClass, bandMatch };
}

export default function GenericPathwayClient({
  regulator,
  items,
  fees,
  isLoggedIn,
}: {
  regulator: PathwayRegulator;
  items: PathwayRequirement[];
  fees: PathwayFee[];
  isLoggedIn?: boolean;
}) {
  const storageKey = `requirements_pathway_state_v1__${regulator.key}`;

  const [screen, setScreen] = useState<Screen>("landing");
  const [state, setState] = useState<PathwayState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("checklist");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Public, no-login tool -- localStorage-only persistence, namespaced by
  // regulator key so multiple generic-wizard regulators don't collide (same
  // model as the bespoke nps/digital-credit pathways' own storage keys).
  useEffect(() => {
    setState(loadState(storageKey));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [state, hydrated, storageKey]);

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

  function toggleRoute(routeKey: string, checked: boolean) {
    setState((s) => ({ ...s, routeKeys: { ...s.routeKeys, [routeKey]: checked } }));
  }

  function setAnswer(route: PathwayRoute, sqKey: string, value: string) {
    setState((s) => {
      const next = { ...s.answers, [sqKey]: value };
      // Clear any subquestion in this route that's gated on the one just
      // answered, so a stale downstream answer can't linger (mirrors the
      // bespoke wizards clearing e.g. pso_band when pso_class changes).
      (route.subquestions ?? []).forEach((sq) => {
        if (sq.show_if?.key === sqKey) next[sq.key] = "";
      });
      return { ...s, answers: next };
    });
  }

  const selectedRoutes = useMemo(
    () => regulator.routes.filter((r) => state.routeKeys[r.key]),
    [regulator.routes, state.routeKeys]
  );

  const routeColumns = useMemo(() => {
    return selectedRoutes
      .map((route) => ({ label: route.label, column: effectiveColumn(route, state.answers) }))
      .filter((c): c is { label: string; column: string } => !!c.column);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoutes, state.answers]);

  function itemApplicability(item: PathwayRequirement): Trigger[] {
    const triggers: Trigger[] = [];
    routeColumns.forEach((c) => {
      const v = item.applicability?.[c.column];
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
  }, [items, routeColumns]);

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
    const parts = selectedRoutes.map((r) => r.label);
    return parts.join("  ·  ") || "No route selected";
  }

  function validateWizard() {
    if (selectedRoutes.length === 0) return false;
    for (const route of selectedRoutes) {
      for (const sq of visibleSubquestions(route, state.answers)) {
        if (!state.answers[sq.key]) return false;
      }
    }
    return true;
  }

  const overallProgress = useMemo(() => {
    const relevant = applicableItems.filter((x) => getStatus(x.item.external_id) !== "na");
    const done = relevant.filter((x) => getStatus(x.item.external_id) === "done").length;
    return relevant.length ? Math.round((100 * done) / relevant.length) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicableItems, state.statuses]);

  function restart() {
    if (typeof window !== "undefined" && !window.confirm("This clears your route selections and every status you have set. Continue?")) {
      return;
    }
    setState(defaultState());
    setScreen("landing");
    setActiveTab("checklist");
  }

  if (!hydrated) {
    return <div className={styles.pathwayRoot} />;
  }

  return (
    <div className={styles.pathwayRoot}>
      {screen === "landing" && (
        <LandingScreen
          regulator={regulator}
          canResume={state.pathwaySet}
          isLoggedIn={!!isLoggedIn}
          onStart={() => setScreen("wizard")}
          onResume={() => setScreen("app")}
        />
      )}

      {screen === "wizard" && (
        <WizardScreen
          regulator={regulator}
          state={state}
          toggleRoute={toggleRoute}
          setAnswer={setAnswer}
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
          regulator={regulator}
          state={state}
          patch={patch}
          fees={fees}
          phases={phases}
          selectedRoutes={selectedRoutes}
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
  regulator,
  canResume,
  isLoggedIn,
  onStart,
  onResume,
}: {
  regulator: PathwayRegulator;
  canResume: boolean;
  isLoggedIn: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>{regulator.seal_text || regulator.title.slice(0, 3).toUpperCase()}</div>
          <div>
            <span className={styles.brandTitle}>{regulator.title}</span>
            {regulator.subtitle && <span className={styles.brandSubtitle}>{regulator.subtitle}</span>}
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
          {regulator.eyebrow && <div className={styles["hero-eyebrow"]}>{regulator.eyebrow}</div>}
          <h1 className={styles["hero-title"]}>{regulator.hero_title || `Find out exactly what your ${regulator.title} needs.`}</h1>
          {regulator.hero_dek && <p className={styles["hero-dek"]}>{regulator.hero_dek}</p>}
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
          {regulator.hero_stats?.length > 0 && (
            <div className={styles["hero-meta"]}>
              {regulator.hero_stats.map((s, i) => (
                <div key={i}>
                  <strong>{s.value}</strong>
                  {s.label}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className={styles["landing-section-title"]}>{regulator.routes_heading || "Routes into the framework"}</h2>
          {regulator.routes_note && <p className={styles["landing-section-note"]}>{regulator.routes_note}</p>}
          <div className={styles["route-cards"]}>
            {regulator.routes.map((r) => (
              <div key={r.key} className={styles["route-card"]}>
                {r.tag && <span className={styles["rc-label"]}>{r.tag}</span>}
                <h3>{r.label}</h3>
                {r.description && <p>{r.description}</p>}
              </div>
            ))}
          </div>
          {regulator.source_note && <p className={styles["source-note"]}>{regulator.source_note}</p>}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

function WizardScreen({
  regulator,
  state,
  toggleRoute,
  setAnswer,
  canBuild,
  onBack,
  onBuild,
}: {
  regulator: PathwayRegulator;
  state: PathwayState;
  toggleRoute: (routeKey: string, checked: boolean) => void;
  setAnswer: (route: PathwayRoute, sqKey: string, value: string) => void;
  canBuild: boolean;
  onBack: () => void;
  onBuild: () => void;
}) {
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>{regulator.seal_text || regulator.title.slice(0, 3).toUpperCase()}</div>
          <div>
            <span className={styles.brandTitle}>{regulator.title}</span>
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
        <h2 className={styles["wizard-title"]}>{regulator.wizard_title || "What is your business applying to do?"}</h2>
        {regulator.wizard_note && <p className={styles["wizard-note"]}>{regulator.wizard_note}</p>}

        <div className={styles["wizard-options"]}>
          {regulator.routes.map((r) => (
            <label key={r.key} className={`${styles["wizard-option"]} ${state.routeKeys[r.key] ? styles.checked : ""}`}>
              <input
                type="checkbox"
                checked={!!state.routeKeys[r.key]}
                onChange={(e) => toggleRoute(r.key, e.target.checked)}
              />
              <div>
                {r.tag && <span className={styles["wo-tag"]}>{r.tag}</span>}
                <h4>{r.label}</h4>
                {r.description && <p>{r.description}</p>}
              </div>
            </label>
          ))}
        </div>

        {regulator.routes
          .filter((r) => state.routeKeys[r.key] && r.subquestions && r.subquestions.length > 0)
          .map((route) => (
            <div key={route.key}>
              {(route.subquestions ?? [])
                .filter((sq) => isSubquestionVisible(sq, state.answers))
                .map((sq) => (
                  <div key={sq.key} className={styles["sub-question"]}>
                    <h5>{route.label} — {sq.label}</h5>
                    <div className={styles["sq-row"]}>
                      <select value={state.answers[sq.key] || ""} onChange={(e) => setAnswer(route, sq.key, e.target.value)}>
                        <option value="">Choose…</option>
                        {sq.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
            </div>
          ))}

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
  regulator,
  state,
  patch,
  fees,
  phases,
  selectedRoutes,
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
  regulator: PathwayRegulator;
  state: PathwayState;
  patch: (n: Partial<PathwayState>) => void;
  fees: PathwayFee[];
  phases: string[];
  selectedRoutes: PathwayRoute[];
  applicableItems: { item: PathwayRequirement; triggers: Trigger[]; level: string | null }[];
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
          <div className={styles.seal}>{regulator.seal_text || regulator.title.slice(0, 3).toUpperCase()}</div>
          <div>
            <span className={styles.brandTitle}>{regulator.title}</span>
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
      {activeTab === "fees" && (
        <FeesTab regulator={regulator} state={state} fees={fees} selectedRoutes={selectedRoutes} />
      )}
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
  applicableItems: { item: PathwayRequirement; triggers: Trigger[]; level: string | null }[];
  expanded: Record<string, boolean>;
  setExpanded: (fn: (e: Record<string, boolean>) => Record<string, boolean>) => void;
  getStatus: (id: string) => Status;
  setStatus: (id: string, s: Status) => void;
  setNote: (id: string, text: string) => void;
  notes: Record<string, string>;
}) {
  let visible = state.activePhase ? applicableItems.filter((x) => x.item.phase === state.activePhase) : applicableItems;

  if (state.activeFilter === "not_started") visible = visible.filter((x) => getStatus(x.item.external_id) === "not_started");
  else if (state.activeFilter === "in_progress") visible = visible.filter((x) => getStatus(x.item.external_id) === "in_progress");
  else if (state.activeFilter === "done") visible = visible.filter((x) => getStatus(x.item.external_id) === "done");
  else if (state.activeFilter === "conditional") visible = visible.filter((x) => x.level === "Conditional");

  if (state.searchTerm) {
    const term = state.searchTerm.toLowerCase();
    visible = visible.filter((x) =>
      (x.item.requirement + " " + (x.item.meaning || "") + " " + x.item.external_id).toLowerCase().includes(term)
    );
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
          const doneCount = inPhase.filter((x) => getStatus(x.item.external_id) === "done").length;
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
            const doneCount = group.filter((x) => getStatus(x.item.external_id) === "done").length;
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
                    isExpanded={!!expanded[x.item.external_id]}
                    onToggle={() => setExpanded((e) => ({ ...e, [x.item.external_id]: !e[x.item.external_id] }))}
                    status={getStatus(x.item.external_id)}
                    setStatus={(s) => setStatus(x.item.external_id, s)}
                    note={notes[x.item.external_id] || ""}
                    setNote={(text) => setNote(x.item.external_id, text)}
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
  x: { item: PathwayRequirement; triggers: Trigger[]; level: string | null };
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
        <div className={styles["req-id"]}>{item.external_id}</div>
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
            {item.item_type && <span className={`${styles.badge} ${styles["badge-type"]}`}>{item.item_type}</span>}
          </div>
        </div>
        <div className={styles["req-chevron"]}>▸</div>
      </div>

      {isExpanded && (
        <div className={styles["req-body"]}>
          {item.meaning && <p>{item.meaning}</p>}
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
  regulator,
  state,
  fees,
  selectedRoutes,
}: {
  regulator: PathwayRegulator;
  state: PathwayState;
  fees: PathwayFee[];
  selectedRoutes: PathwayRoute[];
}) {
  if (selectedRoutes.length === 0) {
    return (
      <div className={styles["fees-wrap"]}>
        <div className={styles["empty-state"]}>No route selected yet.</div>
      </div>
    );
  }

  return regulator.fee_shape === "tiered" ? (
    <TieredFeesTab state={state} fees={fees} selectedRoutes={selectedRoutes} feesNote={regulator.fees_note} />
  ) : (
    <FlatFeesTab fees={fees} selectedRoutes={selectedRoutes} feesNote={regulator.fees_note} />
  );
}

function TieredFeesTab({
  state,
  fees,
  selectedRoutes,
  feesNote,
}: {
  state: PathwayState;
  fees: PathwayFee[];
  selectedRoutes: PathwayRoute[];
  feesNote: string | null;
}) {
  const routesWithCategory = selectedRoutes.filter((r) => r.feeCategory);

  function isHighlighted(row: PathwayFee, feeClass: string | undefined, bandMatch: string | undefined): boolean {
    if (feeClass && row.class !== feeClass) return false;
    if (bandMatch && !(row.threshold || "").startsWith(bandMatch)) return false;
    return true;
  }

  let totalApp = 0;
  let totalLicensing = 0;
  let totalAnnual = 0;
  const capitalCandidates: number[] = [];
  routesWithCategory.forEach((route) => {
    const rowsForCat = fees.filter((f) => f.category === route.feeCategory);
    if (rowsForCat.length === 0) return;
    const { feeClass, bandMatch } = feeMatchForRoute(route, state.answers);
    const hl = rowsForCat.filter((r) => isHighlighted(r, feeClass, bandMatch));
    const pick = hl.length ? hl[0] : rowsForCat[0];
    totalApp += pick.application_fee ?? 0;
    totalLicensing += pick.licensing_fee ?? 0;
    totalAnnual += pick.annual_fee ?? 0;
    capitalCandidates.push(pick.min_capital ?? 0);
  });
  const maxCapital = capitalCandidates.length ? Math.max(...capitalCandidates) : 0;

  return (
    <div className={styles["fees-wrap"]}>
      <div className={styles["fees-summary"]}>
        <FeeStat label="Application fee (est.)" value={fmtMoney(totalApp)} note="Payable per category/class, at submission" />
        <FeeStat label="Licensing fee (est.)" value={fmtMoney(totalLicensing)} note="Payable once the regulator approves" />
        <FeeStat label="Annual fee (est.)" value={fmtMoney(totalAnnual)} note="Payable each year" />
        <FeeStat label="Minimum capital" value={fmtMoney(maxCapital)} note="Highest threshold across your selected categories governs" />
      </div>
      {feesNote && <p className={styles["combined-note"]}>{feesNote}</p>}

      {routesWithCategory.map((route) => {
        const { feeClass, bandMatch } = feeMatchForRoute(route, state.answers);
        const rows = fees.filter((f) => f.category === route.feeCategory);
        return (
          <FeeTableTiered
            key={route.key}
            title={`${route.label} — fees by class`}
            rows={rows}
            isHighlighted={(r) => isHighlighted(r, feeClass, bandMatch)}
          />
        );
      })}
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

function FeeTableTiered({
  title,
  rows,
  isHighlighted,
}: {
  title: string;
  rows: PathwayFee[];
  isHighlighted: (r: PathwayFee) => boolean;
}) {
  if (rows.length === 0) return null;
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
              <td>{fmtMoney(r.application_fee)}</td>
              <td>{fmtMoney(r.licensing_fee)}</td>
              <td>{fmtMoney(r.annual_fee)}</td>
              <td>{fmtMoney(r.min_capital)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlatFeesTab({
  fees,
  selectedRoutes,
  feesNote,
}: {
  fees: PathwayFee[];
  selectedRoutes: PathwayRoute[];
  feesNote: string | null;
}) {
  const routesWithLabel = selectedRoutes.filter((r) => r.feeRouteLabel || r.label);

  let totalApplication = 0;
  let totalAnnual = 0;
  routesWithLabel.forEach((route) => {
    const label = route.feeRouteLabel || route.label;
    const rows = fees.filter((f) => f.route === label);
    const appRow = rows.find((f) => (f.event || "").toLowerCase().includes("application"));
    const annRow = rows.find((f) => (f.event || "").toLowerCase().includes("annual"));
    if (appRow) totalApplication += appRow.amount ?? 0;
    if (annRow) totalAnnual += annRow.amount ?? 0;
  });

  return (
    <div className={styles["fees-wrap"]}>
      <div className={styles["fees-summary"]}>
        <FeeStat label="Application fee (est.)" value={fmtMoney(totalApplication)} note="Payable per route, at submission" />
        <FeeStat label="Annual fee (est.)" value={fmtMoney(totalAnnual)} note="Payable on issue and each renewal" />
        <FeeStat
          label="Routes selected"
          value={routesWithLabel.map((r) => r.label).join(" + ") || "—"}
          note="Fees below are itemised per route"
        />
      </div>
      {feesNote && <p className={styles["combined-note"]}>{feesNote}</p>}

      {routesWithLabel.map((route) => {
        const label = route.feeRouteLabel || route.label;
        return <FeeTableFlat key={route.key} title={`${route.label} — fee schedule`} rows={fees.filter((f) => f.route === label)} />;
      })}
    </div>
  );
}

function FeeTableFlat({ title, rows }: { title: string; rows: PathwayFee[] }) {
  if (rows.length === 0) return null;
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
              <td>{fmtMoney(r.amount)}</td>
              <td>{r.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlagsTab({
  applicableItems,
}: {
  applicableItems: { item: PathwayRequirement; triggers: Trigger[]; level: string | null }[];
}) {
  const flagged = applicableItems.filter((x) => x.item.condition);
  return (
    <div className={styles["flags-wrap"]}>
      {flagged.length === 0 ? (
        <div className={styles["empty-state"]}>No open judgment calls for this pathway.</div>
      ) : (
        <>
          <p className={styles["flags-intro"]}>
            These items carry a caveat in the source map — either the law and regulator guidance diverge, or the
            requirement depends on facts specific to your business. Confirm each with the regulator or counsel before
            treating it as settled.
          </p>
          {flagged.map((x) => (
            <div key={x.item.id} className={styles["flag-item"]}>
              <h4>
                {x.item.external_id} · {x.item.requirement}
              </h4>
              <p>{x.item.condition}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
