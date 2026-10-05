"use client";

// Payments Compliance ("Comply") -- React port of the Beacon design prototype
// (payments_comply.html). Screens: landing -> 3-step setup (licence profile,
// operating profile, baseline status) -> workspace (Home / Obligations /
// Calendar / Evidence) with the right-hand drawer in all its modes. The rules
// live in the pure engine (@/lib/comply/payments-engine); the whole workspace
// is ONE state document persisted through the shared WorkspaceAdapter
// (member_comply_workspace + the private compliance-evidence bucket).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./payments-comply.css";
import {
  allTasks,
  defaultState,
  makeClock,
  normalizeState,
  profileText,
  type CalFilter,
  type Clock,
  type ObFilter,
  type ObStateFilter,
  type PcState,
  type Profile,
  type TabName,
} from "@/lib/comply/payments-engine";
import {
  createSupabaseWorkspaceAdapter,
  type StoredEvidenceFile,
  type WorkspaceAdapter,
} from "@/lib/comply/workspace";
import { CalendarPanel, EvidencePanel, HomePanel, ObligationsPanel } from "./pc-app";
import { DrawerBody, drawerMeta, viewKey } from "./pc-drawers";
import { Landing, SetupBaseline, SetupLicence, SetupOperating } from "./pc-setup";
import type { DrawerView, PcCtx, Screen } from "./pc-types";

export interface PaymentsComplianceClientProps {
  member: { id: string; businessName?: string | null; contactName?: string | null; contactEmail?: string | null };
  catalogKey: string;
  /** The stored workspace document (member_comply_workspace.state), or null for a new member. */
  initialState: unknown | null;
  /** Setup pre-fill derived from an old member_compliance_profile row (new members only). */
  prefillProfile?: Profile | null;
  /** Test hooks: inject an adapter / freeze "now". Production passes neither. */
  adapter?: WorkspaceAdapter;
  now?: string;
}

const SAVE_DEBOUNCE_MS = 700;

interface DrawerState {
  open: boolean;
  view: DrawerView | null;
  back: DrawerView | null;
  nonce: number;
}

const TABS: [TabName, string][] = [
  ["home", "Home"],
  ["obligations", "Obligations"],
  ["calendar", "Calendar"],
  ["evidence", "Evidence"],
];

