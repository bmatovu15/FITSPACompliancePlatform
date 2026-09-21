"use client";

import { useMemo, useState } from "react";
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
import styles from "./compliance-calendar.module.css";

// The catalog key this member last set a profile under drives which
// question set the wizard shows and which applies_to codes are recognised.
// Add a new branch here (and in appliesTo/obligationApplies/validateProfile/
// profileSummaryText below) when a third catalog is introduced.
const DIGITAL_LENDING_CATALOG_KEY = "digital_lending_compliance_assistant";
const DAY_MS = 86400000;

const COVERAGE_WARNINGS: Record<string, string> = {
  payments_compliance_assistant:
    "This is a payments compliance map, not a SACCO or digital-credit sheet. It excludes a complete AML/CFT, tax, company-law and data-protection calendar, since the payments source set does not contain the full current primary instruments and regulator instructions for those regimes.\n\nLicence-specific conditions, BoU letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them.",
  [DIGITAL_LENDING_CATALOG_KEY]:
    "This is a digital lending compliance map, not a payments or SACCO sheet. It excludes a complete AML/CFT, tax, company-law and consumer-protection calendar beyond the Tier 4 Microfinance Institutions and Money Lenders Act framework, since the digital-lending source set does not contain the full current primary instruments and regulator instructions for those regimes.\n\nLicence-specific conditions, UMRA letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them.",
};

function coverageWarning(catalogKey: string): string {
  return (
    COVERAGE_WARNINGS[catalogKey] ??
    "This calendar reflects only the regulatory source material seeded for this catalog. Licence-specific conditions, regulator letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them."
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

type ProfileFields = {
  // Payments Compliance Calendar (payments_compliance_assistant)
  primary_category: string;
  pso_class: string;
  pso_band: string;
  emi: string;
  emi_band: string;
  cards: string;
  agent: string;
  sfi: string;
  participant: string;
  // Digital Lending Compliance Calendar (digital_lending_compliance_assistant)
  money_lender: string;
  ndt_mfi: string;
  personal_data: string;
  collateral: string;
  recovery_agents: string;
  fitspa_subscriber: string;
};

function emptyProfile(): ProfileFields {
  return {
    primary_category: "",
    pso_class: "",
    pso_band: "",
    emi: "",
    emi_band: "",
    cards: "",
    agent: "",
    sfi: "",
    participant: "",
    money_lender: "",
    ndt_mfi: "",
    personal_data: "",
    collateral: "",
    recovery_agents: "",
    fitspa_subscriber: "",
  };
}

function profileFromRow(row: MemberComplianceProfile | null): ProfileFields {
  if (!row) return emptyProfile();
  return {
    primary_category: row.primary_category ?? "",
    pso_class: row.pso_class ?? "",
    pso_band: row.pso_band ?? "",
    emi: row.emi ?? "",
    emi_band: row.emi_band ?? "",
    cards: row.cards ?? "",
    agent: row.agent ?? "",
    sfi: row.sfi ?? "",
    participant: row.participant ?? "",
    money_lender: row.money_lender ?? "",
    ndt_mfi: row.ndt_mfi ?? "",
    personal_data: row.personal_data ?? "",
    collateral: row.collateral ?? "",
    recovery_agents: row.recovery_agents ?? "",
    fitspa_subscriber: row.fitspa_subscriber ?? "",
  };
}

function appliesTo(category: string, profile: ProfileFields, catalogKey: string): boolean {
  const cat = (category || "").toUpperCase();
  if (cat === "ALL") return true;
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    switch (cat) {
      case "MONEY":
        return profile.money_lender === "Yes";
      case "NDT":
        return profile.ndt_mfi === "Yes";
      case "DATA":
        return profile.personal_data === "Yes";
      case "COLLATERAL":
        return profile.collateral === "Yes";
      case "RECOVERY":
        return profile.recovery_agents === "Yes";
      case "FITSPA":
        return profile.fitspa_subscriber === "Yes";
      default:
        return false;
    }
  }
  switch (cat) {
    case "PSO":
      return profile.primary_category === "PSO";
    case "PSP":
      return profile.primary_category === "PSP";
    case "EMI":
      return profile.emi === "Yes";
    case "AGENTS":
      return profile.agent === "Yes";
    case "STORED CARDS":
      return profile.cards === "Yes";
    case "PARTICIPANT":
      return profile.participant === "Yes";
    case "SFI":
      return profile.sfi === "Yes";
    default:
      return false;
  }
}

function obligationApplies(o: Obligation, profile: ProfileFields, catalogKey: string): boolean {
  if (o.applies_all) return true;
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    if (o.applies_money_lender && profile.money_lender === "Yes") return true;
    if (o.applies_ndt_mfi && profile.ndt_mfi === "Yes") return true;
    if (o.applies_personal_data && profile.personal_data === "Yes") return true;
    if (o.applies_collateral && profile.collateral === "Yes") return true;
    if (o.applies_recovery_agents && profile.recovery_agents === "Yes") return true;
    if (o.applies_fitspa_subscriber && profile.fitspa_subscriber === "Yes") return true;
    return false;
  }
  if (o.applies_pso && profile.primary_category === "PSO") return true;
  if (o.applies_psp && profile.primary_category === "PSP") return true;
  if (o.applies_emi && profile.emi === "Yes") return true;
  if (o.applies_instrument && profile.primary_category === "Instrument") return true;
  if (o.applies_agent && profile.agent === "Yes") return true;
  if (o.applies_cards && profile.cards === "Yes") return true;
  if (o.applies_sfi && profile.sfi === "Yes") return true;
  if (o.applies_participant && profile.participant === "Yes") return true;
  return false;
}

