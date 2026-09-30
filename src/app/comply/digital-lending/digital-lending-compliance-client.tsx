"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  WORKFLOW_STATES,
  type ComplianceCalendarTask,
  type ComplianceCatalogFee,
  type ComplianceControl,
  type ComplianceEvent,
  type ComplianceHoliday,
  type ComplianceReminderRule,
  type ComplianceWorkflowState,
  type MemberCalendarTaskState,
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
  validateProfile,
  coverageWarning,
  parseISODate,
  todayDate,
  daysBetween,
  fmtDate,
  fmtDateShort,
  fmtDateTime,
  monthLabel,
  localDateTimeInputValue,
  indexById,
  intervalDaysForCadence,
} from "@/lib/compliance-engine";
import styles from "./digital-lending-compliance.module.css";

// Beacon-styled port of compliance-pathway-client.tsx, scoped to Digital
// Lending only (no catalog switcher). Same Supabase tables/columns and the
// same shared @/lib/compliance-engine applicability rules as the page this
// replaces -- only the presentation layer changes, matching the markup,
// tab structure and copy of the uploaded "Beacon — Digital Lending
// Compliance" prototype (/tmp/beacon-digital-compliance-src.html).
//
// Judgment calls made porting the prototype onto the real, database-backed
// engine (see the final report for the full list):
//  - The prototype's onboarding wizard only asks route/issue-date/fye-date/
//    PDPO questions. The real applicability engine (compliance-engine.ts)
//    instead requires 6 Yes/No answers (money_lender, ndt_mfi, personal_data,
//    collateral, recovery_agents, fitspa_subscriber) to resolve obligations
//    at all. Both question sets are kept: the 6 required ones first, the
//    prototype's richer operating-profile questions in an optional section
//    beneath (mirroring its own "complete the rest later" copy).
//  - The prototype has 4 workspace tabs (Dashboard/Calendar/Obligations/
//    Controls) plus a "Log an event" drawer and inline fee display. The real
//    engine also tracks a full Fees & capital schedule and a real per-member
//    Events log as first-class, separately fetched Supabase data, so this
//    port keeps them as two extra tabs rather than dropping that
//    functionality to match the prototype's tab count.
//  - The prototype's "Reference" material (reminder-rule / workflow-state /
//    public-holiday tables) has no equivalent screen in the prototype; it is
//    kept, appended under the Obligations tab, styled with the same table
//    language as the rest of the page.
//  - The prototype keeps a mocked in-page "Recent activity" feed from
//    localStorage. There is no backing table for that in the real schema, so
//    this port keeps a lightweight, session-only (non-persisted) version for
//    the same UX rather than inventing a new table.
//  - Continuous controls here default to "Effective" (per the existing real
//    schema/UX), not "Not reviewed" as in the prototype's mock state, so the
//    "Controls to review" dashboard metric only counts controls a member has
//    actually flagged "Needs attention" or "Exception".

type TaskStateFields = Pick<MemberCalendarTaskState, "workflow" | "evidence_link" | "submitted_date" | "receipt" | "notes">;
function defaultTaskState(): TaskStateFields {
  return { workflow: "Scheduled", evidence_link: "", submitted_date: null, receipt: "", notes: "" };
}

type ControlStateFields = Pick<MemberControlState, "status" | "last_reviewed">;
function defaultControlState(): ControlStateFields {
  return { status: "Effective", last_reviewed: null };
}

type Tab = "dashboard" | "calendar" | "events" | "obligations" | "controls" | "fees";

type DrawerState = { eyebrow: string; title: string; body: ReactNode } | null;

type TaskRow = { t: ComplianceCalendarTask; due: Date | null; remaining: number | null; statusTag: "overdue" | "soon" | "scheduled" };

const ROUTE_LABEL: Record<string, string> = { ml: "Money Lender", ndt: "NDTMFI" };

