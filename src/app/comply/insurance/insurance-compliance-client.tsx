"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type ComplianceCatalogFee,
  type ComplianceControl,
  type ComplianceEvent,
  type MemberComplianceProfile,
  type MemberControlState,
  type MemberLoggedEvent,
  type Obligation,
} from "@/lib/types";
import {
  type ProfileFields,
  profileFromRow,
  appliesTo,
  obligationApplies,
  profileSummaryText,
  validateProfile,
  coverageWarning,
  parseISODate,
  todayDate,
  daysBetween,
  fmtDate,
  fmtDateTime,
  localDateTimeInputValue,
  indexById,
  intervalDaysForCadence,
  INSURANCE_ROUTE_LABEL,
  INSURANCE_BUSINESS_LINE_LABEL,
} from "@/lib/compliance-engine";
import styles from "./insurance-compliance.module.css";

// FITSPA Compliance Platform-styled Insurance Comply workspace. Same component architecture and
// CSS class vocabulary as digital-lending-compliance-client.tsx (and the
// same shared @/lib/compliance-engine applicability rules), adapted for two
// real differences between this catalog and Digital Lending / Payments:
//
//  - No dated regulatory calendar. The 6 source IRA licensing-guideline
//    documents seeded for insurance_compliance_assistant contain no
//    gazetted due-date calendar, so (per the project's grounding rule) there
//    are zero compliance_calendar_tasks rows for this catalog and no
//    member_calendar_task_state to persist against. Digital Lending's
//    dated-task machinery (TaskRow, TaskStateFields, the workflow-status
//    drawer, overdue/soon dashboard metrics) is therefore dropped entirely
//    rather than ported with nothing behind it. The Calendar tab instead
//    derives a read-only view by grouping the 21 applicable obligations by
//    their free-text `cadence` field (falling back to `legal_deadline` for
//    display) -- see CalendarPanel below.
//  - A licence-route profile question (Insurer/Reinsurer, Broker, Agent,
//    HMO) plus, only for the Insurer and Broker routes, a life/non-life
//    business-line question -- both answered from the ProfileFields.route /
//    .business_line columns and INSURANCE_ROUTE_LABEL / INSURANCE_
//    BUSINESS_LINE_LABEL already added to compliance-engine.ts. No other
//    profile question applies to this catalog (see validateProfile()'s
//    INSURANCE_CATALOG_KEY branch), so the wizard is a single short section
//    rather than Digital Lending's required-plus-optional split.
//
// Events, Controls and Fees are otherwise first-class, separately fetched
// Supabase data exactly as in Digital Lending, and keep the same panel/
// drawer shapes and member_logged_events / member_control_state persistence.

type ControlStateFields = Pick<MemberControlState, "status" | "last_reviewed">;
function defaultControlState(): ControlStateFields {
  return { status: "Effective", last_reviewed: null };
}

type Tab = "dashboard" | "calendar" | "events" | "obligations" | "controls" | "fees";

type DrawerState = { eyebrow: string; title: string; body: ReactNode } | null;

// Insurance obligations have no legal_due date to rank by, so severity
// (Critical/High/Medium) takes the place of the overdue/soon/scheduled
// status tag the Digital Lending dated-task list uses -- reusing the same
// badge colour classes (overdue=red, action=amber, upcoming=grey) that
// already exist in the shared CSS module.
function severityBadgeClass(severity: string | null): "overdue" | "action" | "upcoming" {
  if (severity === "Critical") return "overdue";
  if (severity === "High") return "action";
  return "upcoming";
}

// Ordering for the Calendar tab's cadence groups: continuous obligations
// first (nothing to schedule, but everything to maintain), then shortest
// to longest recurring period, then anything else alphabetically.
const CADENCE_ORDER = [
  "Continuous",
  "Continuous; renew before expiry",
  "Quarterly",
  "Annual",
  "Annual (non-life only)",
  "Every 2 years",
  "Every 3 years",
];
function cadenceRank(cadence: string): number {
  const i = CADENCE_ORDER.indexOf(cadence);
  return i === -1 ? CADENCE_ORDER.length : i;
}