const PSO_CLASS_LABEL: Record<string, string> = {
  funds_transfer: "Funds transfer",
  clearing: "Clearing/switch",
  settlement: "Settlement",
  third_party: "Third-party system",
};

function profileSummaryText(p: ProfileFields, catalogKey: string): string {
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    const dlParts: string[] = [];
    if (p.money_lender === "Yes") dlParts.push("Money lender");
    if (p.ndt_mfi === "Yes") dlParts.push("NDT/MFI");
    if (p.personal_data === "Yes") dlParts.push("Handles personal data");
    if (p.collateral === "Yes") dlParts.push("Takes collateral");
    if (p.recovery_agents === "Yes") dlParts.push("Uses recovery agents");
    if (p.fitspa_subscriber === "Yes") dlParts.push("FITSPA subscriber");
    return dlParts.join("  ·  ") || "No profile set";
  }
  const parts: string[] = [];
  if (p.primary_category === "PSO") parts.push("PSO" + (p.pso_class ? " · " + (PSO_CLASS_LABEL[p.pso_class] || p.pso_class) : ""));
  else if (p.primary_category === "PSP") parts.push("PSP" + (p.emi === "Yes" ? " · EMI" : ""));
  else if (p.primary_category === "Instrument") parts.push("Instrument issuer");
  if (p.cards === "Yes") parts.push("Cards");
  if (p.agent === "Yes") parts.push("Agents");
  if (p.sfi === "Yes") parts.push("FI/MDI overlay");
  if (p.participant === "Yes") parts.push("Participant");
  return parts.join("  ·  ") || "No profile set";
}

function validateProfile(p: ProfileFields, catalogKey: string): boolean {
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    return (
      !!p.money_lender &&
      !!p.ndt_mfi &&
      !!p.personal_data &&
      !!p.collateral &&
      !!p.recovery_agents &&
      !!p.fitspa_subscriber
    );
  }
  let ok = !!p.primary_category && !!p.emi && !!p.cards && !!p.agent && !!p.sfi && !!p.participant;
  if (p.primary_category === "PSO" && !p.pso_class) ok = false;
  if (p.pso_class === "funds_transfer" && !p.pso_band) ok = false;
  if (p.emi === "Yes" && !p.emi_band) ok = false;
  return ok;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}