export default function DigitalLendingComplianceClient({
  memberId,
  catalogKey,
  initialProfile,
  calendarTasks,
  events,
  controls,
  workflowStates,
  reminderRules,
  holidays,
  obligations,
  catalogFees,
  initialTaskStates,
  initialLoggedEvents,
  initialControlStates,
}: {
  memberId: string;
  catalogKey: string;
  initialProfile: MemberComplianceProfile | null;
  calendarTasks: ComplianceCalendarTask[];
  events: ComplianceEvent[];
  controls: ComplianceControl[];
  workflowStates: ComplianceWorkflowState[];
  reminderRules: ComplianceReminderRule[];
  holidays: ComplianceHoliday[];
  obligations: Obligation[];
  catalogFees: ComplianceCatalogFee[];
  initialTaskStates: MemberCalendarTaskState[];
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

  const [taskStates, setTaskStates] = useState<Record<string, TaskStateFields>>(() =>
    Object.fromEntries(initialTaskStates.map((r) => [r.task_id, r]))
  );
  const [controlStates, setControlStates] = useState<Record<string, ControlStateFields>>(() =>
    Object.fromEntries(initialControlStates.map((r) => [r.control_id, r]))
  );
  const [loggedEvents, setLoggedEvents] = useState<MemberLoggedEvent[]>(initialLoggedEvents);
  const [activity, setActivity] = useState<{ text: string; date: string }[]>([]);

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [calSearch, setCalSearch] = useState("");
  const [calFilter, setCalFilter] = useState<"all" | "overdue" | "soon" | "open" | "closed">("all");
  const [obSearch, setObSearch] = useState("");
  const [obDomain, setObDomain] = useState("all");
  const [obType, setObType] = useState("all");
  const [drawer, setDrawer] = useState<DrawerState>(null);

  function addActivity(text: string) {
    setActivity((prev) => [{ text, date: new Date().toISOString() }, ...prev].slice(0, 12));
  }

  function getTaskState(taskId: string): TaskStateFields {
    return taskStates[taskId] ?? defaultTaskState();
  }
  function getControlState(controlId: string): ControlStateFields {
    return controlStates[controlId] ?? defaultControlState();
  }

  async function updateTaskState(taskId: string, patch: Partial<TaskStateFields>) {
    const merged = { ...getTaskState(taskId), ...patch };
    setTaskStates((s) => ({ ...s, [taskId]: merged }));
    const { error } = await supabase.from("member_calendar_task_state").upsert(
      {
        member_id: memberId,
        task_id: taskId,
        workflow: merged.workflow,
        evidence_link: merged.evidence_link || null,
        submitted_date: merged.submitted_date || null,
        receipt: merged.receipt || null,
        notes: merged.notes || null,
      },
      { onConflict: "member_id,task_id" }
    );
    if (error) console.error("Failed to save calendar task state", error);
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
    const { issue_date, fye_date, pdpo_expiry, ...restDraft } = draftProfile;
    const { error } = await supabase.from("member_compliance_profile").upsert(
      {
        member_id: memberId,
        catalog_key: catalogKey,
        ...restDraft,
        issue_date: issue_date || null,
        fye_date: fye_date || null,
        pdpo_expiry: pdpo_expiry || null,
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

  const applicableTasks = useMemo(() => {
    const out = calendarTasks
      .filter((t) => appliesTo(t.applies_to, appliedProfile, catalogKey))
      .map((t) => {
        const due = parseISODate(t.legal_due);
        const remaining = due ? daysBetween(due, todayDate()) : null;
        const statusTag: "overdue" | "soon" | "scheduled" =
          remaining === null ? "scheduled" : remaining < 0 ? "overdue" : remaining <= 30 ? "soon" : "scheduled";
        return { t, due, remaining, statusTag };
      });
    out.sort((a, b) => (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity));
    return out;
  }, [calendarTasks, appliedProfile, catalogKey]);

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

  const tasksByObligation = useMemo(() => {
    const map: Record<string, ComplianceCalendarTask[]> = {};
    calendarTasks.forEach((t) => {
      if (!map[t.obligation_external_id]) map[t.obligation_external_id] = [];
      map[t.obligation_external_id].push(t);
    });
    return map;
  }, [calendarTasks]);
  const obligationsById = useMemo(() => indexById(obligations, "external_id"), [obligations]);
  const eventsById = useMemo(() => indexById(events, "id"), [events]);

  const overdueTasks = useMemo(
    () => applicableTasks.filter((x) => x.statusTag === "overdue" && getTaskState(x.t.id).workflow !== "Closed"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableTasks, taskStates]
  );
  const soonTasks = useMemo(
    () => applicableTasks.filter((x) => x.statusTag === "soon" && getTaskState(x.t.id).workflow !== "Closed"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableTasks, taskStates]
  );
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

  function openTaskDrawer(x: TaskRow) {
    setDrawer({
      eyebrow: "Scheduled filing",
      title: x.t.task,
      body: <TaskDrawerBody x={x} obligation={obligationsById[x.t.obligation_external_id]} taskState={getTaskState(x.t.id)} onUpdate={(patch) => updateTaskState(x.t.id, patch)} workflowStates={workflowStates} />,
    });
  }

  function openObligationDrawer(o: Obligation) {
    const related = o.external_id ? tasksByObligation[o.external_id] ?? [] : [];
    setDrawer({
      eyebrow: `${o.external_id ?? ""} · ${o.domain ?? "General"}`,
      title: o.title,
      body: <ObligationDrawerBody o={o} related={related} onJumpToCalendar={jumpToCalendar} />,
    });
  }

  function openControlDrawer(c: ComplianceControl) {
    setDrawer({
      eyebrow: "Continuous control",
      title: c.objective,
      body: <ControlDrawerBody c={c} state={getControlState(c.id)} onUpdate={(patch) => updateControlState(c.id, patch)} />,
    });
  }

  const routeLabel = ROUTE_LABEL[appliedProfile.route] || "Digital Lending";

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
          <span className={styles["workspace-title"]}>Digital Lending Compliance</span>
          <span className={styles["route-pill"]}>{routeLabel}</span>
          {overdueTasks.length > 0 && (
            <span className={`${styles.badge} ${styles.overdue}`}>{overdueTasks.length} overdue</span>
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
              applicableTasks={applicableTasks}
              overdueTasks={overdueTasks}
              soonTasks={soonTasks}
              controlsToReview={controlsToReview}
              applicableEventsCount={applicableEvents.length}
              activity={activity}
              coverageWarningText={coverageWarning(catalogKey)}
              onOpenTask={openTaskDrawer}
              onOpenControl={openControlDrawer}
            />
          )}
          {activeTab === "calendar" && (
            <CalendarPanel
              items={applicableTasks}
              search={calSearch}
              setSearch={setCalSearch}
              filter={calFilter}
              setFilter={setCalFilter}
              getTaskState={getTaskState}
              onOpenTask={openTaskDrawer}
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
              reminderRules={reminderRules}
              workflowStates={workflowStates}
              holidays={holidays}
            />
          )}
          {activeTab === "controls" && (
            <ControlsPanel controls={applicableControls} getControlState={getControlState} onOpen={openControlDrawer} />
          )}
          {activeTab === "fees" && <FeesPanel fees={catalogFees} />}
        </main>
        <aside className={styles.right}>
          <RightRail
            overdueTasks={overdueTasks}
            soonTasks={soonTasks}
            appliedProfile={appliedProfile}
            routeLabel={routeLabel}
            onOpenTask={openTaskDrawer}
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
  const yn = (val: string, onSelect: (v: string) => void) => (
    <OptionGroup
      value={val}
      onSelect={onSelect}
      options={[
        { val: "Yes", label: "Yes" },
        { val: "No", label: "No" },
      ]}
    />
  );
  const ynNotSure = (val: string, onSelect: (v: string) => void) => (
    <OptionGroup
      value={val}
      onSelect={onSelect}
      options={[
        { val: "Yes", label: "Yes" },
        { val: "No", label: "No" },
        { val: "Not sure", label: "Not sure" },
      ]}
    />
  );

  return (
    <main className={styles["profile-wrap"]}>
      <div className={styles["profile-top"]}>
        <div className={styles.eyebrow}>{onCancel ? "Profile & registrations" : "First-time setup"}</div>
        <h2>Set up the essentials.</h2>
        <p>
          Give Beacon the few facts it needs to build your compliance workspace. Money Lender / NDTMFI status, personal
          data, collateral and recovery-agent use decide which obligations, filings and controls apply to you.
        </p>
      </div>

      <section className={styles["profile-section"]}>
        <h3>Licence & lending basics</h3>
        <div className={styles.field}>
          <label>Licensed money lender?</label>
          <p className={styles["field-help"]}>You are licensed under the Money Lenders Act / Regulations.</p>
          {yn(profile.money_lender, (v) => patch({ money_lender: v }))}
        </div>
        <div className={styles.field}>
          <label>Non-deposit-taking microfinance institution (NDT/MFI)?</label>
          <p className={styles["field-help"]}>Licensed as a Tier 4 NDT MFI under the relevant UMRA regulations.</p>
          {yn(profile.ndt_mfi, (v) => patch({ ndt_mfi: v }))}
        </div>
        <div className={styles.field}>
          <label>Collects or processes borrowers&apos; personal data?</label>
          <p className={styles["field-help"]}>Includes ID, credit-reference or app/device data used to score or recover loans.</p>
          {yn(profile.personal_data, (v) => patch({ personal_data: v }))}
        </div>
        <div className={styles.field}>
          <label>Takes collateral against loans?</label>
          {yn(profile.collateral, (v) => patch({ collateral: v }))}
        </div>
        <div className={styles.field}>
          <label>Uses third-party recovery or collection agents?</label>
          {yn(profile.recovery_agents, (v) => patch({ recovery_agents: v }))}
        </div>
        <div className={styles.field}>
          <label>FITSPA subscriber/member?</label>
          <p className={styles["field-help"]}>Triggers the FITSPA-specific reporting and subscriber obligations.</p>
          {yn(profile.fitspa_subscriber, (v) => patch({ fitspa_subscriber: v }))}
        </div>
      </section>

      <details className={styles.optional} open={!!(profile.route || profile.issue_date || profile.pdpo_status)}>
        <summary>Operating profile (optional, recommended) — licence dates, PDPO registration and how you operate</summary>
        <div className={styles["field-grid"]} style={{ marginTop: 14 }}>
          <div className={styles.field}>
            <label>Licence route</label>
            <OptionGroup
              value={profile.route}
              onSelect={(v) => patch({ route: v })}
              options={[
                { val: "ml", label: "Money Lender" },
                { val: "ndt", label: "NDTMFI" },
              ]}
            />
          </div>
          <div className={styles.field}>
            <label>Date first licensed by MRD-MoFPED</label>
            <input type="date" value={profile.issue_date} onChange={(e) => patch({ issue_date: e.target.value })} />
            <small>Used for the first-year FCP effective date and renewal timing.</small>
          </div>
          <div className={styles.field}>
            <label>Financial year-end</label>
            <input type="date" value={profile.fye_date} onChange={(e) => patch({ fye_date: e.target.value })} />
            <small>Used for recurring fiscal-year workflows.</small>
          </div>
          <div className={styles.field}>
            <label>Are you currently registered with the PDPO?</label>
            <OptionGroup
              value={profile.pdpo_status}
              onSelect={(v) => patch({ pdpo_status: v })}
              options={[
                { val: "Yes", label: "Yes" },
                { val: "No", label: "No" },
                { val: "Not sure", label: "Not sure" },
              ]}
            />
          </div>
          {profile.pdpo_status === "Yes" && (
            <div className={styles.field}>
              <label>PDPO Certificate of Registration expiry</label>
              <input type="date" value={profile.pdpo_expiry} onChange={(e) => patch({ pdpo_expiry: e.target.value })} />
            </div>
          )}
        </div>
        <div className={styles.field} style={{ marginTop: 8 }}>
          <label>Do you take physical custody/possession of customer collateral?</label>
          {ynNotSure(profile.custody, (v) => patch({ custody: v }))}
        </div>
        <div className={styles.field}>
          <label>Do you store or process customer data outside Uganda, including through overseas cloud services?</label>
          {ynNotSure(profile.crossborder, (v) => patch({ crossborder: v }))}
        </div>
        <div className={styles.field}>
          <label>Do you provide personal advice or recommendations to customers?</label>
          {ynNotSure(profile.advice, (v) => patch({ advice: v }))}
        </div>
      </details>

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

function WorkRows({ rows, empty, onOpen }: { rows: TaskRow[]; empty: string; onOpen: (x: TaskRow) => void }) {
  if (rows.length === 0) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles["work-list"]}>
      {rows.slice(0, 8).map((x) => {
        const dueLabel = x.remaining === null ? "—" : x.statusTag === "overdue" ? `${Math.abs(x.remaining)}d overdue` : `in ${x.remaining}d`;
        return (
          <div key={x.t.id} className={styles["work-row"]}>
            <div>
              <div className={styles["work-title-line"]}>
                <button className={styles["work-title"]} onClick={() => onOpen(x)}>
                  {x.t.task}
                </button>
              </div>
              <div className={styles["work-sub"]}>
                {x.t.applies_to} · {dueLabel}
              </div>
            </div>
            <div className={styles["row-date"]}>
              <strong>Legal / regulator due</strong>
              <br />
              {fmtDateShort(x.due)}
            </div>
            <div className={styles["row-owner"]}>{x.t.owner_role || "Unassigned"}</div>
            <button className={styles["row-action"]} onClick={() => onOpen(x)}>
              Open
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DashboardPanel({
  applicableTasks,
  overdueTasks,
  soonTasks,
  controlsToReview,
  applicableEventsCount,
  activity,
  coverageWarningText,
  onOpenTask,
  onOpenControl,
}: {
  applicableTasks: TaskRow[];
  overdueTasks: TaskRow[];
  soonTasks: TaskRow[];
  controlsToReview: ComplianceControl[];
  applicableEventsCount: number;
  activity: { text: string; date: string }[];
  coverageWarningText: string;
  onOpenTask: (x: TaskRow) => void;
  onOpenControl: (c: ComplianceControl) => void;
}) {
  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Dashboard</h1>
          <p>What needs action now, what is due next and which controls still need review.</p>
        </div>
      </div>
      <div className={styles["metric-grid"]}>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Action needed</div>
          <div className={styles["metric-value"]}>{overdueTasks.length + soonTasks.length}</div>
          <div className={styles["metric-note"]}>Of {applicableTasks.length} scheduled filings applicable</div>
        </div>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Overdue</div>
          <div className={`${styles["metric-value"]} ${overdueTasks.length ? styles.danger : ""}`}>{overdueTasks.length}</div>
          <div className={styles["metric-note"]}>Legal / regulator due date passed</div>
        </div>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Due next 30 days</div>
          <div className={`${styles["metric-value"]} ${soonTasks.length ? styles.warn : ""}`}>{soonTasks.length}</div>
          <div className={styles["metric-note"]}>Known legal / regulator deadlines</div>
        </div>
        <div className={styles.metric}>
          <div className={styles["metric-label"]}>Controls to review</div>
          <div className={`${styles["metric-value"]} ${controlsToReview.length ? styles.warn : ""}`}>{controlsToReview.length}</div>
          <div className={styles["metric-note"]}>{applicableEventsCount} event-triggered clocks also apply</div>
        </div>
      </div>

      <div className={`${styles.note} ${styles.warn}`}>{coverageWarningText}</div>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Priority actions</h2>
          <p>Overdue first, then nearest due work.</p>
        </div>
        <WorkRows rows={overdueTasks} empty="No priority work right now." onOpen={onOpenTask} />
      </section>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Due within 30 days</h2>
        </div>
        <WorkRows rows={soonTasks} empty="No upcoming dated occurrences." onOpen={onOpenTask} />
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
          <div className={styles.empty}>Activity will appear here as you update tasks, controls and events this session.</div>
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
  overdueTasks,
  soonTasks,
  appliedProfile,
  routeLabel,
  onOpenTask,
  onEditProfile,
  onLogEvent,
}: {
  overdueTasks: TaskRow[];
  soonTasks: TaskRow[];
  appliedProfile: ProfileFields;
  routeLabel: string;
  onOpenTask: (x: TaskRow) => void;
  onEditProfile: () => void;
  onLogEvent: () => void;
}) {
  const next = overdueTasks[0] || soonTasks[0];
  const pdpoLine =
    appliedProfile.pdpo_status === "Yes"
      ? `PDPO expiry: ${appliedProfile.pdpo_expiry ? fmtDate(parseISODate(appliedProfile.pdpo_expiry)) : "add date"}`
      : appliedProfile.pdpo_status === "No"
      ? "PDPO: not registered"
      : "PDPO: status not confirmed";
  return (
    <>
      <section className={styles["rail-card"]}>
        <div className={styles["rail-label"]}>Next</div>
        <div className={styles["rail-next"]}>
          {next ? (
            <>
              <strong>{next.t.task}</strong>
              <br />
              {next.due ? `Legal / regulator due ${fmtDate(next.due)}` : "Action required"}
            </>
          ) : (
            "No open dated work."
          )}
        </div>
        {next && (
          <button className={styles["rail-btn"]} onClick={() => onOpenTask(next)}>
            Open workflow
          </button>
        )}
        <button className={`${styles["rail-btn"]} ${styles.primary}`} onClick={onLogEvent}>
          Log an event
        </button>
      </section>
      <section className={styles["rail-card"]}>
        <div className={styles["rail-label"]}>Profile & registrations</div>
        <div className={styles["rail-profile"]}>
          <strong>{routeLabel}</strong>
          <br />
          {pdpoLine}
        </div>
        <button className={styles["rail-btn"]} onClick={onEditProfile}>
          Edit profile & registrations
        </button>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function CalendarPanel({
  items,
  search,
  setSearch,
  filter,
  setFilter,
  getTaskState,
  onOpenTask,
}: {
  items: TaskRow[];
  search: string;
  setSearch: (s: string) => void;
  filter: "all" | "overdue" | "soon" | "open" | "closed";
  setFilter: (f: "all" | "overdue" | "soon" | "open" | "closed") => void;
  getTaskState: (taskId: string) => TaskStateFields;
  onOpenTask: (x: TaskRow) => void;
}) {
  let visible = items;
  if (filter === "overdue") visible = visible.filter((x) => x.statusTag === "overdue");
  else if (filter === "soon") visible = visible.filter((x) => x.statusTag === "soon");
  else if (filter === "open") visible = visible.filter((x) => !["Closed", "Not applicable"].includes(getTaskState(x.t.id).workflow));
  else if (filter === "closed") visible = visible.filter((x) => getTaskState(x.t.id).workflow === "Closed");

  if (search) {
    const term = search.toLowerCase();
    visible = visible.filter((x) => `${x.t.task} ${x.t.obligation_external_id} ${x.t.period || ""}`.toLowerCase().includes(term));
  }

  const byMonth: Record<string, TaskRow[]> = {};
  const order: string[] = [];
  visible.forEach((x) => {
    const key = x.due ? `${x.due.getFullYear()}-${String(x.due.getMonth() + 1).padStart(2, "0")}` : "undated";
    if (!byMonth[key]) {
      byMonth[key] = [];
      order.push(key);
    }
    byMonth[key].push(x);
  });

  return (
    <>
      <div className={styles["page-head"]}>
        <div>
          <h1>Calendar</h1>
          <p>Dated occurrences only. Legal and regulator due dates are primary; workflow status and evidence are secondary.</p>
        </div>
      </div>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles["search-box"]}
          placeholder="Search scheduled filings…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.filters}>
          {(
            [
              ["all", "All"],
              ["overdue", "Overdue"],
              ["soon", "Due 30 days"],
              ["open", "Open workflow"],
              ["closed", "Closed"],
            ] as [typeof filter, string][]
          ).map(([key, label]) => (
            <button key={key} className={`${styles.filter} ${filter === key ? styles.active : ""}`} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>No scheduled filings match this filter.</div>
      ) : (
        order.map((key) => (
          <div key={key}>
            <div className={styles["cal-month"]}>{key === "undated" ? "Undated" : monthLabel(key)}</div>
            <div className={styles["cal-list"]}>
              {byMonth[key].map((x) => {
                const wf = getTaskState(x.t.id).workflow;
                const badgeCls = wf === "Closed" ? "closed" : x.statusTag === "overdue" ? "overdue" : x.statusTag === "soon" ? "action" : "upcoming";
                return (
                  <div key={x.t.id} className={styles["cal-row"]}>
                    <div className={styles["cal-date"]}>
                      {fmtDateShort(x.due)}
                      <span>{x.due ? x.due.getFullYear() : "No date"}</span>
                    </div>
                    <div>
                      <div className={styles["work-title-line"]}>
                        <button className={styles["work-title"]} onClick={() => onOpenTask(x)}>
                          {x.t.task}
                        </button>
                      </div>
                      {x.t.internal_target && <div className={styles.internal}>Internal target: {fmtDate(parseISODate(x.t.internal_target))}</div>}
                    </div>
                    <span className={`${styles.badge} ${styles[badgeCls]}`}>{wf}</span>
                    <button className={styles["row-action"]} onClick={() => onOpenTask(x)}>
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function TaskDrawerBody({
  x,
  obligation,
  taskState,
  onUpdate,
  workflowStates,
}: {
  x: TaskRow;
  obligation?: Obligation;
  taskState: TaskStateFields;
  onUpdate: (patch: Partial<TaskStateFields>) => void;
  workflowStates: ComplianceWorkflowState[];
}) {
  const t = x.t;
  return (
    <>
      <div className={styles["meta-grid"]}>
        <div className={styles["meta-box"]}>
          <label>Applies to</label>
          <div>{t.applies_to}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Legal / regulator due</label>
          <div>{fmtDate(x.due)}</div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Owner / reviewer</label>
          <div>
            {t.owner_role || "—"} / {t.reviewer_role || "—"}
          </div>
        </div>
        <div className={styles["meta-box"]}>
          <label>Internal target</label>
          <div>{fmtDate(parseISODate(t.internal_target))}</div>
        </div>
      </div>
      {obligation?.description && (
        <div className={styles["drawer-section"]}>
          <h3>What this means</h3>
          <p>{obligation.description}</p>
        </div>
      )}
      {t.notes && (
        <div className={styles["drawer-section"]}>
          <h3>Notice</h3>
          <p>{t.notes}</p>
        </div>
      )}
      <div className={styles["drawer-section"]}>
        <h3>Source</h3>
        {t.source_link ? (
          <a className={styles["source-link"]} href={t.source_link} target="_blank" rel="noopener noreferrer">
            Open source ↗
          </a>
        ) : (
          <p>—</p>
        )}
      </div>
      <div className={styles["drawer-section"]}>
        <h3>Work</h3>
        <div className={styles.field}>
          <label>Workflow status</label>
          <select value={taskState.workflow} onChange={(e) => onUpdate({ workflow: e.target.value })}>
            {(workflowStates.length > 0 ? workflowStates.map((w) => w.state) : WORKFLOW_STATES).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className={styles["field-grid"]}>
          <div className={styles.field}>
            <label>Evidence / submission link</label>
            <input
              type="text"
              defaultValue={taskState.evidence_link ?? ""}
              placeholder="Link to filed document or folder"
              onBlur={(e) => onUpdate({ evidence_link: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label>Submitted date</label>
            <input type="date" defaultValue={taskState.submitted_date ?? ""} onChange={(e) => onUpdate({ submitted_date: e.target.value || null })} />
          </div>
        </div>
        <div className={styles.field}>
          <label>Receipt / acknowledgment</label>
          <input
            type="text"
            defaultValue={taskState.receipt ?? ""}
            placeholder="Reference or confirmation number"
            onBlur={(e) => onUpdate({ receipt: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label>Notes</label>
          <textarea defaultValue={taskState.notes ?? ""} placeholder="Notes…" onBlur={(e) => onUpdate({ notes: e.target.value })} />
        </div>
      </div>
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
        <p>{ev.response || "Tell Beacon when this happened, then set the deadline the legal clock below implies."}</p>
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
// Obligations (+ reference material)
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
  reminderRules,
  workflowStates,
  holidays,
}: {
  obligations: Obligation[];
  search: string;
  setSearch: (s: string) => void;
  domain: string;
  setDomain: (s: string) => void;
  obType: string;
  setObType: (s: string) => void;
  onOpen: (o: Obligation) => void;
  reminderRules: ComplianceReminderRule[];
  workflowStates: ComplianceWorkflowState[];
  holidays: ComplianceHoliday[];
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
          <p>The complete applicable regulatory library. Use it to understand the rule and open any linked calendar work.</p>
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

      <section className={styles.section} style={{ marginTop: 40 }}>
        <div className={styles["section-head"]}>
          <h2>How reminders and workflow states work</h2>
        </div>
        <table className={styles["ref-table"]}>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Legal clock</th>
              <th>Reminder pattern</th>
              <th>Escalation</th>
            </tr>
          </thead>
          <tbody>
            {reminderRules.map((r) => (
              <tr key={r.id}>
                <td>{r.rule}</td>
                <td>{r.legal_clock || "—"}</td>
                <td>{r.pattern || "—"}</td>
                <td>{r.escalation || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Workflow states</h2>
        </div>
        <table className={styles["ref-table"]}>
          <thead>
            <tr>
              <th>State</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {workflowStates.map((w) => (
              <tr key={w.state}>
                <td>{w.state}</td>
                <td>{w.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <div className={styles["section-head"]}>
          <h2>Public holidays used for working-day calculations</h2>
          <p>Add any gazetted movable holidays before relying on them.</p>
        </div>
        <div className={styles["holiday-list"]}>
          {holidays.map((h) => (
            <div key={h.id}>
              {fmtDate(parseISODate(h.holiday_date))} — {h.name}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ObligationDrawerBody({
  o,
  related,
  onJumpToCalendar,
}: {
  o: Obligation;
  related: ComplianceCalendarTask[];
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
      {related.length > 0 && (
        <div className={styles["drawer-actions"]}>
          <button className={styles.subtle} onClick={() => onJumpToCalendar(o.external_id || o.title)}>
            View {related.length} related calendar task{related.length > 1 ? "s" : ""} →
          </button>
        </div>
      )}
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
          <p>Fees, thresholds and other financial requirements published under the digital lending regulatory framework.</p>
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