export default function PaymentsComplianceClient(props: PaymentsComplianceClientProps) {
  const { member, catalogKey, initialState, prefillProfile, now } = props;

  const adapter = useMemo<WorkspaceAdapter>(
    () =>
      props.adapter ??
      createSupabaseWorkspaceAdapter({
        memberId: member.id,
        moduleKey: "payments",
        catalogKey,
        businessName: member.businessName,
        contactName: member.contactName,
        contactEmail: member.contactEmail,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.adapter, member.id, catalogKey],
  );

  const [state, setState] = useState<PcState>(() => {
    if (initialState) return normalizeState(initialState);
    const s = defaultState();
    if (prefillProfile) s.profile = prefillProfile;
    return s;
  });
  const [screen, setScreenRaw] = useState<Screen>("landing");
  const [setupOrigin, setSetupOrigin] = useState<"landing" | "app">("landing");
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, view: null, back: null, nonce: 0 });
  const [obFilter, setObFilter] = useState<ObFilter>("all");
  const [obStateFilter, setObStateFilter] = useState<ObStateFilter>("all");
  const [calFilter, setCalFilter] = useState<CalFilter>("all");
  const [obQuery, setObQuery] = useState("");
  const [calQuery, setCalQuery] = useState("");
  const [toast, setToast] = useState("");
  const [saveError, setSaveError] = useState("");

  // -- clock ----------------------------------------------------------------
  const [clock, setClock] = useState<Clock>(() => makeClock(now));
  useEffect(() => {
    if (now) return;
    const t = window.setInterval(() => {
      setClock((c) => {
        const n = makeClock();
        return Math.floor(n.nowMs / 60000) === Math.floor(c.nowMs / 60000) ? c : n;
      });
    }, 30000);
    return () => window.clearInterval(t);
  }, [now]);

  const tasks = useMemo(() => allTasks(state, clock), [state, clock]);

  // -- persistence (one document, debounced) -----------------------------------
  const latest = useRef(state);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const snapshot = latest.current;
    const res = await adapter.save(snapshot, snapshot.profileSet);
    if (res.ok) setSaveError("");
    else {
      dirty.current = true;
      setSaveError(`Your latest changes could not be saved${res.error ? ` (${res.error})` : ""}. Retrying…`);
      timer.current = window.setTimeout(() => void flushRef.current(), 5000);
    }
  }, [adapter]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    latest.current = state;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [state, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide as () => void);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide as () => void);
      void flush();
    };
  }, [flush]);

  const update = useCallback((fn: (s: PcState) => PcState) => setState((s) => fn(s)), []);

  // -- navigation -----------------------------------------------------------------
  const setScreen = useCallback((s: Screen) => {
    setScreenRaw(s);
    window.scrollTo(0, 0);
  }, []);

  const goTab = useCallback(
    (tab: TabName) => {
      setState((s) => (s.activeTab === tab ? s : { ...s, activeTab: tab }));
      window.scrollTo(0, 0);
    },
    [],
  );

  // -- drawer ---------------------------------------------------------------------
  const lastFocus = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const openDrawer = useCallback((view: DrawerView, back: DrawerView | null = null) => {
    setDrawer((d) => {
      if (!d.open && document.activeElement instanceof HTMLElement) lastFocus.current = document.activeElement;
      return { open: true, view, back, nonce: d.nonce + 1 };
    });
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawer((d) => ({ ...d, open: false, back: null }));
  }, []);

  useEffect(() => {
    if (drawer.open) {
      closeBtn.current?.focus();
    } else if (lastFocus.current) {
      lastFocus.current.focus?.();
      lastFocus.current = null;
    }
  }, [drawer.open, drawer.nonce]);

  useEffect(() => {
    if (!drawer.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer.open, closeDrawer]);

  // -- misc actions ---------------------------------------------------------------
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openEvidenceFile = useCallback(
    async (file: StoredEvidenceFile) => {
      const url = await adapter.openEvidence(file.path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setToast("This file could not be opened right now.");
    },
    [adapter],
  );

  const resetWorkspace = useCallback(() => {
    setState(defaultState());
    setDrawer((d) => ({ ...d, open: false, back: null }));
    setObFilter("all");
    setObStateFilter("all");
    setCalFilter("all");
    setObQuery("");
    setCalQuery("");
    setSetupOrigin("landing");
    setScreen("landing");
  }, [setScreen]);

  const ctx: PcCtx = {
    state,
    update,
    clock,
    tasks,
    adapter,
    screen,
    setScreen,
    setupOrigin,
    setSetupOrigin,
    openDrawer,
    closeDrawer,
    goTab,
    obFilter,
    setObFilter,
    obStateFilter,
    setObStateFilter,
    calFilter,
    setCalFilter,
    obQuery,
    setObQuery,
    calQuery,
    setCalQuery,
    openEvidenceFile,
    notify: setToast,
    resetWorkspace,
  };

  const supportCount = state.inquiries.length + (state.review ? 1 : 0);
  const effectiveScreen: Screen = screen === "app" && !state.profileSet ? "landing" : screen;
  const meta = drawerMeta(drawer.view);

  return (
    <div className="pcx" data-testid="payments-comply">
      {effectiveScreen === "landing" && <Landing ctx={ctx} />}
      {effectiveScreen === "licence" && <SetupLicence ctx={ctx} />}
      {effectiveScreen === "operating" && <SetupOperating ctx={ctx} />}
      {effectiveScreen === "baseline" && <SetupBaseline ctx={ctx} />}

      {effectiveScreen === "app" && (
        <section className="screen active" id="screen-app">
          <header className="masthead app-masthead">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true"></div>
              <div>
                <span className="brand-name">Beacon</span>
                <span className="brand-sub" id="profile-summary">
                  {profileText(state.profile)}
                </span>
              </div>
            </div>
            <div className="masthead-actions">
              <button type="button" className="link-btn" id="back-compliance-home" onClick={() => setScreen("landing")}>
                ← Compliance home
              </button>
              <button type="button" className="link-btn" id="open-profile" onClick={() => openDrawer({ kind: "profile" })}>
                Compliance profile
              </button>
              <button type="button" className="link-btn" id="open-expert" onClick={() => openDrawer({ kind: "expert", contextId: null })}>
                {supportCount ? `Expert Support · ${supportCount}` : "Expert Support"}
              </button>
              <button type="button" className="btn primary small" id="header-report-event" onClick={() => openDrawer({ kind: "event" })}>
                + Report change or event
              </button>
            </div>
          </header>
          <nav className="app-tabs" aria-label="Payments compliance sections">
            {TABS.map(([name, label]) => (
              <button
                type="button"
                key={name}
                className={`app-tab${state.activeTab === name ? " active" : ""}`}
                data-tab={name}
                aria-current={state.activeTab === name ? "page" : undefined}
                onClick={() => {
                  if (name === "obligations") setObStateFilter("all");
                  goTab(name);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <main className="app-shell">
            {state.activeTab === "home" && <HomePanel ctx={ctx} />}
            {state.activeTab === "obligations" && <ObligationsPanel ctx={ctx} />}
            {state.activeTab === "calendar" && <CalendarPanel ctx={ctx} />}
            {state.activeTab === "evidence" && <EvidencePanel ctx={ctx} />}
          </main>
          <button type="button" className="fab" id="fab-event" onClick={() => openDrawer({ kind: "event" })}>
            + Report change or event
          </button>
        </section>
      )}

      <div className={`backdrop${drawer.open ? " open" : ""}`} id="backdrop" onClick={closeDrawer}></div>
      <aside
        className={`drawer${drawer.open ? " open" : ""}`}
        id="drawer"
        role="dialog"
        aria-modal="true"
        aria-hidden={!drawer.open}
        aria-labelledby="drawer-title"
      >
        <div className="drawer-head">
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            {drawer.back && (
              <button type="button" className="drawer-back" id="drawer-back" aria-label="Back" onClick={() => drawer.back && openDrawer(drawer.back)}>
                ←
              </button>
            )}
            <div>
              <div className="drawer-kicker" id="drawer-kicker">
                {meta.kicker}
              </div>
              <h2 id="drawer-title">{meta.title}</h2>
            </div>
          </div>
          <button type="button" className="drawer-close" id="drawer-close" aria-label="Close" ref={closeBtn} onClick={closeDrawer}>
            ×
          </button>
        </div>
        <DrawerBody key={`${drawer.nonce}-${viewKey(drawer.view)}`} ctx={ctx} view={drawer.view} />
      </aside>

      {(toast || saveError) && (
        <div className="save-toast" role="status">
          {saveError || toast}
        </div>
      )}
    </div>
  );
}
