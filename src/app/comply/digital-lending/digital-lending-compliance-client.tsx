"use client";

// Digital Lending Compliance ("Comply", MRD-MoFPED) -- faithful React port of
// the FITSPA Compliance Platform design prototype (digital_comply.html): landing -> setup ->
// workspace (Dashboard / Calendar / Obligations / Controls) with one shared
// right-hand drawer. All pure logic lives in @/lib/comply/digital-engine; the
// whole state document is persisted through the shared WorkspaceAdapter
// (member_comply_workspace + the private compliance-evidence bucket).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONTROL_AREAS,
  EVENT_DEFS,
  generateScheduled,
  getOb,
  makeClock,
  normaliseState,
  profileFromLegacy,
  routeName,
  saveSetup,
  type Clock,
  type DLProfile,
  type DLState,
  type ExpertCtx,
  type FileRef,
  type LegacyProfileRow,
} from "@/lib/comply/digital-engine";
import { createSupabaseWorkspaceAdapter, type WorkspaceAdapter } from "@/lib/comply/workspace";
import { AppContext, type AppApi, type DrawerState, type TabName } from "./dl-shared";
import { LandingScreen, SetupScreen } from "./dl-screens";
import { CalendarPanel, ControlsPanel, DashboardPanel, ObligationsPanel, RightRail } from "./dl-panels";
import {
  ControlBody,
  EventFormBody,
  EventStartBody,
  ExpertBody,
  GuideBody,
  ObligationBody,
  OccurrenceBody,
  ProfileSettingsBody,
  RegulatorSetBody,
} from "./dl-drawers";
import "./digital-lending.generated.css";
import "./digital-lending.extra.css";

type Screen = "landing" | "setup" | "app";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap";

function drawerHead(d: DrawerState, state: DLState): { title: string; eyebrow: string } {
  switch (d.kind) {
    case "guide":
      return { title: getOb(d.id)?.Obligation || "", eyebrow: "Requirement guidance" };
    case "obligation": {
      const o = getOb(d.id);
      return { title: o?.Obligation || "", eyebrow: `${d.id} · ${o?.domainLabel || ""}` };
    }
    case "occurrence":
      return { title: state.occurrences.find((x) => x.uid === d.uid)?.title || "", eyebrow: "Occurrence" };
    case "control":
      return { title: CONTROL_AREAS[d.idx]?.title || "", eyebrow: "Continuous control" };
    case "eventStart":
      return { title: "Log an event", eyebrow: "Event-driven compliance" };
    case "event":
      return { title: EVENT_DEFS.find((e) => e.id === d.id)?.title || "", eyebrow: "Log an event" };
    case "regulator":
      return { title: "Add regulator-set due date", eyebrow: "Calendar" };
    case "profile":
      return { title: "Profile & registrations", eyebrow: "Settings" };
    case "expert":
      return { title: "Expert Support", eyebrow: "Support" };
  }
}

/** The context the footer "Ask an expert" link carries from the open drawer. */
function expertCtxFor(d: DrawerState | null): ExpertCtx {
  if (!d) return { kind: "general" };
  if (d.kind === "guide" || d.kind === "obligation") return { kind: "obligation", obligationId: d.id };
  if (d.kind === "occurrence") return { kind: "occurrence", uid: d.uid };
  if (d.kind === "control") return { kind: "control", control: d.idx };
  return { kind: "general" };
}

function DrawerBody({ d }: { d: DrawerState }) {
  switch (d.kind) {
    case "guide":
      return <GuideBody id={d.id} />;
    case "obligation":
      return <ObligationBody id={d.id} />;
    case "occurrence":
      return <OccurrenceBody uid={d.uid} />;
    case "control":
      return <ControlBody idx={d.idx} />;
    case "eventStart":
      return <EventStartBody />;
    case "event":
      return <EventFormBody id={d.id} />;
    case "regulator":
      return <RegulatorSetBody />;
    case "profile":
      return <ProfileSettingsBody />;
    case "expert":
      return <ExpertBody ctx={d.ctx} />;
  }
}

export interface DigitalLendingAppProps {
  adapter: WorkspaceAdapter;
  /** The stored state document (member_comply_workspace.state) or null. */
  initialState: unknown;
  /** Operating answers carried over from an older profile row, used to pre-fill setup. */
  prefill?: Partial<DLProfile> | null;
}