export default function InsuranceComplianceClient({
  memberId,
  catalogKey,
  initialProfile,
  events,
  controls,
  obligations,
  catalogFees,
  initialLoggedEvents,
  initialControlStates,
}: {
  memberId: string;
  catalogKey: string;
  initialProfile: MemberComplianceProfile | null;
  events: ComplianceEvent[];
  controls: ComplianceControl[];
  obligations: Obligation[];
  catalogFees: ComplianceCatalogFee[];
  initialLoggedEvents: MemberLoggedEvent[];
  initialControlStates: MemberControlState[];
}) {
  const supabase = createClient();
  const router = useRouter();

  const [profileSet, setProfileSet] = useState<boolean>(initialProfile?.profile_set ?? false);
  const [appliedProfile, setAppliedProfile] = useState<ProfileFields>(profileFromRow(initialProfile));
  const [draftProfile, setDraftProfile] = useState<ProfileFields>(profileFromRow(initialProfile));
  const [screen, setScreen] = useState<"wizard" | "app">(profileSet ? "app" : "wizard");
  const [savingProfile, setSavingProfile] = useState(false);

  const [controlStates, setControlStates] = useState<Record<string, ControlStateFields>>(() =>
    Object.fromEntries(initialControlStates.map((r) => [r.control_id, r]))
  );
  const [loggedEvents, setLoggedEvents] = useState<MemberLoggedEvent[]>(initialLoggedEvents);
  const [activity, setActivity] = useState<{ text: string; date: string }[]>([]);

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [calSearch, setCalSearch] = useState("");
  const [obSearch, setObSearch] = useState("");
  const [obDomain, setObDomain] = useState("all");
  const [obType, setObType] = useState("all");
  const [drawer, setDrawer] = useState<DrawerState>(null);

  function addActivity(text: string) {
    setActivity((prev) => [{ text, date: new Date().toISOString() }, ...prev].slice(0, 12));
  }

  function getControlState(controlId: string): ControlStateFields {
    return controlStates[controlId] ?? defaultControlState();
  }

  async function updateControlState(controlId: string, patch: Partial<ControlStateFields>) {
    const merged = { ...getControlState(controlId), ...patch };
    setControlStates((s) => ({ ...s, [controlId]: merged }));
    const { error } = await supabase.from("member_control_state").upsert(
      {
        member_id: memberId,
        control_id: controlId,
        status: merged.status,
        last_reviewed: merged.last_reviewed || null,
      },
      { onConflict: "member_id,control_id" }
    );
    if (error) console.error("Failed to save control state", error);
  }

  async function logEvent(eventId: string, chosenDate: Date, deadline: Date, label: string) {
    const { data, error } = await supabase
      .from("member_logged_events")
      .insert({
        member_id: memberId,
        event_id: eventId,
        chosen_date: chosenDate.toISOString(),
        deadline: deadline.toISOString(),
        status: "open",
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Failed to log event", error);
      return;
    }
    setLoggedEvents((prev) => [data as MemberLoggedEvent, ...prev]);
    addActivity(`Logged event: ${label}`);
  }

  async function resolveLoggedEvent(logId: string, label: string) {
    setLoggedEvents((prev) => prev.map((l) => (l.id === logId ? { ...l, status: "closed" } : l)));
    const { error } = await supabase.from("member_logged_events").update({ status: "closed" }).eq("id", logId);
    if (error) console.error("Failed to resolve event", error);
    else addActivity(`Resolved: ${label}`);
  }

  async function saveProfile() {
    setSavingProfile(true);
    // Only route and business_line are meaningful for this catalog (see
    // validateProfile()'s INSURANCE_CATALOG_KEY branch) -- unlike Digital
    // Lending's upsert, which spreads its whole richer profile shape, this
    // writes just the two columns this catalog actually uses so the row
    // doesn't carry a pile of empty-string fields from unrelated catalogs.
    const { error } = await supabase.from("member_compliance_profile").upsert(
      {
        member_id: memberId,
        catalog_key: catalogKey,
        route: draftProfile.route || null,
        business_line: draftProfile.business_line || null,
        profile_set: true,
      },
      { onConflict: "member_id,catalog_key" }
    );
    setSavingProfile(false);
    if (error) {
      console.error("Failed to save profile", error);
      return;
    }
    setAppliedProfile(draftProfile);
    setProfileSet(true);
    setScreen("app");
    addActivity("Compliance essentials saved");
    router.refresh();
  }

  // ---- Applicable data, filtered by profile ----

  const applicableEvents = useMemo(
    () => events.filter((e) => appliesTo(e.applies_to, appliedProfile, catalogKey)),
    [events, appliedProfile, catalogKey]
  );
  const applicableControls = useMemo(
    () => controls.filter((c) => appliesTo(c.applies_to, appliedProfile, catalogKey)),
    [controls, appliedProfile, catalogKey]
  );
  const applicableObligations = useMemo(
    () => obligations.filter((o) => obligationApplies(o, appliedProfile, catalogKey)),
    [obligations, appliedProfile, catalogKey]
  );
  const criticalObligations = useMemo(
    () => applicableObligations.filter((o) => o.severity === "Critical"),
    [applicableObligations]
  );

  const eventsById = useMemo(() => indexById(events, "id"), [events]);

  const controlsToReview = useMemo(
    () => applicableControls.filter((c) => ["Needs attention", "Exception"].includes(getControlState(c.id).status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableControls, controlStates]
  );
  const openLoggedEvents = useMemo(
    () =>
      loggedEvents
        .filter((l) => l.status !== "closed")
        .slice()
        .sort((a, b) => new Date(a.deadline ?? a.chosen_date).getTime() - new Date(b.deadline ?? b.chosen_date).getTime()),
    [loggedEvents]
  );

  function jumpToCalendar(search: string) {
    setActiveTab("calendar");
    setCalSearch(search);
    setDrawer(null);
  }

  function closeDrawer() {
    setDrawer(null);
  }

  function openEventFormDrawer(ev: ComplianceEvent) {
    setDrawer({
      eyebrow: "Log an event",
      title: ev.trigger_name,
      body: <EventFormBody ev={ev} onLog={logEvent} onClose={closeDrawer} />,
    });
  }

  function openObligationDrawer(o: Obligation) {
    setDrawer({
      eyebrow: `${o.external_id ?? ""} · ${o.domain ?? "General"}`,
      title: o.title,
      body: <ObligationDrawerBody o={o} onJumpToCalendar={jumpToCalendar} />,
    });
  }

  function openControlDrawer(c: ComplianceControl) {
    setDrawer({
      eyebrow: "Continuous control",
      title: c.objective,
      body: <ControlDrawerBody c={c} state={getControlState(c.id)} onUpdate={(patch) => updateControlState(c.id, patch)} />,
    });
  }

  const routeLabel = INSURANCE_ROUTE_LABEL[appliedProfile.route] || "Insurance";

  if (screen === "wizard") {
    return (
      <div className={styles.dcRoot}>
        <ProfileWizard
          profile={draftProfile}
          setProfile={setDraftProfile}
          canBuild={validateProfile(draftProfile, catalogKey)}
          saving={savingProfile}
          onSave={saveProfile}
          onCancel={profileSet ? () => setScreen("app") : undefined}
        />
      </div>
    );
  }

  return (
    <div className={styles.dcRoot}>
      <header className={styles["workspace-head"]}>
        <div className={styles["workspace-left"]}>
          <span className={styles["workspace-title"]}>Insurance Compliance</span>
          <span className={styles["route-pill"]}>{routeLabel}</span>
          {criticalObligations.length > 0 && (
            <span className={`${styles.badge} ${styles.overdue}`}>{criticalObligations.length} critical</span>
          )}
        </div>
        <div className={styles["workspace-actions"]}>
          <button
            className={styles.ghost}
            onClick={() =>
              setDrawer({
                eyebrow: "Log an event",
                title: "What happened?",
                body: <EventPickerBody events={applicableEvents} onPick={(ev) => openEventFormDrawer(ev)} />,
              })
            }
          >
            Log an event
          </button>
          <button
            className={styles.ghost}
            onClick={() => {
              setDraftProfile(appliedProfile);
              setScreen("wizard");
            }}
          >
            Edit profile
          </button>
        </div>
      </header>

      <nav className={styles["workspace-tabs"]}>
        {(
          [
            ["dashboard", "Dashboard"],
            ["calendar", "Calendar"],
            ["events", "Events"],
            ["obligations", "Obligations"],
            ["controls", "Controls"],
            ["fees", "Fees & capital"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${activeTab === key ? styles.active : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className={styles["app-shell"]}>
        <main className={styles.main}>
          {activeTab === "dashboard" && (
            <DashboardPanel
              applicableObligations={applicableObligations}
              criticalObligations={criticalObligations}
              applicableEventsCount={applicableEvents.length}
              controlsToReview={controlsToReview}
              activity={activity}
              coverageWarningText={coverageWarning(catalogKey)}
              onOpenObligation={openObligationDrawer}
              onOpenControl={openControlDrawer}
            />
          )}
          {activeTab === "calendar" && (
            <CalendarPanel
              obligations={applicableObligations}
              search={calSearch}
              setSearch={setCalSearch}
              onOpen={openObligationDrawer}
            />
          )}
          {activeTab === "events" && (
            <EventsPanel
              events={applicableEvents}
              openLoggedEvents={openLoggedEvents}
              eventsById={eventsById}
              onOpenForm={openEventFormDrawer}
              onResolve={resolveLoggedEvent}
            />
          )}
          {activeTab === "obligations" && (
            <ObligationsPanel
              obligations={applicableObligations}
              search={obSearch}
              setSearch={setObSearch}
              domain={obDomain}
              setDomain={setObDomain}
              obType={obType}
              setObType={setObType}
              onOpen={openObligationDrawer}
            />
          )}
          {activeTab === "controls" && (
            <ControlsPanel controls={applicableControls} getControlState={getControlState} onOpen={openControlDrawer} />
          )}
          {activeTab === "fees" && <FeesPanel fees={catalogFees} />}
        </main>
        <aside className={styles.right}>
          <RightRail
            appliedProfile={appliedProfile}
            catalogKey={catalogKey}
            routeLabel={routeLabel}
            applicableObligationsCount={applicableObligations.length}
            criticalCount={criticalObligations.length}
            controlsToReviewCount={controlsToReview.length}
            eventsCount={applicableEvents.length}
            onEditProfile={() => {
              setDraftProfile(appliedProfile);
              setScreen("wizard");
            }}
            onLogEvent={() =>
              setDrawer({
                eyebrow: "Log an event",
                title: "What happened?",
                body: <EventPickerBody events={applicableEvents} onPick={(ev) => openEventFormDrawer(ev)} />,
              })
            }
          />
        </aside>
      </div>

      <div className={`${styles.overlay} ${drawer ? styles.open : ""}`} onClick={closeDrawer} />
      <aside className={`${styles.drawer} ${drawer ? styles.open : ""}`}>
        <div className={styles["drawer-head"]}>
          <div>
            <div className={styles["drawer-eyebrow"]}>{drawer?.eyebrow}</div>
            <h2>{drawer?.title}</h2>
          </div>
          <button className={styles["drawer-close"]} onClick={closeDrawer} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles["drawer-body"]}>{drawer?.body}</div>
        <div className={styles["drawer-footer"]}>
          <span />
          <button className={styles.subtle} onClick={closeDrawer}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile wizard
// ---------------------------------------------------------------------------

function OptionGroup({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: { val: string; label: string }[];
  onSelect: (val: string) => void;
}) {
  return (
    <div className={styles["choice-row"]}>
      {options.map((o) => (
        <button
          key={o.val}
          type="button"
          className={`${styles.choice} ${value === o.val ? styles.selected : ""}`}
          onClick={() => onSelect(o.val)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ROUTE_OPTIONS = Object.entries(INSURANCE_ROUTE_LABEL).map(([val, label]) => ({ val, label }));
const BUSINESS_LINE_OPTIONS = Object.entries(INSURANCE_BUSINESS_LINE_LABEL).map(([val, label]) => ({ val, label }));

function ProfileWizard({
  profile,
  setProfile,
  canBuild,
  saving,
  onSave,
  onCancel,
}: {
  profile: ProfileFields;
  setProfile: (updater: (p: ProfileFields) => ProfileFields) => void;
  canBuild: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel?: () => void;
}) {
  function patch(p: Partial<ProfileFields>) {
    setProfile((prev) => ({ ...prev, ...p }));
  }
  const needsBusinessLine = profile.route === "insurer" || profile.route === "broker";

  return (
    <main className={styles["profile-wrap"]}>
      <div className={styles["profile-top"]}>
        <div className={styles.eyebrow}>{onCancel ? "Profile & registrations" : "First-time setup"}</div>
        <h2>Set up the essentials.</h2>
        <p>
          Give FITSPA Compliance Platform the few facts it needs to build your insurance compliance workspace. Your IRA licence route —
          and, for Insurers and Brokers, whether you write life, non-life or both — decides which obligations,
          event-triggered clocks and controls apply to you.
        </p>
      </div>

      <section className={styles["profile-section"]}>
        <h3>IRA licence route</h3>
        <div className={styles.field}>
          <label>Which IRA licence route describes your business?</label>
          <p className={styles["field-help"]}>
            Insurer/Reinsurer, Insurance/Reinsurance Broker, Insurance Agent or Health Membership Organisation (HMO).
          </p>
          <OptionGroup value={profile.route} options={ROUTE_OPTIONS} onSelect={(v) => patch({ route: v })} />
        </div>
        {needsBusinessLine && (
          <div className={styles.field}>
            <label>Which business line do you write?</label>
            <p className={styles["field-help"]}>
              Only Insurers and Brokers need this — Agents and HMOs are single-track under the IRA guidelines.
            </p>
            <OptionGroup
              value={profile.business_line}
              options={BUSINESS_LINE_OPTIONS}
              onSelect={(v) => patch({ business_line: v })}
            />
          </div>
        )}
      </section>

      <div className={styles["profile-actions"]}>
        {onCancel ? (
          <button className={styles.btn} onClick={onCancel}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        <button className={`${styles.btn} ${styles.primary}`} disabled={!canBuild || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save and build workspace →"}
        </button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function ObligationRows({ rows, empty, onOpen }: { rows: Obligation[]; empty: string; onOpen: (o: Obligation) => void }) {
  if (rows.length === 0) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles["work-list"]}>
      {rows.slice(0, 8).map((o) => (
        <div key={o.id} className={styles["work-row"]}>
          <div>
            <div className={styles["work-title-line"]}>
              <button className={styles["work-title"]} onClick={() => onOpen(o)}>
                {o.title}
              </button>
            </div>
            <div className={styles["work-sub"]}>
              {o.domain || "General"} · {o.cadence || "—"}
            </div>
          </div>
          <div className={styles["row-date"]}>
            <strong>Legal deadline</strong>
            <br />
            {o.legal_deadline || "—"}
          </div>
          <div className={styles["row-owner"]}>{o.owner_role || "Unassigned"}</div>
          <button className={styles["row-action"]} onClick={() => onOpen(o)}>
            Open
          </button>
        </div>
      ))}
    </div>
  );
}

function DashboardPanel({
  applicableObligations,
  criticalObligations,
  applicableEventsCount,
  controlsToReview,
  activity,
  coverageWarningText,
  onOpenObligation,
  onOpenControl,
}: {
  applicableObligations: Obligation[];
  criticalObligations: Obligation[];
  applicableEventsCount: number;
  controlsToReview: ComplianceControl[];
  activity: { text: string; date: string }[];
  coverageWarningText: string;
  onOpenObligation: (o: Obligation) => void;
  onOpenControl: (c: ComplianceControl) => void;
}) {
  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Dashboard</h1>
          <p>What&apos;s critical, what still needs a control review, and the event-triggered clocks that apply to you.</p>
        </div>
      </div>
      <div className={styles["metric-grid"]}>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Applicable obligations</div>
          <div className={styles["metric-value"]}>{applicableObligations.length}</div>
          <div className={styles["metric-note"]}>From the IRA licensing-guideline library</div>
        </div>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Critical severity</div>
          <div className={`${styles["metric-value"]} ${criticalObligations.length ? styles.danger : ""}`}>{criticalObligations.length}</div>
          <div className={styles["metric-note"]}>Capital, solvency and licence-renewal obligations</div>
        </div>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Controls to review</div>
          <div className={`${styles["metric-value"]} ${controlsToReview.length ? styles.warn : ""}`}>{controlsToReview.length}</div>
          <div className={styles["metric-note"]}>Flagged &quot;Needs attention&quot; or &quot;Exception&quot;</div>
        </div>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Event-triggered clocks</div>
          <div className={styles["metric-value"]}>{applicableEventsCount}</div>
          <div className={styles["metric-note"]}>Log an event to start one</div>
        </div>
      </div>

      <div className={`${styles.note} ${styles.warn}`}>{coverageWarningText}</div>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Critical obligations</h2>
          <p>Capital, solvency and licence-renewal obligations — the highest-consequence items in your library.</p>
        </div>
        <ObligationRows rows={criticalObligations} empty="No critical-severity obligations apply to this profile." onOpen={onOpenObligation} />
      </section>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Controls to review</h2>
          <p>Flag a continuous control &quot;Needs attention&quot; or &quot;Exception&quot; and it appears here.</p>
        </div>
        {controlsToReview.length === 0 ? (
          <div className={styles.empty}>No controls currently need review.</div>
        ) : (
          <div className={styles["control-strip"]}>
            {controlsToReview.slice(0, 3).map((c) => (
              <div key={c.id} className={styles["control-card"]}>
                <h3>{c.objective}</h3>
                <p>{c.operation || c.evidence || "—"}</p>
                <div className={styles["control-bottom"]}>
                  <span className={`${styles.badge} ${styles.action}`}>Needs attention</span>
                  <button onClick={() => onOpenControl(c)}>Review control</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Recent activity</h2>
        </div>
        {activity.length === 0 ? (
          <div className={styles.empty}>Activity will appear here as you update controls and events this session.</div>
        ) : (
          <div className={styles.activity}>
            {activity.map((a, i) => (
              <div key={i} className={styles["activity-row"]}>
                {a.text}
                <span>{new Date(a.date).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Right rail
// ---------------------------------------------------------------------------

function RightRail({
  appliedProfile,
  catalogKey,
  routeLabel,
  applicableObligationsCount,
  criticalCount,
  controlsToReviewCount,
  eventsCount,
  onEditProfile,
  onLogEvent,
}: {
  appliedProfile: ProfileFields;
  catalogKey: string;
  routeLabel: string;
  applicableObligationsCount: number;
  criticalCount: number;
  controlsToReviewCount: number;
  eventsCount: number;
  onEditProfile: () => void;
  onLogEvent: () => void;
}) {
  return (
    <>
      <section className={styles["rail-card"]}>
        <div className={styles["rail-label"]}>At a glance</div>
        <div className={styles["rail-next"]}>
          {applicableObligationsCount} applicable obligation{applicableObligationsCount === 1 ? "" : "s"}
          <br />
          {criticalCount} critical · {controlsToReviewCount} control{controlsToReviewCount === 1 ? "" : "s"} to review
          <br />
          {eventsCount} event-triggered clock{eventsCount === 1 ? "" : "s"}
        </div>
        <button className={`${styles["rail-btn"]} ${styles.primary}`} onClick={onLogEvent}>
          Log an event
        </button>
      </section>
      <section className={styles["rail-card"]}>
        <div className={styles["rail-label"]}>Profile & registrations</div>
        <div className={styles["rail-profile"]}>
          <strong>{routeLabel}</strong>
          <br />
          {profileSummaryText(appliedProfile, catalogKey)}
        </div>
        <button className={styles["rail-btn"]} onClick={onEditProfile}>
          Edit profile & registrations
        </button>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Calendar — derived, read-only, grouped-by-cadence view
// ---------------------------------------------------------------------------

function CalendarPanel({
  obligations,
  search,
  setSearch,
  onOpen,
}: {
  obligations: Obligation[];
  search: string;
  setSearch: (s: string) => void;
  onOpen: (o: Obligation) => void;
}) {
  let visible = obligations;
  if (search) {
    const term = search.toLowerCase();
    visible = visible.filter((o) => `${o.title} ${o.external_id ?? ""} ${o.domain ?? ""}`.toLowerCase().includes(term));
  }

  const byCadence: Record<string, Obligation[]> = {};
  visible.forEach((o) => {
    const key = o.cadence || "Cadence not specified";
    if (!byCadence[key]) byCadence[key] = [];
    byCadence[key].push(o);
  });
  const order = Object.keys(byCadence).sort((a, b) => cadenceRank(a) - cadenceRank(b) || a.localeCompare(b));

  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Calendar</h1>
          <p>Obligations grouped by their stated cadence. There are no specific dates to track here.</p>
        </div>
        <span className={styles["readonly-pill"]}>Derived · read-only</span>
      </div>

      <div className={`${styles.note} ${styles.warn}`}>
        The IRA&apos;s licensing guidelines do not publish a dated, gazetted compliance calendar for insurance
        licensees — the items below are grouped by their own cadence / legal-deadline text instead of specific
        dates, and have no workflow status, evidence or submission tracking. Open any item for the full obligation
        detail, or use the Obligations tab to search the complete library.
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles["search-box"]}
          placeholder="Search obligations by title, ID or topic…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>No obligations match this search.</div>
      ) : (
        order.map((key) => (
          <div key={key}>
            <div className={styles["cal-group-head"]}>
              {key}
              <span className={styles["cal-group-count"]}>
                {byCadence[key].length} obligation{byCadence[key].length === 1 ? "" : "s"}
              </span>
            </div>
            <div className={styles["cal-item-list"]}>
              {byCadence[key].map((o) => (
                <div key={o.id} className={styles["cal-item"]}>
                  <div>
                    <div className={styles["work-title-line"]}>
                      <span className={styles["ob-id"]}>{o.external_id}</span>
                      <button className={styles["work-title"]} onClick={() => onOpen(o)}>
                        {o.title}
                      </button>
                    </div>
                    <div className={styles["work-sub"]}>{o.domain || "General"}</div>
                  </div>
                  <div className={styles["cal-item-deadline"]}>{o.legal_deadline || "—"}</div>
                  <span className={`${styles.badge} ${styles[severityBadgeClass(o.severity)]}`}>{o.severity || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function EventPickerBody({ events, onPick }: { events: ComplianceEvent[]; onPick: (ev: ComplianceEvent) => void }) {
  if (events.length === 0) return <div className={styles.empty}>No event-triggered clocks apply to this profile.</div>;
  return (
    <div className={styles["event-grid"]}>
      {events.map((ev) => (
        <button key={ev.id} className={styles["event-card"]} onClick={() => onPick(ev)}>
          <h4>{ev.trigger_name}</h4>
          <span>{ev.legal_clock || ev.response || "Open to log this event"}</span>
        </button>
      ))}
    </div>
  );
}

function EventFormBody({
  ev,
  onLog,
  onClose,
}: {
  ev: ComplianceEvent;
  onLog: (eventId: string, chosenDate: Date, deadline: Date, label: string) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() => localDateTimeInputValue(new Date()));
  const [deadline, setDeadline] = useState(() => localDateTimeInputValue(new Date()));
  return (
    <>
      <div className={styles["drawer-section"]}>
        <p>{ev.response || "Tell FITSPA Compliance Platform when this happened, then set the deadline the legal clock below implies."}</p>
      </div>
      <div className={styles["meta-grid"]}>
        <div className={styles["meta-box"]}>
          <label>Legal clock</label>
          <div>{ev.legal_clock || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Applies to</label>
          <div>{ev.applies_to}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Owner</label>
          <div>{ev.owner_role || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Escalation</label>
          <div>{ev.escalation || "—"}</div>
        </div>
      </div>
      {ev.evidence && (
        <div className={styles["drawer-section"]}>
          <h3>Evidence to retain</h3>
          <p>{ev.evidence}</p>
        </div>
      )}
      {ev.source_link && (
        <div className={styles["drawer-section"]}>
          <h3>Source</h3>
          <a className={styles["source-link"]} href={ev.source_link} target="_blank" rel="noopener noreferrer">
            Open source ↗
          </a>
        </div>
      )}
      <div className={styles["field-grid"]}>
        <div className={styles.field}>
          <label>When did this happen?</label>
          <input
            type="datetime-local"
            value={chosen}
            onChange={(e) => {
              setChosen(e.target.value);
              if (deadline === chosen) setDeadline(e.target.value);
            }}
          />
        </div>
        <div className={styles.field}>
          <label>Deadline (per legal clock above)</label>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>
      <div className={styles["drawer-actions"]}>
        <button
          className={styles.save}
          onClick={() => {
            const chosenDate = new Date(chosen);
            const deadlineDate = new Date(deadline);
            if (isNaN(chosenDate.getTime()) || isNaN(deadlineDate.getTime())) return;
            onLog(ev.id, chosenDate, deadlineDate, ev.trigger_name);
            onClose();
          }}
        >
          Log this event
        </button>
      </div>
    </>
  );
}

function EventsPanel({
  events,
  openLoggedEvents,
  eventsById,
  onOpenForm,
  onResolve,
}: {
  events: ComplianceEvent[];
  openLoggedEvents: MemberLoggedEvent[];
  eventsById: Record<string, ComplianceEvent>;
  onOpenForm: (ev: ComplianceEvent) => void;
  onResolve: (logId: string, label: string) => void;
}) {
  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Events</h1>
          <p>Log the moment an event happens. Read the legal clock, then set the deadline it implies.</p>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Active triggered actions</h2>
        </div>
        {openLoggedEvents.length === 0 ? (
          <div className={styles.empty}>No open triggered actions. Log an event below when something happens.</div>
        ) : (
          openLoggedEvents.map((l) => {
            const ev = eventsById[l.event_id];
            const deadline = l.deadline ? new Date(l.deadline) : null;
            const remaining = deadline ? daysBetween(deadline, new Date()) : null;
            const overdueTxt = remaining !== null && remaining < 0 ? " — OVERDUE" : "";
            return (
              <div key={l.id} className={styles["logged-row"]}>
                <span>
                  {ev ? ev.trigger_name : l.event_id} — <span className={styles["lp-deadline"]}>{deadline ? fmtDateTime(deadline) : "—"}{overdueTxt}</span>
                </span>
                <button className={styles["row-action"]} onClick={() => onResolve(l.id, ev ? ev.trigger_name : l.event_id)}>
                  Mark resolved
                </button>
              </div>
            );
          })
        )}
      </section>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Event-triggered clocks</h2>
          <p>Click an event to log it and start its deadline.</p>
        </div>
        {events.length === 0 ? (
          <div className={styles.empty}>No event-triggered clocks apply to this profile.</div>
        ) : (
          <div className={styles["event-grid"]}>
            {events.map((ev) => (
              <button key={ev.id} className={styles["event-card"]} onClick={() => onOpenForm(ev)}>
                <h4>{ev.trigger_name}</h4>
                <span>
                  <b>Legal clock:</b> {ev.legal_clock || "—"}
                </span>
                <br />
                <span>
                  <b>Applies to:</b> {ev.applies_to}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

function ObligationsPanel({
  obligations,
  search,
  setSearch,
  domain,
  setDomain,
  obType,
  setObType,
  onOpen,
}: {
  obligations: Obligation[];
  search: string;
  setSearch: (s: string) => void;
  domain: string;
  setDomain: (s: string) => void;
  obType: string;
  setObType: (s: string) => void;
  onOpen: (o: Obligation) => void;
}) {
  let visible = obligations;
  if (search) {
    const term = search.toLowerCase();
    visible = visible.filter((o) => `${o.title} ${o.external_id ?? ""} ${o.domain ?? ""}`.toLowerCase().includes(term));
  }
  if (domain !== "all") visible = visible.filter((o) => (o.domain || "General") === domain);
  if (obType !== "all") visible = visible.filter((o) => (o.obligation_type || "") === obType);

  const domains = useMemo(() => [...new Set(obligations.map((o) => o.domain || "General"))].sort(), [obligations]);
  const types = useMemo(
    () => [...new Set(obligations.map((o) => o.obligation_type).filter((v): v is string => !!v))].sort(),
    [obligations]
  );

  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Obligations</h1>
          <p>The complete applicable regulatory library, drawn from the IRA&apos;s licensing guidelines. Use it to understand the rule, then open it for cadence and source detail.</p>
        </div>
      </div>
      <div className={styles["lib-toolbar"]}>
        <input placeholder="Search obligations or source…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="all">All topics</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={obType} onChange={(e) => setObType(e.target.value)}>
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>No obligations match this search.</div>
      ) : (
        <div className={styles["work-list"]}>
          {visible.map((o) => (
            <div key={o.id} className={styles["ob-row"]}>
              <div>
                <div className={styles["work-title-line"]}>
                  <span className={styles["ob-id"]}>{o.external_id}</span>
                  <button className={styles["work-title"]} onClick={() => onOpen(o)}>
                    {o.title}
                  </button>
                </div>
                <div className={styles["work-sub"]}>
                  {o.domain || "General"} · {o.severity || "—"}
                </div>
              </div>
              <div className={styles["ob-clock"]}>{o.cadence || o.trigger_event || "—"}</div>
              <div className={styles.behaviour}>{o.obligation_type || "—"}</div>
              <button className={styles["row-action"]} onClick={() => onOpen(o)}>
                Open
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ObligationDrawerBody({
  o,
  onJumpToCalendar,
}: {
  o: Obligation;
  onJumpToCalendar: (search: string) => void;
}) {
  return (
    <>
      <div className={styles["meta-grid"]}>
        <div className={styles["meta-box"]}>
          <label>Legal reference</label>
          <div>{o.legal_ref || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Cadence</label>
          <div>{o.cadence || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Legal deadline</label>
          <div>{o.legal_deadline || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Owner / reviewer</label>
          <div>
            {o.owner_role || "—"} / {o.reviewer_role || "—"}
          </div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Evidence needed</label>
          <div>{o.evidence_needed || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Submission channel</label>
          <div>{o.submission_channel || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Authority</label>
          <div>{o.authority || "—"}</div>
        </div>
      </div>
      {o.description && (
        <div className={styles["drawer-section"]}>
          <h3>What this means</h3>
          <p>{o.description}</p>
        </div>
      )}
      {o.due_logic && (
        <div className={styles["drawer-section"]}>
          <h3>Due logic</h3>
          <p>{o.due_logic}</p>
        </div>
      )}
      <div className={styles["drawer-section"]}>
        <h3>Source</h3>
        <p>{o.source_doc_name || "—"}</p>
      </div>
      <div className={styles["drawer-actions"]}>
        <button className={styles.subtle} onClick={() => onJumpToCalendar(o.external_id || o.title)}>
          View in Calendar tab →
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function ControlsPanel({
  controls,
  getControlState,
  onOpen,
}: {
  controls: ComplianceControl[];
  getControlState: (controlId: string) => ControlStateFields;
  onOpen: (c: ComplianceControl) => void;
}) {
  if (controls.length === 0) {
    return (
      <>
        <div className={styles["page-head"]}>
          <div>
            <h1>Controls</h1>
          </div>
        </div>
        <div className={styles.empty}>No continuous controls apply to this profile.</div>
      </>
    );
  }
  const byDomain: Record<string, ComplianceControl[]> = {};
  const order: string[] = [];
  controls.forEach((c) => {
    const d = c.domain || "General";
    if (!byDomain[d]) {
      byDomain[d] = [];
      order.push(d);
    }
    byDomain[d].push(c);
  });

  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Controls</h1>
          <p>Continuous and transaction controls remain active over time. Review them and record exceptions when something is wrong.</p>
        </div>
      </div>
      {order.map((domain) => (
        <div key={domain} className={styles.section}>
          <div className={styles["cal-month"]}>{domain}</div>
          <div className={styles["controls-grid"]}>
            {byDomain[domain].map((c) => {
              const st = getControlState(c.id);
              const badgeCls = st.status === "Exception" ? "overdue" : st.status === "Needs attention" ? "action" : "closed";
              return (
                <div key={c.id} className={styles["big-control"]}>
                  <h3>{c.objective}</h3>
                  <p>{c.operation || "—"}</p>
                  <div className={styles["control-meta"]}>
                    <span>{c.cadence || "—"}</span>
                    {st.last_reviewed && <span>Last review {fmtDate(parseISODate(st.last_reviewed))}</span>}
                  </div>
                  <div className={styles["control-actions"]}>
                    <span className={`${styles.badge} ${styles[badgeCls]}`}>{st.status}</span>
                    <button className={styles["row-action"]} onClick={() => onOpen(c)}>
                      Review control
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function ControlDrawerBody({
  c,
  state,
  onUpdate,
}: {
  c: ComplianceControl;
  state: ControlStateFields;
  onUpdate: (patch: Partial<ControlStateFields>) => void;
}) {
  const interval = intervalDaysForCadence(c.cadence);
  let nextCheckText = "";
  if (interval && state.last_reviewed) {
    const next = parseISODate(state.last_reviewed);
    if (next) {
      next.setDate(next.getDate() + interval);
      const rem = daysBetween(next, todayDate());
      nextCheckText = `Next check: ${fmtDate(next)}${rem < 0 ? " — overdue" : ""}`;
    }
  }
  return (
    <>
      <div className={styles["meta-grid"]}>
        <div className={styles["meta-box"]}>
          <label>Status</label>
          <div>{state.status}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Last reviewed</label>
          <div>{state.last_reviewed ? fmtDate(parseISODate(state.last_reviewed)) : "Not recorded"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Cadence</label>
          <div>{c.cadence || "—"}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Owner / reviewer</label>
          <div>
            {c.owner_role || "—"} / {c.reviewer_role || "—"}
          </div>
        </div>
      </div>
      <div className={styles["drawer-section"]}>
        <h3>What this control maintains</h3>
        <p>{c.operation || "—"}</p>
      </div>
      <div className={styles["drawer-section"]}>
        <h3>Evidence / test</h3>
        <p>{c.evidence || "—"}</p>
      </div>
      {c.failure_response && (
        <div className={styles["drawer-section"]}>
          <h3>If this fails</h3>
          <p>{c.failure_response}</p>
        </div>
      )}
      {c.source_link && (
        <div className={styles["drawer-section"]}>
          <h3>Source</h3>
          <a className={styles["source-link"]} href={c.source_link} target="_blank" rel="noopener noreferrer">
            Open source ↗
          </a>
        </div>
      )}
      <div className={styles["drawer-section"]}>
        <h3>Review</h3>
        <div className={styles.field}>
          <label>Status</label>
          <select value={state.status} onChange={(e) => onUpdate({ status: e.target.value })}>
            <option value="Effective">Effective</option>
            <option value="Needs attention">Needs attention</option>
            <option value="Exception">Exception</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Last checked</label>
          <input type="date" defaultValue={state.last_reviewed ?? ""} onChange={(e) => onUpdate({ last_reviewed: e.target.value || null })} />
        </div>
        {nextCheckText && <p className={styles["work-sub"]}>{nextCheckText}</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

function FeesPanel({ fees }: { fees: ComplianceCatalogFee[] }) {
  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Fees & capital</h1>
          <p>Fees, deposits and other financial requirements published under the IRA&apos;s insurance licensing guidelines.</p>
        </div>
      </div>
      {fees.length === 0 ? (
        <div className={styles.empty}>No fee schedule published for this catalog yet.</div>
      ) : (
        <div className={styles["cost-list"]}>
          {fees.map((f) => (
            <div key={f.id} className={styles["fee-box"]}>
              <strong>{f.fee_or_requirement}</strong>
              {f.route_or_layer && <div className={styles["fee-line"]}>Route / layer: {f.route_or_layer}</div>}
              {f.amount && <div className={styles["fee-line"]}>Amount: {f.amount}</div>}
              {f.when_due && <div className={styles["fee-line"]}>When due: {f.when_due}</div>}
              {f.treatment && <div className={styles["fee-line"]}>Treatment: {f.treatment}</div>}
              {f.source &&
                (/^https?:\/\//.test(f.source) ? (
                  <div className={styles["fee-line"]}>
                    <a className={styles["source-link"]} href={f.source} target="_blank" rel="noopener noreferrer">
                      view source ↗
                    </a>
                  </div>
                ) : (
                  <div className={styles["fee-line"]}>Source: {f.source}</div>
                ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