function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateShort(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function localDateTimeInputValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Per-member state helpers
// ---------------------------------------------------------------------------

type TaskStateFields = Pick<MemberCalendarTaskState, "workflow" | "evidence_link" | "submitted_date" | "receipt" | "notes">;
function defaultTaskState(): TaskStateFields {
  return { workflow: "Scheduled", evidence_link: "", submitted_date: null, receipt: "", notes: "" };
}

type ControlStateFields = Pick<MemberControlState, "status" | "last_reviewed">;
function defaultControlState(): ControlStateFields {
  return { status: "Effective", last_reviewed: null };
}

function intervalDaysForCadence(cadence: string | null): number | null {
  const c = (cadence || "").toLowerCase();
  if (c.indexOf("daily") !== -1) return 1;
  if (c.indexOf("weekly") !== -1) return 7;
  if (c.indexOf("monthly") !== -1) return 30;
  return null;
}

function indexById<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, T> {
  const out: Record<string, T> = {};
  rows.forEach((r) => {
    out[String(r[key])] = r;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

type Tab = "dashboard" | "calendar" | "events" | "controls" | "fees" | "reference";

export default function ComplianceCalendarClient({
  memberId,
  catalogKey,
  catalogTitle,
  catalogSeal,
  selectedYear,
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
  catalogTitle: string;
  catalogSeal: string | null;
  selectedYear: number | null;
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

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [calSearch, setCalSearch] = useState("");
  const [calFilter, setCalFilter] = useState<"all" | "overdue" | "soon" | "open" | "closed">("all");
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [refSearch, setRefSearch] = useState("");
  const [expandedObligations, setExpandedObligations] = useState<Record<string, boolean>>({});

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

  async function logEvent(eventId: string, chosenDate: Date, deadline: Date) {
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
  }

  async function resolveLoggedEvent(logId: string) {
    setLoggedEvents((prev) => prev.map((l) => (l.id === logId ? { ...l, status: "closed" } : l)));
    const { error } = await supabase.from("member_logged_events").update({ status: "closed" }).eq("id", logId);
    if (error) console.error("Failed to resolve event", error);
  }

  async function saveProfile() {
    setSavingProfile(true);
    const { error } = await supabase.from("member_compliance_profile").upsert(
      {
        member_id: memberId,
        catalog_key: catalogKey,
        ...draftProfile,
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

  const closedTaskCount = useMemo(
    () => applicableTasks.filter((x) => getTaskState(x.t.id).workflow === "Closed").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableTasks, taskStates]
  );
  const complianceScorePct = applicableTasks.length > 0 ? Math.round((closedTaskCount / applicableTasks.length) * 100) : 0;

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

  function jumpToCalendar(search: string) {
    setActiveTab("calendar");
    setCalSearch(search);
  }

  if (screen === "wizard") {
    return (
      <div className={styles.ccRoot}>
        <WizardScreen
          catalogKey={catalogKey}
          catalogTitle={catalogTitle}
          catalogSeal={catalogSeal}
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
    <div className={styles.ccRoot}>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>{catalogSeal || "—"}</div>
          <div>
            <span className={styles.brandTitle}>{catalogTitle}</span>
            <span className={styles.brandSubtitle}>{profileSummaryText(appliedProfile, catalogKey)}</span>
          </div>
        </div>
        <div className={styles["masthead-right"]}>
          <span className={`${styles["route-pill"]} ${overdueTasks.length ? styles["pill-danger"] : ""}`}>
            {overdueTasks.length} overdue
          </span>
          <button
            className={styles["link-btn"]}
            onClick={() => {
              setDraftProfile(appliedProfile);
              setScreen("wizard");
            }}
          >
            Edit profile
          </button>
        </div>
      </header>

      <div className={styles["score-banner"]}>
        <span className={styles["score-banner-title"]}>{catalogTitle} compliance score</span>
        <span className={styles["score-banner-value"]}>{complianceScorePct}% complete</span>
        <span className={styles["score-banner-note"]}>
          {closedTaskCount} of {applicableTasks.length} task{applicableTasks.length === 1 ? "" : "s"} closed for{" "}
          {selectedYear ?? "all years"}
        </span>
      </div>

      <div className={styles["app-tabs"]}>
        {(
          [
            ["dashboard", "Dashboard"],
            ["calendar", "Calendar"],
            ["events", "Event triggers"],
            ["controls", "Continuous controls"],
            ["fees", "Fees & capital"],
            ["reference", "Reference"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`${styles["app-tab"]} ${activeTab === key ? styles.active : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <DashboardTab
          applicableTasks={applicableTasks}
          overdueTasks={overdueTasks}
          soonTasks={soonTasks}
          applicableControlsCount={applicableControls.length}
          applicableEventsCount={applicableEvents.length}
          onJump={jumpToCalendar}
          coverageWarning={coverageWarning(catalogKey)}
        />
      )}
      {activeTab === "calendar" && (
        <CalendarTab
          items={applicableTasks}
          search={calSearch}
          setSearch={setCalSearch}
          filter={calFilter}
          setFilter={setCalFilter}
          getTaskState={getTaskState}
          updateTaskState={updateTaskState}
          workflowStates={workflowStates}
          expanded={expandedTasks}
          setExpanded={setExpandedTasks}
          obligations={obligations}
        />
      )}
      {activeTab === "events" && (
        <EventsTab
          events={applicableEvents}
          loggedEvents={loggedEvents}
          eventsById={eventsById}
          onLog={logEvent}
          onResolve={resolveLoggedEvent}
        />
      )}
      {activeTab === "controls" && (
        <ControlsTab controls={applicableControls} getControlState={getControlState} updateControlState={updateControlState} />
      )}
      {activeTab === "fees" && <FeesTab fees={catalogFees} />}
      {activeTab === "reference" && (
        <ReferenceTab
          obligations={applicableObligations}
          calendarTasks={calendarTasks}
          reminderRules={reminderRules}
          workflowStates={workflowStates}
          holidays={holidays}
          search={refSearch}
          setSearch={setRefSearch}
          expanded={expandedObligations}
          setExpanded={setExpandedObligations}
          onJumpToCalendar={jumpToCalendar}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard
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
    <div className={styles["q-options"]}>
      {options.map((o) => (
        <button
          key={o.val}
          type="button"
          className={`${styles["q-opt"]} ${value === o.val ? styles.selected : ""}`}
          onClick={() => onSelect(o.val)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function WizardScreen({
  catalogKey,
  catalogTitle,
  catalogSeal,
  profile,
  setProfile,
  canBuild,
  saving,
  onSave,
  onCancel,
}: {
  catalogKey: string;
  catalogTitle: string;
  catalogSeal: string | null;
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
  return (
    <div>
      <header className={styles.masthead}>
        <div className={styles["masthead-brand"]}>
          <div className={styles.seal}>{catalogSeal || "—"}</div>
          <div>
            <span className={styles.brandTitle}>{catalogTitle}</span>
            <span className={styles.brandSubtitle}>Set your licence profile</span>
          </div>
        </div>
        {onCancel && (
          <div className={styles["masthead-right"]}>
            <button className={styles["link-btn"]} onClick={onCancel}>
              ← Back
            </button>
          </div>
        )}
      </header>

      <div className={styles["wizard-wrap"]}>
        <div className={styles["wizard-step-note"]}>Dashboard profile</div>
        <h2 className={styles["wizard-title"]}>Tell the assistant what you are.</h2>
        <p className={styles["wizard-note"]}>
          These are the inputs used to decide which obligations, filings and controls apply to you. Answer once — you
          can edit it any time from inside the calendar.
        </p>

        {catalogKey === DIGITAL_LENDING_CATALOG_KEY ? (
          <>
            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Licensed money lender?</p>
              <p className={styles["q-help"]}>You are licensed under the Money Lenders Act / Regulations.</p>
              <OptionGroup
                value={profile.money_lender}
                onSelect={(val) => patch({ money_lender: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Non-deposit-taking microfinance institution (NDT/MFI)?</p>
              <p className={styles["q-help"]}>Licensed as a Tier 4 NDT MFI under the relevant UMRA regulations.</p>
              <OptionGroup
                value={profile.ndt_mfi}
                onSelect={(val) => patch({ ndt_mfi: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Collects or processes borrowers&apos; personal data?</p>
              <p className={styles["q-help"]}>Includes ID, credit-reference or app/device data used to score or recover loans.</p>
              <OptionGroup
                value={profile.personal_data}
                onSelect={(val) => patch({ personal_data: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Takes collateral against loans?</p>
              <OptionGroup
                value={profile.collateral}
                onSelect={(val) => patch({ collateral: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Uses third-party recovery or collection agents?</p>
              <OptionGroup
                value={profile.recovery_agents}
                onSelect={(val) => patch({ recovery_agents: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>FITSPA subscriber/member?</p>
              <p className={styles["q-help"]}>Triggers the FITSPA-specific reporting and subscriber obligations.</p>
              <OptionGroup
                value={profile.fitspa_subscriber}
                onSelect={(val) => patch({ fitspa_subscriber: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>
          </>
        ) : (
          <>
            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Primary licence category</p>
              <p className={styles["q-help"]}>The category your licence is issued under.</p>
              <OptionGroup
                value={profile.primary_category}
                onSelect={(val) =>
                  patch({
                    primary_category: val,
                    ...(val !== "PSO" ? { pso_class: "", pso_band: "" } : {}),
                  })
                }
                options={[
                  { val: "PSO", label: "Payment system operator" },
                  { val: "PSP", label: "Payment service provider" },
                  { val: "Instrument", label: "Payment-instrument issuer" },
                ]}
              />
              {profile.primary_category === "PSO" && (
                <div className={`${styles["q-sub"]} ${styles.visible}`}>
                  <select value={profile.pso_class} onChange={(e) => patch({ pso_class: e.target.value, pso_band: "" })}>
                    <option value="">PSO class…</option>
                    <option value="funds_transfer">Funds transfer system</option>
                    <option value="clearing">Clearing system or switch</option>
                    <option value="settlement">Settlement system</option>
                    <option value="third_party">Third-party system</option>
                  </select>
                  {profile.pso_class === "funds_transfer" && (
                    <select
                      style={{ marginLeft: 10 }}
                      value={profile.pso_band}
                      onChange={(e) => patch({ pso_band: e.target.value })}
                    >
                      <option value="">Volume band…</option>
                      <option value="large">Large — &gt; UGX 100bn/month</option>
                      <option value="medium">Medium — &gt; UGX 1bn to 100bn/month</option>
                      <option value="small">Small — ≤ UGX 1bn/month</option>
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Electronic-money issuer?</p>
              <p className={styles["q-help"]}>A PSP subtype with extra trust-account, liquidity and reporting duties.</p>
              <OptionGroup
                value={profile.emi}
                onSelect={(val) => patch({ emi: val, ...(val !== "Yes" ? { emi_band: "" } : {}) })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
              {profile.emi === "Yes" && (
                <div className={`${styles["q-sub"]} ${styles.visible}`}>
                  <select value={profile.emi_band} onChange={(e) => patch({ emi_band: e.target.value })}>
                    <option value="">Trust-account value band…</option>
                    <option value="large">Large — &gt; UGX 100bn</option>
                    <option value="medium1">Medium 1 — &gt; UGX 50bn to 100bn</option>
                    <option value="medium2">Medium 2 — &gt; UGX 5bn to 50bn</option>
                    <option value="medium3">Medium 3 — &gt; UGX 500m to 5bn</option>
                    <option value="small1">Small 1 — &gt; UGX 250m to 500m</option>
                    <option value="small2">Small 2 — ≤ UGX 250m</option>
                  </select>
                </div>
              )}
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Issues stored-value or prepaid cards?</p>
              <OptionGroup
                value={profile.cards}
                onSelect={(val) => patch({ cards: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Uses agents?</p>
              <OptionGroup
                value={profile.agent}
                onSelect={(val) => patch({ agent: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Also a financial institution or MDI?</p>
              <p className={styles["q-help"]}>Triggers the SFI cyber and technology overlay on top of the NPS framework.</p>
              <OptionGroup
                value={profile.sfi}
                onSelect={(val) => patch({ sfi: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>

            <div className={styles["q-block"]}>
              <p className={styles["q-label"]}>Payment-system participant?</p>
              <p className={styles["q-help"]}>You settle through, or participate in, another operator&apos;s payment system.</p>
              <OptionGroup
                value={profile.participant}
                onSelect={(val) => patch({ participant: val })}
                options={[
                  { val: "Yes", label: "Yes" },
                  { val: "No", label: "No" },
                ]}
              />
            </div>
          </>
        )}

        <div className={styles["wizard-actions"]}>
          <button className={styles["btn-primary"]} disabled={!canBuild || saving} onClick={onSave}>
            {saving ? "Saving…" : "Build my calendar →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

type TaskRow = { t: ComplianceCalendarTask; due: Date | null; remaining: number | null; statusTag: "overdue" | "soon" | "scheduled" };

function StatCard({ label, value, cls, note }: { label: string; value: number | string; cls: string; note: string }) {
  return (
    <div className={`${styles["stat-card"]} ${styles[cls]}`}>
      <div className={styles["st-label"]}>{label}</div>
      <div className={styles["st-value"]}>{value}</div>
      <div className={styles["st-note"]}>{note}</div>
    </div>
  );
}

function MiniList({ items, isOverdue, onJump }: { items: TaskRow[]; isOverdue: boolean; onJump: (search: string) => void }) {
  if (items.length === 0) {
    return <div className={styles["empty-state"]}>Nothing here for your profile.</div>;
  }
  return (
    <div className={styles["mini-list"]}>
      {items.slice(0, 8).map((x) => {
        const dueLabel = x.remaining === null ? "—" : isOverdue ? `${Math.abs(x.remaining)}d overdue` : `in ${x.remaining}d`;
        return (
          <div
            key={x.t.id}
            className={`${styles["mini-row"]} ${isOverdue ? styles.overdue : styles.soon}`}
            onClick={() => onJump(x.t.task)}
            style={{ cursor: "pointer" }}
          >
            <span className={styles["mr-due"]}>{dueLabel}</span>
            <span className={styles["mr-task"]}>
              {x.t.task} <span style={{ color: "var(--slate-light)", fontSize: 12 }}>— due {fmtDateShort(x.due)}</span>
            </span>
            <span className={styles["mr-jump"]}>Open →</span>
          </div>
        );
      })}
    </div>
  );
}

function DashboardTab({
  applicableTasks,
  overdueTasks,
  soonTasks,
  applicableControlsCount,
  applicableEventsCount,
  onJump,
  coverageWarning,
}: {
  applicableTasks: TaskRow[];
  overdueTasks: TaskRow[];
  soonTasks: TaskRow[];
  applicableControlsCount: number;
  applicableEventsCount: number;
  onJump: (search: string) => void;
  coverageWarning: string;
}) {
  return (
    <div className={styles["tab-wrap"]}>
      <div className={styles["stat-grid"]}>
        <StatCard label="Scheduled filings applicable" value={applicableTasks.length} cls="stat-ok" note="Across your annual calendar" />
        <StatCard
          label="Overdue"
          value={overdueTasks.length}
          cls={overdueTasks.length ? "stat-danger" : "stat-ok"}
          note="Past legal due date, not closed"
        />
        <StatCard
          label="Due within 30 days"
          value={soonTasks.length}
          cls={soonTasks.length ? "stat-warn" : "stat-ok"}
          note="Act before these slip to overdue"
        />
        <StatCard
          label="Continuous controls tracked"
          value={applicableControlsCount}
          cls="stat-ok"
          note={`${applicableEventsCount} event-triggered clocks also apply`}
        />
      </div>
      <div className={styles["warn-box"]}>{coverageWarning}</div>
      <h3 className={styles["dash-section-title"]}>Overdue right now</h3>
      <p className={styles["dash-section-note"]}>Ranked by how long past the legal due date.</p>
      <MiniList items={overdueTasks} isOverdue onJump={onJump} />
      <h3 className={styles["dash-section-title"]}>Due within 30 days</h3>
      <MiniList items={soonTasks} isOverdue={false} onJump={onJump} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function CalendarTab({
  items,
  search,
  setSearch,
  filter,
  setFilter,
  getTaskState,
  updateTaskState,
  workflowStates,
  expanded,
  setExpanded,
  obligations,
}: {
  items: TaskRow[];
  search: string;
  setSearch: (s: string) => void;
  filter: "all" | "overdue" | "soon" | "open" | "closed";
  setFilter: (f: "all" | "overdue" | "soon" | "open" | "closed") => void;
  getTaskState: (taskId: string) => TaskStateFields;
  updateTaskState: (taskId: string, patch: Partial<TaskStateFields>) => void;
  workflowStates: ComplianceWorkflowState[];
  expanded: Record<string, boolean>;
  setExpanded: (fn: (e: Record<string, boolean>) => Record<string, boolean>) => void;
  obligations: Obligation[];
}) {
  let visible = items;
  if (filter === "overdue") visible = visible.filter((x) => x.statusTag === "overdue");
  else if (filter === "soon") visible = visible.filter((x) => x.statusTag === "soon");
  else if (filter === "open") visible = visible.filter((x) => !["Closed", "Not applicable"].includes(getTaskState(x.t.id).workflow));
  else if (filter === "closed") visible = visible.filter((x) => getTaskState(x.t.id).workflow === "Closed");

  if (search) {
    const term = search.toLowerCase();
    visible = visible.filter((x) =>
      `${x.t.task} ${x.t.obligation_external_id} ${x.t.period || ""}`.toLowerCase().includes(term)
    );
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

  const obligationsById = useMemo(() => indexById(obligations, "external_id"), [obligations]);

  return (
    <div className={`${styles["tab-wrap"]} ${styles["tab-wrap-wide"]}`}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles["search-box"]}
          placeholder="Search scheduled filings…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles["filter-group"]}>
          {(
            [
              ["all", "All"],
              ["overdue", "Overdue"],
              ["soon", "Due 30 days"],
              ["open", "Open workflow"],
              ["closed", "Closed"],
            ] as [typeof filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={`${styles["filter-chip"]} ${filter === key ? styles.active : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className={styles["empty-state"]}>No scheduled filings match this filter.</div>
      ) : (
        order.map((key) => (
          <div key={key}>
            <div className={styles["month-heading"]}>{key === "undated" ? "Undated" : monthLabel(key)}</div>
            {byMonth[key].map((x) => (
              <TaskCard
                key={x.t.id}
                x={x}
                taskState={getTaskState(x.t.id)}
                onUpdate={(patch) => updateTaskState(x.t.id, patch)}
                workflowStates={workflowStates}
                isExpanded={!!expanded[x.t.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [x.t.id]: !e[x.t.id] }))}
                obligation={obligationsById[x.t.obligation_external_id]}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function TaskCard({
  x,
  taskState,
  onUpdate,
  workflowStates,
  isExpanded,
  onToggle,
  obligation,
}: {
  x: TaskRow;
  taskState: TaskStateFields;
  onUpdate: (patch: Partial<TaskStateFields>) => void;
  workflowStates: ComplianceWorkflowState[];
  isExpanded: boolean;
  onToggle: () => void;
  obligation?: Obligation;
}) {
  const t = x.t;
  let daysBadge: { cls: string; text: string } | null = null;
  if (x.remaining !== null) {
    if (x.remaining < 0) daysBadge = { cls: "badge-days-over", text: `${Math.abs(x.remaining)}d overdue` };
    else if (x.remaining <= 30) daysBadge = { cls: "badge-days-soon", text: `due in ${x.remaining}d` };
    else daysBadge = { cls: "badge-days-ok", text: `due in ${x.remaining}d` };
  }

  return (
    <div
      className={`${styles["task-card"]} ${styles["status-" + x.statusTag]} ${taskState.workflow === "Closed" ? styles["wf-closed"] : ""} ${isExpanded ? styles.expanded : ""}`}
    >
      <div className={styles["task-head"]} onClick={onToggle}>
        <div className={`${styles["task-due"]} ${x.statusTag === "overdue" ? styles["tag-overdue"] : x.statusTag === "soon" ? styles["tag-soon"] : ""}`}>
          {fmtDateShort(x.due)}
          <br />
          {x.due ? x.due.getFullYear() : ""}
        </div>
        <div className={styles["task-title-wrap"]}>
          <p className={styles["task-title"]}>{t.task}</p>
          <div className={styles["task-badges"]}>
            <span className={`${styles.badge} ${styles["badge-applies"]}`}>{t.applies_to}</span>
            <span className={`${styles.badge} ${styles["badge-wf"]}`}>{taskState.workflow}</span>
            {daysBadge && <span className={`${styles.badge} ${styles[daysBadge.cls]}`}>{daysBadge.text}</span>}
          </div>
        </div>
        <div className={styles.chevron}>▸</div>
      </div>

      {isExpanded && (
        <div className={styles["task-body"]} onClick={(e) => e.stopPropagation()}>
          {obligation?.description && <p>{obligation.description}</p>}
          <div className={styles["meta-grid"]}>
            <div>
              <span className={styles["mg-label"]}>Reporting period</span>
              <span className={styles["mg-value"]}>{t.period || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Internal target</span>
              <span className={styles["mg-value"]}>{fmtDate(parseISODate(t.internal_target))}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Owner / reviewer</span>
              <span className={styles["mg-value"]}>{t.owner_role || "—"} / {t.reviewer_role || "—"}</span>
            </div>
          </div>
          {t.notes && <div className={styles["task-notice"]}>{t.notes}</div>}
          <div className={styles["task-source"]}>
            Source:{" "}
            {t.source_link ? (
              <a href={t.source_link} target="_blank" rel="noopener noreferrer">
                view source ↗
              </a>
            ) : (
              "—"
            )}
          </div>

          <div className={styles["wf-row"]}>
            <label style={{ fontSize: 12, color: "var(--slate-light)" }}>Workflow status</label>
            <select value={taskState.workflow} onChange={(e) => onUpdate({ workflow: e.target.value })}>
              {workflowStates.length > 0
                ? workflowStates.map((w) => (
                    <option key={w.state} value={w.state}>
                      {w.state}
                    </option>
                  ))
                : WORKFLOW_STATES.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
            </select>
          </div>

          <div className={styles["evidence-grid"]}>
            <div>
              <label>Evidence / submission link</label>
              <input
                type="text"
                defaultValue={taskState.evidence_link ?? ""}
                placeholder="Link to filed document or folder"
                onBlur={(e) => onUpdate({ evidence_link: e.target.value })}
              />
            </div>
            <div>
              <label>Submitted date</label>
              <input
                type="date"
                defaultValue={taskState.submitted_date ?? ""}
                onChange={(e) => onUpdate({ submitted_date: e.target.value || null })}
              />
            </div>
            <div>
              <label>Receipt / acknowledgment</label>
              <input
                type="text"
                defaultValue={taskState.receipt ?? ""}
                placeholder="Reference or confirmation number"
                onBlur={(e) => onUpdate({ receipt: e.target.value })}
              />
            </div>
          </div>
          <textarea
            className={styles["notes-field"]}
            placeholder="Notes…"
            defaultValue={taskState.notes ?? ""}
            onBlur={(e) => onUpdate({ notes: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function EventsTab({
  events,
  loggedEvents,
  eventsById,
  onLog,
  onResolve,
}: {
  events: ComplianceEvent[];
  loggedEvents: MemberLoggedEvent[];
  eventsById: Record<string, ComplianceEvent>;
  onLog: (eventId: string, chosenDate: Date, deadline: Date) => void;
  onResolve: (logId: string) => void;
}) {
  const open = loggedEvents
    .filter((l) => l.status !== "closed")
    .slice()
    .sort((a, b) => new Date(a.deadline ?? a.chosen_date).getTime() - new Date(b.deadline ?? b.chosen_date).getTime());

  return (
    <div className={styles["tab-wrap"]}>
      <div className={styles["triggered-summary"]}>
        <h3>Active triggered actions</h3>
        {open.length === 0 ? (
          <div className={styles["empty-state"]} style={{ padding: "10px 0" }}>
            No open triggered actions. Log an event below when something happens.
          </div>
        ) : (
          open.map((l) => {
            const ev = eventsById[l.event_id];
            const deadline = l.deadline ? new Date(l.deadline) : null;
            const remaining = deadline ? daysBetween(deadline, new Date()) : null;
            const overdueTxt = remaining !== null && remaining < 0 ? " — OVERDUE" : "";
            return (
              <div key={l.id} className={styles["logged-row"]}>
                <span>
                  {ev ? ev.trigger_name : l.event_id} —{" "}
                  <span className={styles["lp-deadline"]}>
                    {deadline ? fmtDateTime(deadline) : "—"}
                    {overdueTxt}
                  </span>
                </span>
                <button className={styles["btn-tiny"]} onClick={() => onResolve(l.id)}>
                  Mark resolved
                </button>
              </div>
            );
          })
        )}
      </div>
      <p className={styles["dash-section-note"]}>
        Log the moment an event happens. Read the legal clock below, then set the deadline it implies.
      </p>
      {events.length === 0 ? (
        <div className={styles["empty-state"]}>No event-triggered clocks apply to this profile.</div>
      ) : (
        events.map((ev) => <EventCard key={ev.id} ev={ev} onLog={onLog} />)
      )}
    </div>
  );
}

function EventCard({ ev, onLog }: { ev: ComplianceEvent; onLog: (eventId: string, chosenDate: Date, deadline: Date) => void }) {
  const [chosen, setChosen] = useState(() => localDateTimeInputValue(new Date()));
  const [deadline, setDeadline] = useState(() => localDateTimeInputValue(new Date()));

  return (
    <div className={styles["event-card"]}>
      <h4>{ev.trigger_name}</h4>
      <div className={styles["event-meta"]}>
        <b>Legal clock:</b> {ev.legal_clock || "—"} &nbsp;·&nbsp; <b>Applies to:</b> {ev.applies_to}
      </div>
      {ev.response && <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 10px", maxWidth: "56em" }}>{ev.response}</p>}
      <div className={styles["event-meta"]}>
        <b>Owner:</b> {ev.owner_role || "—"} &nbsp;·&nbsp; <b>Escalation:</b> {ev.escalation || "—"}
      </div>
      <div className={styles["event-meta"]}>
        <b>Evidence to retain:</b> {ev.evidence || "—"}
      </div>
      {ev.source_link && (
        <div className={styles["event-meta"]}>
          <a href={ev.source_link} target="_blank" rel="noopener noreferrer">
            view source ↗
          </a>
        </div>
      )}
      <div className={styles["event-actions"]}>
        <div className={styles["event-field"]}>
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
        <div className={styles["event-field"]}>
          <label>Deadline (per legal clock above)</label>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <button
          className={styles["btn-small"]}
          onClick={() => {
            const chosenDate = new Date(chosen);
            const deadlineDate = new Date(deadline);
            if (isNaN(chosenDate.getTime()) || isNaN(deadlineDate.getTime())) return;
            onLog(ev.id, chosenDate, deadlineDate);
          }}
        >
          Log this event
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function ControlsTab({
  controls,
  getControlState,
  updateControlState,
}: {
  controls: ComplianceControl[];
  getControlState: (controlId: string) => ControlStateFields;
  updateControlState: (controlId: string, patch: Partial<ControlStateFields>) => void;
}) {
  if (controls.length === 0) {
    return (
      <div className={styles["tab-wrap"]}>
        <div className={styles["empty-state"]}>No continuous controls apply to this profile.</div>
      </div>
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
    <div className={styles["tab-wrap"]}>
      <p className={styles["dash-section-note"]}>
        These have no filing date — they must simply keep working. Set a cadence check so they don&apos;t go silently
        stale.
      </p>
      {order.map((domain) => (
        <div key={domain}>
          <div className={styles["month-heading"]}>{domain}</div>
          {byDomain[domain].map((c) => (
            <ControlCard key={c.id} c={c} state={getControlState(c.id)} onUpdate={(patch) => updateControlState(c.id, patch)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ControlCard({
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

  const borderColor = state.status === "Exception" ? "var(--danger)" : state.status === "Needs attention" ? "var(--warn)" : undefined;

  return (
    <div className={styles["control-card"]} style={borderColor ? { borderLeft: `4px solid ${borderColor}` } : undefined}>
      <div className={styles["control-head"]}>
        <h4>{c.objective}</h4>
        <span className={styles["control-cadence"]}>{c.cadence || "—"}</span>
      </div>
      <div className={styles["control-body"]}>
        {c.operation && <p>{c.operation}</p>}
        <p style={{ color: "var(--slate-light)", fontSize: 12 }}>
          <b>Evidence/test:</b> {c.evidence || "—"}
        </p>
      </div>
      <div className={styles["control-foot"]}>
        <select value={state.status} onChange={(e) => onUpdate({ status: e.target.value })}>
          <option value="Effective">Effective</option>
          <option value="Needs attention">Needs attention</option>
          <option value="Exception">Exception</option>
        </select>
        <label style={{ fontSize: 12, color: "var(--slate-light)" }}>
          Last checked{" "}
          <input
            type="date"
            defaultValue={state.last_reviewed ?? ""}
            onChange={(e) => onUpdate({ last_reviewed: e.target.value || null })}
          />
        </label>
        <span className={styles["control-next"]}>{nextCheckText}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

function FeesTab({ fees }: { fees: ComplianceCatalogFee[] }) {
  if (fees.length === 0) {
    return (
      <div className={styles["tab-wrap"]}>
        <div className={styles["empty-state"]}>No fee schedule published for this catalog yet.</div>
      </div>
    );
  }
  return (
    <div className={styles["tab-wrap"]}>
      <p className={styles["dash-section-note"]}>
        Fees, thresholds and other financial requirements published under this catalog&apos;s regulatory framework.
      </p>
      <table className={styles["fee-table"]}>
        <thead>
          <tr>
            <th>Route / layer</th>
            <th>Fee / requirement</th>
            <th>Amount</th>
            <th>When due</th>
            <th>Treatment</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((f) => (
            <tr key={f.id}>
              <td>{f.route_or_layer || "—"}</td>
              <td>{f.fee_or_requirement}</td>
              <td>{f.amount || "—"}</td>
              <td>{f.when_due || "—"}</td>
              <td>{f.treatment || "—"}</td>
              <td>
                {f.source ? (
                  /^https?:\/\//.test(f.source) ? (
                    <a href={f.source} target="_blank" rel="noopener noreferrer">
                      view source ↗
                    </a>
                  ) : (
                    f.source
                  )
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

function ReferenceTab({
  obligations,
  calendarTasks,
  reminderRules,
  workflowStates,
  holidays,
  search,
  setSearch,
  expanded,
  setExpanded,
  onJumpToCalendar,
}: {
  obligations: Obligation[];
  calendarTasks: ComplianceCalendarTask[];
  reminderRules: ComplianceReminderRule[];
  workflowStates: ComplianceWorkflowState[];
  holidays: ComplianceHoliday[];
  search: string;
  setSearch: (s: string) => void;
  expanded: Record<string, boolean>;
  setExpanded: (fn: (e: Record<string, boolean>) => Record<string, boolean>) => void;
  onJumpToCalendar: (search: string) => void;
}) {
  let visible = obligations;
  if (search) {
    const term = search.toLowerCase();
    visible = visible.filter((o) => `${o.title} ${o.external_id ?? ""} ${o.domain ?? ""}`.toLowerCase().includes(term));
  }

  const tasksByObligation = useMemo(() => {
    const map: Record<string, ComplianceCalendarTask[]> = {};
    calendarTasks.forEach((t) => {
      if (!map[t.obligation_external_id]) map[t.obligation_external_id] = [];
      map[t.obligation_external_id].push(t);
    });
    return map;
  }, [calendarTasks]);

  const byDomain: Record<string, Obligation[]> = {};
  const order: string[] = [];
  visible.forEach((o) => {
    const d = o.domain || "General";
    if (!byDomain[d]) {
      byDomain[d] = [];
      order.push(d);
    }
    byDomain[d].push(o);
  });

  return (
    <div className={styles["tab-wrap"]}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles["search-box"]}
          placeholder="Search the obligations catalog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className={styles["dash-section-note"]} style={{ margin: 0 }}>
          {visible.length} of {obligations.length} obligations applicable to your profile
        </span>
      </div>

      {visible.length === 0 ? (
        <div className={styles["empty-state"]}>No obligations match this search.</div>
      ) : (
        order.map((domain) => (
          <div key={domain}>
            <div className={styles["month-heading"]}>{domain}</div>
            {byDomain[domain].map((o) => (
              <ObligationCard
                key={o.id}
                o={o}
                related={o.external_id ? tasksByObligation[o.external_id] ?? [] : []}
                isExpanded={!!expanded[o.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [o.id]: !e[o.id] }))}
                onJumpToCalendar={onJumpToCalendar}
              />
            ))}
          </div>
        ))
      )}

      <div className={styles["ref-block"]} style={{ marginTop: 40 }}>
        <h3>How reminders and workflow states work</h3>
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
      </div>

      <div className={styles["ref-block"]}>
        <h3>Workflow states</h3>
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
      </div>

      <div className={styles["ref-block"]}>
        <h3>Public holidays used for working-day calculations</h3>
        <p className={styles["ref-block-note"]}>
          Add any gazetted movable holidays or declared substitute days and update affected due dates before relying
          on them.
        </p>
        <div className={styles["holiday-list"]}>
          {holidays.map((h) => (
            <div key={h.id}>
              {fmtDate(parseISODate(h.holiday_date))} — {h.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ObligationCard({
  o,
  related,
  isExpanded,
  onToggle,
  onJumpToCalendar,
}: {
  o: Obligation;
  related: ComplianceCalendarTask[];
  isExpanded: boolean;
  onToggle: () => void;
  onJumpToCalendar: (search: string) => void;
}) {
  const severityClass =
    o.severity === "Critical" ? styles["badge-severity-critical"] : o.severity === "High" ? styles["badge-severity-high"] : styles["badge-severity-medium"];
  return (
    <div className={`${styles["req-card"]} ${isExpanded ? styles.expanded : ""}`}>
      <div className={styles["req-head"]} onClick={onToggle}>
        <div className={styles["req-id"]}>{o.external_id || ""}</div>
        <div className={styles["req-title-wrap"]}>
          <p className={styles["req-title"]}>{o.title}</p>
          <div className={styles["req-badges"]}>
            {o.severity && <span className={`${styles.badge} ${severityClass}`}>{o.severity}</span>}
            {o.obligation_type && <span className={`${styles.badge} ${styles["badge-domain"]}`}>{o.obligation_type}</span>}
          </div>
        </div>
        <div className={styles.chevron}>▸</div>
      </div>
      {isExpanded && (
        <div className={styles["req-body"]} onClick={(e) => e.stopPropagation()}>
          {o.description && <p>{o.description}</p>}
          <div className={styles["meta-grid"]}>
            <div>
              <span className={styles["mg-label"]}>Legal reference</span>
              <span className={styles["mg-value"]}>{o.legal_ref || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Cadence</span>
              <span className={styles["mg-value"]}>{o.cadence || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Owner / reviewer</span>
              <span className={styles["mg-value"]}>{o.owner_role || "—"} / {o.reviewer_role || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Evidence needed</span>
              <span className={styles["mg-value"]}>{o.evidence_needed || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Submission channel</span>
              <span className={styles["mg-value"]}>{o.submission_channel || "—"}</span>
            </div>
            <div>
              <span className={styles["mg-label"]}>Authority</span>
              <span className={styles["mg-value"]}>{o.authority || "—"}</span>
            </div>
          </div>
          <div className={styles["task-source"]}>Source: {o.source_doc_name || "—"}</div>
          {related.length > 0 && (
            <button className={styles["req-related"]} onClick={() => onJumpToCalendar(o.external_id || o.title)}>
              View {related.length} related calendar task{related.length > 1 ? "s" : ""} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