export function DigitalLendingApp({ adapter, initialState, prefill = null }: DigitalLendingAppProps) {
  const [state, setState] = useState<DLState>(() => normaliseState(initialState));
  const stateRef = useRef<DLState>(state);
  const dirty = useRef(false);
  const [clock, setClock] = useState<Clock | null>(null);
  const [screen, setScreen] = useState<Screen>("landing");
  const [tab, setTab] = useState<TabName>("dashboard");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSeq, setDrawerSeq] = useState(0);
  const [setupSeq, setSetupSeq] = useState(0);
  const [toast, setToast] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // ---- state plumbing ------------------------------------------------------
  const commit = useCallback((next: DLState) => {
    stateRef.current = next;
    dirty.current = true;
    setState(next);
    setClock(makeClock());
  }, []);
  const getState = useCallback(() => stateRef.current, []);
  const patch = useCallback((p: Partial<DLState>) => commit({ ...stateRef.current, ...p }), [commit]);

  // Client-only: the app depends on the real browser date and locale, so it is
  // rendered after mount (avoids server/client hydration differences).
  useEffect(() => {
    const c = makeClock();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only gate: the clock exists only after mount
    setClock(c);
    if (stateRef.current.profile) commit(generateScheduled(stateRef.current, c));
    const onVis = () => {
      if (document.visibilityState === "visible") setClock(makeClock());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [commit]);

  // ---- debounced persistence ----------------------------------------------
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DLState | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const s = pending.current;
    if (!s) return;
    pending.current = null;
    const r = await adapter.save(s, !!s.profile);
    if (!r.ok) {
      if (!pending.current) pending.current = s;
      setToast(`Your latest changes could not be saved${r.error ? ` (${r.error})` : ""}. Retrying…`);
      timer.current = setTimeout(() => void flushRef.current(), 5000);
    } else {
      setToast((t) => (t.startsWith("Your latest changes") ? "" : t));
    }
  }, [adapter]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => {
    if (!dirty.current) return;
    pending.current = state;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [state, flush]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      void flush();
    };
  }, [flush]);

  // ---- navigation ----------------------------------------------------------
  const show = useCallback((s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  }, []);
  const openDrawer = useCallback((d: DrawerState) => {
    setDrawer(d);
    setDrawerOpen(true);
    setDrawerSeq((n) => n + 1);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const goSetup = useCallback(() => {
    setSetupSeq((n) => n + 1);
    show("setup");
  }, [show]);
  const enterApp = useCallback(() => {
    if (!stateRef.current.profile) {
      goSetup();
      return;
    }
    commit(generateScheduled(stateRef.current, makeClock()));
    show("app");
  }, [commit, goSetup, show]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [drawerSeq]);

  const openEvidenceFile = useCallback(
    async (f: FileRef | string) => {
      if (typeof f === "string" || !f.path) return;
      const url = await adapter.openEvidence(f.path);
      if (url) window.open(url, "_blank", "noopener");
      else setToast("This file could not be opened right now.");
    },
    [adapter],
  );

  const api: AppApi | null = useMemo(
    () =>
      clock
        ? { state, getState, clock, commit, patch, adapter, openDrawer, closeDrawer, goSetup, openEvidenceFile }
        : null,
    [state, getState, clock, commit, patch, adapter, openDrawer, closeDrawer, goSetup, openEvidenceFile],
  );

  const head = drawer ? drawerHead(drawer, state) : { title: "", eyebrow: "" };
  const setupInitial = state.profile || prefill;

  return (
    <div className="dcl-root" style={{ minHeight: "100vh", background: "#fff" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={FONT_HREF} precedence="default" />
      {/* eslint-disable-next-line react-hooks/refs -- api only wraps stable callbacks that read refs at call time */}
      {api ? (
        <AppContext.Provider value={api}>
          {screen === "landing" ? (
            <LandingScreen
              hasProfile={!!state.profile}
              onSetup={goSetup}
              onResume={enterApp}
              onExpert={() => openDrawer({ kind: "expert", ctx: { kind: "general" } })}
            />
          ) : null}
          {screen === "setup" ? (
            <SetupScreen
              key={setupSeq}
              initial={setupInitial}
              onBack={() => show("landing")}
              onExpert={() => openDrawer({ kind: "expert", ctx: { kind: "general" } })}
              onSave={(f) => {
                commit(saveSetup(stateRef.current, f, makeClock(), prefill));
                show("app");
              }}
            />
          ) : null}
          {screen === "app" ? (
            <section className="screen active" id="screen-app">
              <header className="workspace-head">
                <div className="workspace-left">
                  <Link className="link" id="app-home" href="/comply">
                    ← Compliance
                  </Link>
                  <span className="workspace-title">Digital Lending Compliance</span>
                  <span className="route-pill" id="route-pill">
                    {routeName(state)}
                  </span>
                </div>
                <div className="workspace-actions">
                  <button type="button" className="ghost" id="log-event" onClick={() => openDrawer({ kind: "eventStart" })}>
                    Log an event
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    data-expert="workspace"
                    onClick={() => openDrawer({ kind: "expert", ctx: { kind: "general" } })}
                  >
                    Expert Support
                  </button>
                </div>
              </header>
              <nav className="workspace-tabs">
                {(
                  [
                    ["dashboard", "Dashboard"],
                    ["calendar", "Calendar"],
                    ["obligations", "Obligations"],
                    ["controls", "Controls"],
                  ] as [TabName, string][]
                ).map(([k, label]) => (
                  <button type="button" key={k} className={`tab ${tab === k ? "active" : ""}`} data-tab={k} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </nav>
              <div className="app-shell">
                <main className="main">
                  <section className={`panel ${tab === "dashboard" ? "active" : ""}`} id="panel-dashboard">
                    {tab === "dashboard" ? <DashboardPanel /> : null}
                  </section>
                  <section className={`panel ${tab === "calendar" ? "active" : ""}`} id="panel-calendar">
                    {tab === "calendar" ? <CalendarPanel /> : null}
                  </section>
                  <section className={`panel ${tab === "obligations" ? "active" : ""}`} id="panel-obligations">
                    {tab === "obligations" ? <ObligationsPanel /> : null}
                  </section>
                  <section className={`panel ${tab === "controls" ? "active" : ""}`} id="panel-controls">
                    {tab === "controls" ? <ControlsPanel /> : null}
                  </section>
                </main>
                <aside className="right" id="right-rail">
                  <RightRail />
                </aside>
              </div>
            </section>
          ) : null}

          <div className={`overlay ${drawerOpen ? "open" : ""}`} id="overlay" onClick={closeDrawer}></div>
          <aside className={`drawer ${drawerOpen ? "open" : ""}`} id="drawer" role="dialog" aria-modal="true" aria-label={head.title || "Details"} aria-hidden={!drawerOpen}>
            <div className="drawer-head">
              <div>
                <div className="drawer-eyebrow" id="drawer-eyebrow">
                  {head.eyebrow}
                </div>
                <h2 id="drawer-title">{head.title}</h2>
              </div>
              <button type="button" className="drawer-close" id="drawer-close" aria-label="Close" onClick={closeDrawer}>
                ×
              </button>
            </div>
            <div className="drawer-body" id="drawer-body" ref={bodyRef}>
              {drawer ? <DrawerBody key={drawerSeq} d={drawer} /> : null}
            </div>
            <div className="drawer-footer">
              <button
                type="button"
                className={`textlink ${drawer?.kind === "expert" ? "hidden" : ""}`}
                id="drawer-expert"
                onClick={() => openDrawer({ kind: "expert", ctx: expertCtxFor(drawer) })}
              >
                Ask an expert
              </button>
              <button type="button" className="subtle" id="drawer-done" onClick={closeDrawer}>
                Close
              </button>
            </div>
          </aside>
          {toast ? (
            <div className="note warn dcl-toast" role="status">
              {toast}
              <button type="button" className="textlink" onClick={() => setToast("")}>
                Dismiss
              </button>
            </div>
          ) : null}
        </AppContext.Provider>
      ) : null}
    </div>
  );
}

export interface DigitalLendingComplianceClientProps {
  memberId: string;
  catalogKey: string;
  initialState: unknown;
  /** Old member_compliance_profile row (only passed when there is no workspace row). */
  legacyProfile?: LegacyProfileRow | null;
  businessName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
}

export default function DigitalLendingComplianceClient({
  memberId,
  catalogKey,
  initialState,
  legacyProfile = null,
  businessName,
  contactName,
  contactEmail,
}: DigitalLendingComplianceClientProps) {
  const adapter = useMemo(
    () =>
      createSupabaseWorkspaceAdapter({
        memberId,
        moduleKey: "digital_lending",
        catalogKey,
        businessName,
        contactName,
        contactEmail,
      }),
    [memberId, catalogKey, businessName, contactName, contactEmail],
  );
  const prefill = useMemo(() => profileFromLegacy(legacyProfile), [legacyProfile]);
  return <DigitalLendingApp adapter={adapter} initialState={initialState} prefill={prefill} />;
}
