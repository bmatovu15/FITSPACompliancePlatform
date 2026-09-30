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
  profileSummaryText,
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
import styles from "./payments-compliance.module.css";

// Beacon-styled port of dashboard/compliance-pathway/compliance-pathway-client.tsx
// (payments branch only). Same Supabase tables/columns, same
// @/lib/compliance-engine applicability rules -- restyled to match the
// uploaded "Beacon — Payments Compliance Assistant" prototype
// (/tmp/beacon-compliance-src.html): masthead/workspace bar, tab shell,
// metric strip, obligation/calendar/evidence row lists with the prototype's
// `.state` colour taxonomy, and a right-hand drawer for detail/editing in
// place of the old page's inline-expanding cards. See the judgment-call
// notes in the task report for where this route's tab layout and wizard
// diverge from the raw prototype markup to fit the real (different) schema.

// ---------------------------------------------------------------------------
// Per-member state helpers (identical to the old page)
// ---------------------------------------------------------------------------

type TaskStateFields = Pick<MemberCalendarTaskState, "workflow" | "evidence_link" | "submitted_date" | "receipt" | "notes">;
function defaultTaskState(): TaskStateFields {
  return { workflow: "Scheduled", evidence_link: "", submitted_date: null, receipt: "", notes: "" };
}

type ControlStateFields = Pick<MemberControlState, "status" | "last_reviewed">;
function defaultControlState(): ControlStateFields {
  return { status: "Effective", last_reviewed: null };
}

type TaskRow = { t: ComplianceCalendarTask; due: Date | null; remaining: number | null; statusTag: "overdue" | "soon" | "scheduled" };

type Tab = "home" | "obligations" | "calendar" | "evidence" | "fees";

type DrawerState =
  | { kind: "task"; id: string }
  | { kind: "obligation"; id: string }
  | { kind: "control"; id: string }
  | { kind: "event"; id: string }
  | { kind: "pickEvent" }
  | null;

// ---------------------------------------------------------------------------
// State-colour taxonomy, ported from the prototype's stateClass()/statusLabel()
// and adapted to the real workflow/control-status vocabulary in @/lib/types.
// ---------------------------------------------------------------------------

const STATE_PRECEDENCE = ["overdue", "action", "confirm", "waiting", "due", "complete", "asneeded"] as const;
function worstState(states: string[]): string {
  for (const s of STATE_PRECEDENCE) if (states.includes(s)) return s;
  return "asneeded";
}
const STATE_LABELS: Record<string, string> = {
  overdue: "Overdue",
  action: "Action required",
  confirm: "Needs review",
  waiting: "Awaiting response",
  due: "Upcoming",
  complete: "Complete",
  asneeded: "No open item",
};

function taskStateKey(x: TaskRow, ts: TaskStateFields): string {
  if (ts.workflow === "Closed") return "complete";
  if (ts.workflow === "Not applicable") return "asneeded";
  if (ts.workflow === "Exception") return "action";
  if (x.statusTag === "overdue") return "overdue";
  if (ts.workflow === "Submitted" || ts.workflow === "Acknowledged") return "waiting";
  if (ts.workflow === "Under review" || ts.workflow === "Approved internally") return "confirm";
  return "due";
}
function controlStateKey(cs: ControlStateFields): string {
  if (cs.status === "Exception") return "action";
  if (cs.status === "Needs attention") return "confirm";
  return "complete";
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function OptionGroup({ value, onSelect }: { value: string; onSelect: (val: string) => void }) {
  return (
    <div className={styles["pc-binary"]}>
      <button type="button" className={value === "Yes" ? styles.selected : ""} onClick={() => onSelect("Yes")}>
        Yes
      </button>
      <button type="button" className={value === "No" ? styles.selected : ""} onClick={() => onSelect("No")}>
        No
      </button>
    </div>
  );
}

type HomeRow = { key: string; title: string; sub: string; meta: string; metaSub?: string; dot?: string; onClick: () => void };

function AttentionRow({ row }: { row: HomeRow }) {
  return (
    <button type="button" className={styles["pc-attention-row"]} onClick={row.onClick}>
      <span className={`${styles["pc-dot"]} ${row.dot ? styles[row.dot] : ""}`}></span>
      <span>
        <span className={styles["pc-attention-title"]}>{row.title}</span>
        <span className={styles["pc-attention-sub"]}>{row.sub}</span>
      </span>
      <span className={styles["pc-attention-meta"]}>
        <strong>{row.meta}</strong>
        {row.metaSub ? <span>{row.metaSub}</span> : null}
      </span>
    </button>
  );
}

function SectionCard({
  title,
  countLabel,
  onViewAll,
  children,
}: {
  title: string;
  countLabel?: string;
  onViewAll?: () => void;
  children: ReactNode;
}) {
  return (
    <section className={styles["pc-section-card"]}>
      <div className={styles["pc-section-head"]}>
        <h2>{title}</h2>
        <div className={styles["pc-section-head-actions"]}>
          {countLabel && <span>{countLabel}</span>}
          {onViewAll && (
            <button className={styles["pc-section-link"]} onClick={onViewAll}>
              View all →
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function EventDrawerBody({
  ev,
  openLog,
  history,
  onLog,
  onResolve,
}: {
  ev: ComplianceEvent;
  openLog: MemberLoggedEvent[];
  history: MemberLoggedEvent[];
  onLog: (eventId: string, chosenDate: Date, deadline: Date) => void;
  onResolve: (logId: string) => void;
}) {
  const [chosen, setChosen] = useState(() => localDateTimeInputValue(new Date()));
  const [deadline, setDeadline] = useState(() => localDateTimeInputValue(new Date()));

  return (
    <>
      <div className={styles["pc-meta-grid"]}>
        <div>
          <div className={styles["pc-row-meta-label"]}>Legal clock</div>
          <div className={styles["pc-row-meta-value"]}>{ev.legal_clock || "—"}</div>
        </div>
        <div>
          <div className={styles["pc-row-meta-label"]}>Owner</div>
          <div className={styles["pc-row-meta-value"]}>{ev.owner_role || "—"}</div>
        </div>
        <div>
          <div className={styles["pc-row-meta-label"]}>Escalation</div>
          <div className={styles["pc-row-meta-value"]}>{ev.escalation || "—"}</div>
        </div>
        <div>
          <div className={styles["pc-row-meta-label"]}>Evidence to retain</div>
          <div className={styles["pc-row-meta-value"]}>{ev.evidence || "—"}</div>
        </div>
      </div>
      {ev.response && <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--pc-ink-soft)" }}>{ev.response}</p>}
      {ev.source_link && (
        <a className={styles["pc-source-link"]} href={ev.source_link} target="_blank" rel="noopener noreferrer">
          view source ↗
        </a>
      )}

      {openLog.length > 0 && (
        <div style={{ marginTop: 20, borderTop: "1px solid var(--pc-rule)", paddingTop: 16 }}>
          <p className={styles["pc-eyebrow"]}>Open occurrence{openLog.length > 1 ? "s" : ""}</p>
          {openLog.map((l) => {
            const deadlineDate = l.deadline ? new Date(l.deadline) : null;
            const remaining = deadlineDate ? daysBetween(deadlineDate, new Date()) : null;
            return (
              <div
                key={l.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #efefec" }}
              >
                <span style={{ fontSize: 11.5 }}>
                  {deadlineDate ? fmtDateTime(deadlineDate) : "—"}
                  {remaining !== null && remaining < 0 ? " — overdue" : ""}
                </span>
                <button className={styles["pc-btn"]} onClick={() => onResolve(l.id)}>
                  Mark resolved
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, borderTop: "1px solid var(--pc-rule)", paddingTop: 16 }}>
        <p className={styles["pc-eyebrow"]}>Log this event</p>
        <div className={styles["pc-evidence-grid"]}>
          <div className={styles["pc-field"]}>
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
          <div className={styles["pc-field"]}>
            <label>Deadline (per legal clock above)</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <button
          className={`${styles["pc-btn"]} ${styles.primary}`}
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

      {history.length > 0 && (
        <div style={{ marginTop: 20, borderTop: "1px solid var(--pc-rule)", paddingTop: 16 }}>
          <p className={styles["pc-eyebrow"]}>Resolved history</p>
          {history.map((l) => (
            <div key={l.id} style={{ fontSize: 11, color: "var(--pc-muted)", padding: "6px 0", borderTop: "1px solid #efefec" }}>
              {fmtDateTime(new Date(l.chosen_date))} — resolved
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function PaymentsComplianceClient({
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
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [savingProfile, setSavingProfile] = useState(false);

  const [taskStates, setTaskStates] = useState<Record<string, TaskStateFields>>(() =>
    Object.fromEntries(initialTaskStates.map((r) => [r.task_id, r]))
  );
  const [controlStates, setControlStates] = useState<Record<string, ControlStateFields>>(() =>
    Object.fromEntries(initialControlStates.map((r) => [r.control_id, r]))
  );
  const [loggedEvents, setLoggedEvents] = useState<MemberLoggedEvent[]>(initialLoggedEvents);

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [obSearch, setObSearch] = useState("");
  const [obChip, setObChip] = useState<"all" | "filings" | "controls" | "events">("all");
  const [calSearch, setCalSearch] = useState("");
  const [calChip, setCalChip] = useState<"all" | "attention" | "upcoming" | "complete">("all");
  const [drawer, setDrawer] = useState<DrawerState>(null);

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
    // issue_date/fye_date/pdpo_expiry are `date` columns used only by the
    // Digital Lending profile; ProfileFields keeps them as "" for Payments,
    // and Postgres rejects "" for a date column, so coerce blanks to null.
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
    router.refresh();
  }

  function patch(p: Partial<ProfileFields>) {
    setDraftProfile((prev) => ({ ...prev, ...p }));
  }

  // ---- Applicable data, filtered by profile (same rules as the old page) ----

  const applicableTasks = useMemo(() => {
    const out = calendarTasks
      .filter((t) => appliesTo(t.applies_to, appliedProfile, catalogKey))
      .map((t) => {
        const due = parseISODate(t.legal_due);
        const remaining = due ? daysBetween(due, todayDate()) : null;
        const statusTag: TaskRow["statusTag"] =
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

  const eventsById = useMemo(() => indexById(events, "id"), [events]);
  const obligationsById = useMemo(() => indexById(obligations, "external_id"), [obligations]);
  const tasksByObligation = useMemo(() => {
    const map: Record<string, ComplianceCalendarTask[]> = {};
    calendarTasks.forEach((t) => {
      if (!map[t.obligation_external_id]) map[t.obligation_external_id] = [];
      map[t.obligation_external_id].push(t);
    });
    return map;
  }, [calendarTasks]);

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
  const upcomingTasks = useMemo(
    () =>
      applicableTasks.filter(
        (x) => x.remaining !== null && x.remaining >= 0 && x.remaining <= 45 && getTaskState(x.t.id).workflow !== "Closed"
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableTasks, taskStates]
  );
  const waitingTasks = useMemo(
    () => applicableTasks.filter((x) => ["Submitted", "Acknowledged"].includes(getTaskState(x.t.id).workflow)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableTasks, taskStates]
  );
  const controlsNeedingReview = useMemo(
    () => applicableControls.filter((c) => getControlState(c.id).status !== "Effective"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicableControls, controlStates]
  );
  const openLoggedEvents = useMemo(() => loggedEvents.filter((l) => l.status !== "closed"), [loggedEvents]);

  function openTaskDrawer(id: string) {
    setDrawer({ kind: "task", id });
  }
  function openControlDrawer(id: string) {
    setDrawer({ kind: "control", id });
  }
  function openEventDrawer(id: string) {
    setDrawer({ kind: "event", id });
  }

  // ---------------------------------------------------------------------
  // Wizard screen
  // ---------------------------------------------------------------------

  if (screen === "wizard") {
    return (
      <>
        <div className={styles["pc-workspace-bar"]}>
          <div className={styles["pc-workspace-brand"]}>
            <span className={styles["pc-workspace-title"]}>Payments Compliance Assistant</span>
            <span className={styles["pc-workspace-sub"]}>Set your licence profile</span>
          </div>
          {profileSet && (
            <div className={styles["pc-workspace-actions"]}>
              <button className={styles["pc-link-btn"]} onClick={() => setScreen("app")}>
                ← Back to workspace
              </button>
            </div>
          )}
        </div>
        <main className={styles["pc-setup-shell"]}>
          <div className={styles["pc-stepper"]}>
            <div className={`${styles["pc-step-dot"]} ${wizardStep === 1 ? styles.active : ""}`}>1</div>
            <div className={styles["pc-step-line"]}></div>
            <div className={`${styles["pc-step-dot"]} ${wizardStep === 2 ? styles.active : ""}`}>2</div>
          </div>

          {wizardStep === 1 ? (
            <>
              <p className={styles["pc-eyebrow"]}>Licence profile</p>
              <h1 className={styles["pc-setup-title"]}>Which NPS licences do you hold?</h1>
              <p className={styles["pc-setup-note"]}>
                Answer every category on your operating licence — Beacon uses the complete licence profile, not a single
                &quot;primary&quot; licence, to work out what applies. A licensee can hold more than one at once (for
                example PSO and PSP together).
              </p>

              <div className={styles["pc-setup-section"]}>
                <h3>Payment system operator (PSO)?</h3>
                <p>Funds transfer, clearing, settlement or third-party systems.</p>
                <OptionGroup
                  value={draftProfile.is_pso}
                  onSelect={(val) =>
                    patch({
                      is_pso: val,
                      primary_category: val === "Yes" ? "PSO" : draftProfile.primary_category,
                      ...(val !== "Yes" ? { pso_class: "", pso_band: "" } : {}),
                    })
                  }
                />
                {draftProfile.is_pso === "Yes" && (
                  <div className={styles["pc-nested"]}>
                    <p className={styles["pc-nested-title"]}>PSO class</p>
                    <div className={styles["pc-field-row"]}>
                      <div className={styles["pc-field"]}>
                        <label>Class</label>
                        <select value={draftProfile.pso_class} onChange={(e) => patch({ pso_class: e.target.value, pso_band: "" })}>
                          <option value="">Select…</option>
                          <option value="funds_transfer">Funds transfer system</option>
                          <option value="clearing">Clearing system or switch</option>
                          <option value="settlement">Settlement system</option>
                          <option value="third_party">Third-party system</option>
                        </select>
                      </div>
                      {draftProfile.pso_class === "funds_transfer" && (
                        <div className={styles["pc-field"]}>
                          <label>Volume band</label>
                          <select value={draftProfile.pso_band} onChange={(e) => patch({ pso_band: e.target.value })}>
                            <option value="">Select…</option>
                            <option value="large">Large — &gt; UGX 100bn/month</option>
                            <option value="medium">Medium — &gt; UGX 1bn to 100bn/month</option>
                            <option value="small">Small — ≤ UGX 1bn/month</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles["pc-setup-section"]}>
                <h3>Payment service provider (PSP)?</h3>
                <p>Electronic money or other payment services.</p>
                <OptionGroup
                  value={draftProfile.is_psp}
                  onSelect={(val) => patch({ is_psp: val, primary_category: val === "Yes" ? "PSP" : draftProfile.primary_category })}
                />
              </div>

              <div className={styles["pc-setup-section"]}>
                <h3>Issuer of a payment instrument?</h3>
                <p>Payment cards, electronic devices or paper-based instruments.</p>
                <OptionGroup
                  value={draftProfile.is_instrument}
                  onSelect={(val) =>
                    patch({ is_instrument: val, primary_category: val === "Yes" ? "Instrument" : draftProfile.primary_category })
                  }
                />
              </div>

              <div className={styles["pc-setup-section"]}>
                <h3>Electronic-money issuer (EMI)?</h3>
                <p>A PSP subtype with extra trust-account, liquidity and reporting duties.</p>
                <OptionGroup value={draftProfile.emi} onSelect={(val) => patch({ emi: val, ...(val !== "Yes" ? { emi_band: "" } : {}) })} />
                {draftProfile.emi === "Yes" && (
                  <div className={styles["pc-nested"]}>
                    <p className={styles["pc-nested-title"]}>Trust-account value band</p>
                    <div className={styles["pc-field"]}>
                      <select value={draftProfile.emi_band} onChange={(e) => patch({ emi_band: e.target.value })}>
                        <option value="">Select…</option>
                        <option value="large">Large — &gt; UGX 100bn</option>
                        <option value="medium1">Medium 1 — &gt; UGX 50bn to 100bn</option>
                        <option value="medium2">Medium 2 — &gt; UGX 5bn to 50bn</option>
                        <option value="medium3">Medium 3 — &gt; UGX 500m to 5bn</option>
                        <option value="small1">Small 1 — &gt; UGX 250m to 500m</option>
                        <option value="small2">Small 2 — ≤ UGX 250m</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles["pc-setup-actions"]}>
                <span className={styles["pc-setup-helper"]}>You can change these later from inside the workspace.</span>
                <button className={`${styles["pc-btn"]} ${styles.primary}`} onClick={() => setWizardStep(2)}>
                  Continue →
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles["pc-eyebrow"]}>Operating profile</p>
              <h1 className={styles["pc-setup-title"]}>Tell Beacon how you operate.</h1>
              <p className={styles["pc-setup-note"]}>We only ask facts that change your compliance obligations or how Beacon should manage them.</p>

              <div className={styles["pc-setup-section"]}>
                <h3>Also a financial institution or microfinance deposit-taking institution?</h3>
                <p>Triggers the SFI cyber-and-technology overlay on top of the NPS framework.</p>
                <OptionGroup value={draftProfile.sfi} onSelect={(val) => patch({ sfi: val })} />
              </div>

              <div className={styles["pc-setup-section"]}>
                <h3>Do you use agents to provide payment services?</h3>
                <OptionGroup value={draftProfile.agent} onSelect={(val) => patch({ agent: val })} />
              </div>

              <div className={styles["pc-setup-section"]}>
                <h3>Do you issue stored-value or prepaid cards?</h3>
                <OptionGroup value={draftProfile.cards} onSelect={(val) => patch({ cards: val })} />
              </div>

              <div className={styles["pc-setup-section"]}>
                <h3>Are you a participant in another payment system or settlement arrangement?</h3>
                <p>This activates participant and settlement obligations that do not apply to every licensee.</p>
                <OptionGroup value={draftProfile.participant} onSelect={(val) => patch({ participant: val })} />
              </div>

              <div className={styles["pc-setup-actions"]}>
                <button className={styles["pc-link-btn"]} onClick={() => setWizardStep(1)}>
                  ← Back
                </button>
                <span className={styles["pc-setup-helper"]}>
                  You can change these facts later. Beacon will not silently change what has already been submitted.
                </span>
                <button
                  className={`${styles["pc-btn"]} ${styles.primary}`}
                  disabled={!validateProfile(draftProfile, catalogKey) || savingProfile}
                  onClick={saveProfile}
                >
                  {savingProfile ? "Saving…" : "Generate my compliance workspace →"}
                </button>
              </div>
            </>
          )}
        </main>
      </>
    );
  }

  // ---------------------------------------------------------------------
  // App screen — Home
  // ---------------------------------------------------------------------

  function renderHome() {
    const attentionRows: HomeRow[] = [
      ...overdueTasks.map((x): HomeRow => ({
        key: "atn-task-" + x.t.id,
        title: x.t.task,
        sub: `${x.t.applies_to} · Overdue filing`,
        meta: `${Math.abs(x.remaining ?? 0)}d overdue`,
        metaSub: fmtDateShort(x.due),
        dot: "danger",
        onClick: () => openTaskDrawer(x.t.id),
      })),
      ...controlsNeedingReview
        .filter((c) => getControlState(c.id).status === "Exception")
        .map((c): HomeRow => ({
          key: "atn-control-" + c.id,
          title: c.objective,
          sub: `${c.domain || "Control"} · Exception`,
          meta: "Review now",
          dot: "danger",
          onClick: () => openControlDrawer(c.id),
        })),
    ];
    const upcomingRows: HomeRow[] = upcomingTasks
      .filter((x) => x.statusTag !== "overdue")
      .map((x) => ({
        key: "up-" + x.t.id,
        title: x.t.task,
        sub: `${x.t.applies_to} · due ${fmtDateShort(x.due)}`,
        meta: x.remaining !== null ? `in ${x.remaining}d` : "—",
        dot: x.statusTag === "soon" ? "warn" : "",
        onClick: () => openTaskDrawer(x.t.id),
      }));
    const waitingRows: HomeRow[] = [
      ...waitingTasks.map((x): HomeRow => ({
        key: "wait-task-" + x.t.id,
        title: x.t.task,
        sub: `${x.t.applies_to} · ${getTaskState(x.t.id).workflow}`,
        meta: fmtDateShort(x.due),
        onClick: () => openTaskDrawer(x.t.id),
      })),
      ...openLoggedEvents.map((l): HomeRow => {
        const ev = eventsById[l.event_id];
        const deadline = l.deadline ? new Date(l.deadline) : null;
        return {
          key: "wait-event-" + l.id,
          title: ev ? ev.trigger_name : l.event_id,
          sub: "Logged event · awaiting resolution",
          meta: deadline ? fmtDateTime(deadline) : "—",
          onClick: () => openEventDrawer(l.event_id),
        };
      }),
    ];

    return (
      <>
        <div className={styles["pc-page-head"]}>
          <div>
            <p className={styles["pc-eyebrow"]}>Payments compliance</p>
            <h1>What needs attention.</h1>
            <p>Your current obligations, deadlines and open compliance actions.</p>
          </div>
          <div className={styles["pc-date-note"]}>Workspace date · {fmtDate(todayDate())}</div>
        </div>

        <div className={styles["pc-metric-strip"]}>
          <div className={styles["pc-metric"]}>
            <span>Scheduled filings applicable</span>
            <strong>{applicableTasks.length}</strong>
          </div>
          <div className={`${styles["pc-metric"]} ${overdueTasks.length ? styles.danger : ""}`}>
            <span>Overdue</span>
            <strong>{overdueTasks.length}</strong>
          </div>
          <div className={`${styles["pc-metric"]} ${soonTasks.length ? styles.warn : ""}`}>
            <span>Due within 30 days</span>
            <strong>{soonTasks.length}</strong>
          </div>
          <div className={styles["pc-metric"]}>
            <span>Continuous controls tracked</span>
            <strong>{applicableControls.length}</strong>
          </div>
        </div>

        <div className={styles["pc-notice"]}>{coverageWarning(catalogKey)}</div>

        <div className={styles["pc-home-grid"]}>
          <div className={styles["pc-stack"]}>
            <SectionCard
              title="Needs attention"
              countLabel={`${attentionRows.length} item${attentionRows.length === 1 ? "" : "s"}`}
              onViewAll={() => {
                setActiveTab("calendar");
                setCalChip("attention");
              }}
            >
              {attentionRows.length === 0 ? (
                <div className={styles["pc-empty"]}>Nothing needs attention right now.</div>
              ) : (
                attentionRows.slice(0, 6).map((r) => <AttentionRow key={r.key} row={r} />)
              )}
            </SectionCard>
            <SectionCard
              title="Upcoming"
              countLabel="Next 45 days"
              onViewAll={() => {
                setActiveTab("calendar");
                setCalChip("upcoming");
              }}
            >
              {upcomingRows.length === 0 ? (
                <div className={styles["pc-empty"]}>Nothing scheduled in the next 45 days.</div>
              ) : (
                upcomingRows.slice(0, 6).map((r) => <AttentionRow key={r.key} row={r} />)
              )}
            </SectionCard>
            <SectionCard
              title="Waiting"
              countLabel="Submitted / regulator response"
              onViewAll={() => {
                setActiveTab("calendar");
                setCalChip("all");
              }}
            >
              {waitingRows.length === 0 ? (
                <div className={styles["pc-empty"]}>Nothing awaiting a response.</div>
              ) : (
                waitingRows.slice(0, 6).map((r) => <AttentionRow key={r.key} row={r} />)
              )}
            </SectionCard>
          </div>
          <div className={styles["pc-stack"]}>
            <SectionCard title="Quick actions">
              <div className={styles["pc-quick-grid"]}>
                <button className={styles["pc-quick-btn"]} onClick={() => setDrawer({ kind: "pickEvent" })}>
                  Report a change or event
                  <span>Outage, director change, outsourcing, branch, fee change and more.</span>
                </button>
                <button className={styles["pc-quick-btn"]} onClick={() => setActiveTab("calendar")}>
                  Add evidence to a filing
                  <span>Link a receipt, approval or submission record to the right filing.</span>
                </button>
                <button
                  className={styles["pc-quick-btn"]}
                  onClick={() => {
                    setActiveTab("obligations");
                    setObChip("controls");
                  }}
                >
                  Review continuous controls
                  <span>Check status on controls that have no filing date of their own.</span>
                </button>
                <button
                  className={styles["pc-quick-btn"]}
                  onClick={() => {
                    setActiveTab("obligations");
                    setObChip("all");
                  }}
                >
                  Browse the full obligations reference
                  <span>Every obligation that applies to your current licence and operating profile.</span>
                </button>
              </div>
            </SectionCard>
            <SectionCard
              title="Controls to review"
              countLabel={`${controlsNeedingReview.length}`}
              onViewAll={() => {
                setActiveTab("obligations");
                setObChip("controls");
              }}
            >
              {controlsNeedingReview.length === 0 ? (
                <div className={styles["pc-empty"]}>All continuous controls are marked effective.</div>
              ) : (
                controlsNeedingReview.slice(0, 6).map((c) => (
                  <AttentionRow
                    key={c.id}
                    row={{
                      key: c.id,
                      title: c.objective,
                      sub: `${c.domain || "Control"} · ${getControlState(c.id).status}`,
                      meta: c.cadence || "—",
                      dot: getControlState(c.id).status === "Exception" ? "danger" : "warn",
                      onClick: () => openControlDrawer(c.id),
                    }}
                  />
                ))
              )}
            </SectionCard>
            <section className={styles["pc-section-card"]}>
              <div className={styles["pc-profile-mini"]}>
                <strong>Compliance profile</strong>
                <p>{profileSummaryText(appliedProfile, catalogKey)}</p>
                <button
                  className={styles["pc-link-btn"]}
                  style={{ padding: "8px 0 0" }}
                  onClick={() => {
                    setDraftProfile(appliedProfile);
                    setWizardStep(1);
                    setScreen("wizard");
                  }}
                >
                  Edit profile →
                </button>
              </div>
            </section>
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------
  // App screen — Obligations (unified filings + controls + event triggers)
  // ---------------------------------------------------------------------

  function renderObligations() {
    const term = obSearch.trim().toLowerCase();
    type Row = {
      key: string;
      title: string;
      sub: string;
      metaLabel: string;
      metaValue: string;
      state: string;
      onClick: () => void;
    };

    const filingRows: Row[] = applicableObligations.map((o) => {
      const related = o.external_id ? tasksByObligation[o.external_id] ?? [] : [];
      const relStates = related.map((t) => {
        const due = parseISODate(t.legal_due);
        const remaining = due ? daysBetween(due, todayDate()) : null;
        const statusTag: TaskRow["statusTag"] =
          remaining === null ? "scheduled" : remaining < 0 ? "overdue" : remaining <= 30 ? "soon" : "scheduled";
        return taskStateKey({ t, due, remaining, statusTag }, getTaskState(t.id));
      });
      const state = related.length ? worstState(relStates) : "asneeded";
      const nextTask = related
        .slice()
        .sort((a, b) => (parseISODate(a.legal_due)?.getTime() ?? Infinity) - (parseISODate(b.legal_due)?.getTime() ?? Infinity))[0];
      return {
        key: "ob-" + o.id,
        title: o.title,
        sub: `${o.domain || "General"}${o.obligation_type ? " · " + o.obligation_type : ""}`,
        metaLabel: related.length ? "Next occurrence" : "Cadence",
        metaValue: related.length ? fmtDateShort(parseISODate(nextTask?.legal_due ?? null)) : o.cadence || "—",
        state,
        onClick: () => setDrawer({ kind: "obligation", id: o.id }),
      };
    });
    const controlRows: Row[] = applicableControls.map((c) => ({
      key: "ctl-" + c.id,
      title: c.objective,
      sub: `${c.domain || "Control"} · Continuous control`,
      metaLabel: "Cadence",
      metaValue: c.cadence || "—",
      state: controlStateKey(getControlState(c.id)),
      onClick: () => openControlDrawer(c.id),
    }));
    const eventRows: Row[] = applicableEvents.map((ev) => {
      const open = loggedEvents.find((l) => l.event_id === ev.id && l.status !== "closed");
      return {
        key: "evt-" + ev.id,
        title: ev.trigger_name,
        sub: `${ev.applies_to} · Event-triggered`,
        metaLabel: open ? "Deadline" : "Legal clock",
        metaValue: open && open.deadline ? fmtDateTime(new Date(open.deadline)) : ev.legal_clock || "—",
        state: open ? "waiting" : "asneeded",
        onClick: () => openEventDrawer(ev.id),
      };
    });

    let rows: Row[] = [...filingRows, ...controlRows, ...eventRows];
    if (obChip === "filings") rows = filingRows;
    else if (obChip === "controls") rows = controlRows;
    else if (obChip === "events") rows = eventRows;
    if (term) rows = rows.filter((r) => `${r.title} ${r.sub}`.toLowerCase().includes(term));

    return (
      <>
        <div className={styles["pc-page-head"]}>
          <div>
            <p className={styles["pc-eyebrow"]}>Your compliance universe</p>
            <h1>Obligations</h1>
            <p>Only obligations that apply to your current licence and operating profile are shown.</p>
          </div>
          <div className={styles["pc-date-note"]}>
            {rows.length} of {filingRows.length + controlRows.length + eventRows.length}
          </div>
        </div>
        <div className={styles["pc-toolbar"]}>
          <input
            type="search"
            className={styles["pc-search"]}
            placeholder="Search obligations…"
            value={obSearch}
            onChange={(e) => setObSearch(e.target.value)}
          />
          <div className={styles["pc-chips"]}>
            {(["all", "filings", "controls", "events"] as const).map((k) => (
              <button key={k} className={`${styles["pc-chip"]} ${obChip === k ? styles.active : ""}`} onClick={() => setObChip(k)}>
                {k === "all" ? "All" : k === "filings" ? "Filings" : k === "controls" ? "Continuous controls" : "Event triggers"}
              </button>
            ))}
          </div>
        </div>
        <div className={styles["pc-obligation-list"]}>
          {rows.length === 0 ? (
            <div className={styles["pc-empty"]}>No obligations match this search.</div>
          ) : (
            rows.map((r) => (
              <button key={r.key} type="button" className={styles["pc-obligation-row"]} onClick={r.onClick}>
                <div>
                  <div className={styles["pc-row-title"]}>{r.title}</div>
                  <div className={styles["pc-row-sub"]}>{r.sub}</div>
                </div>
                <div>
                  <div className={styles["pc-row-meta-label"]}>{r.metaLabel}</div>
                  <div className={styles["pc-row-meta-value"]}>{r.metaValue}</div>
                </div>
                <span className={`${styles["pc-state"]} ${styles[r.state] ?? ""}`}>{STATE_LABELS[r.state] ?? r.state}</span>
              </button>
            ))
          )}
        </div>

        <div style={{ marginTop: 40, borderTop: "1px solid var(--pc-rule)", paddingTop: 20 }}>
          <p className={styles["pc-eyebrow"]}>How reminders and workflow states work</p>
          <table className={styles["pc-fee-table"]}>
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
        <div style={{ marginTop: 28 }}>
          <p className={styles["pc-eyebrow"]}>Public holidays used for working-day calculations</p>
          <div style={{ fontSize: 11, color: "var(--pc-slate)", lineHeight: 1.9 }}>
            {holidays.map((h) => (
              <div key={h.id}>
                {fmtDate(parseISODate(h.holiday_date))} — {h.name}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------
  // App screen — Calendar
  // ---------------------------------------------------------------------

  function renderCalendar() {
    let visible = applicableTasks;
    if (calChip === "attention") visible = visible.filter((x) => x.statusTag === "overdue" || x.statusTag === "soon");
    else if (calChip === "upcoming") visible = visible.filter((x) => x.statusTag !== "overdue" && getTaskState(x.t.id).workflow !== "Closed");
    else if (calChip === "complete") visible = visible.filter((x) => getTaskState(x.t.id).workflow === "Closed");
    if (calSearch) {
      const term = calSearch.toLowerCase();
      visible = visible.filter((x) => `${x.t.task} ${x.t.obligation_external_id} ${x.t.period || ""}`.toLowerCase().includes(term));
    }

    type CalRow = {
      key: string;
      dateLabel: string;
      yearLabel: string;
      sortKey: number;
      title: string;
      sub: string;
      appliesLabel: string;
      state: string;
      onClick: () => void;
      monthKey: string;
    };

    const taskRows: CalRow[] = visible.map((x) => ({
      key: "task-" + x.t.id,
      dateLabel: fmtDateShort(x.due),
      yearLabel: x.due ? String(x.due.getFullYear()) : "",
      sortKey: x.due ? x.due.getTime() : Infinity,
      title: x.t.task,
      sub: getTaskState(x.t.id).workflow,
      appliesLabel: x.t.applies_to,
      state: taskStateKey(x, getTaskState(x.t.id)),
      onClick: () => openTaskDrawer(x.t.id),
      monthKey: x.due ? `${x.due.getFullYear()}-${String(x.due.getMonth() + 1).padStart(2, "0")}` : "undated",
    }));

    let eventRows: CalRow[] = [];
    if (calChip === "all" || calChip === "attention") {
      eventRows = openLoggedEvents
        .map((l): CalRow | null => {
          const ev = eventsById[l.event_id];
          const deadline = l.deadline ? new Date(l.deadline) : null;
          const remaining = deadline ? daysBetween(deadline, todayDate()) : null;
          const overdue = remaining !== null && remaining < 0;
          if (calChip === "attention" && !overdue) return null;
          if (calSearch && ev && !ev.trigger_name.toLowerCase().includes(calSearch.toLowerCase())) return null;
          return {
            key: "levent-" + l.id,
            dateLabel: deadline ? fmtDateShort(deadline) : "—",
            yearLabel: deadline ? String(deadline.getFullYear()) : "",
            sortKey: deadline ? deadline.getTime() : Infinity,
            title: ev ? ev.trigger_name : l.event_id,
            sub: "Awaiting resolution",
            appliesLabel: "Event",
            state: overdue ? "overdue" : "waiting",
            onClick: () => openEventDrawer(l.event_id),
            monthKey: deadline ? `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}` : "undated",
          };
        })
        .filter((r): r is CalRow => r !== null);
    }

    const allRows = [...taskRows, ...eventRows].sort((a, b) => a.sortKey - b.sortKey);
    const byMonth: Record<string, CalRow[]> = {};
    const order: string[] = [];
    allRows.forEach((r) => {
      if (!byMonth[r.monthKey]) {
        byMonth[r.monthKey] = [];
        order.push(r.monthKey);
      }
      byMonth[r.monthKey].push(r);
    });

    return (
      <>
        <div className={styles["pc-page-head"]}>
          <div>
            <p className={styles["pc-eyebrow"]}>Generated from the rules</p>
            <h1>Calendar</h1>
            <p>Legal deadlines and internal review dates are labelled separately. Event-driven items appear only after the event is logged.</p>
          </div>
        </div>
        <div className={styles["pc-toolbar"]}>
          <input
            type="search"
            className={styles["pc-search"]}
            placeholder="Search calendar…"
            value={calSearch}
            onChange={(e) => setCalSearch(e.target.value)}
          />
          <div className={styles["pc-chips"]}>
            {(["all", "attention", "upcoming", "complete"] as const).map((k) => (
              <button key={k} className={`${styles["pc-chip"]} ${calChip === k ? styles.active : ""}`} onClick={() => setCalChip(k)}>
                {k === "all" ? "All" : k === "attention" ? "Needs attention" : k === "upcoming" ? "Upcoming" : "Complete"}
              </button>
            ))}
          </div>
        </div>
        <div className={styles["pc-calendar-list"]}>
          {allRows.length === 0 ? (
            <div className={styles["pc-empty"]}>No scheduled filings match this filter.</div>
          ) : (
            order.map((key) => (
              <div key={key}>
                <div className={styles["pc-group-label"]}>{key === "undated" ? "Undated" : monthLabel(key)}</div>
                {byMonth[key].map((r) => (
                  <button key={r.key} type="button" className={styles["pc-calendar-row"]} onClick={r.onClick}>
                    <div className={styles["pc-cal-date"]}>
                      {r.dateLabel}
                      <span>{r.yearLabel}</span>
                    </div>
                    <div>
                      <div className={styles["pc-row-title"]}>{r.title}</div>
                      <div className={styles["pc-row-sub"]}>{r.sub}</div>
                    </div>
                    <div className={styles["pc-row-meta-value"]}>{r.appliesLabel}</div>
                    <span className={`${styles["pc-state"]} ${styles[r.state] ?? ""}`}>{STATE_LABELS[r.state] ?? r.state}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------
  // App screen — Evidence
  // ---------------------------------------------------------------------

  function renderEvidence() {
    type EvRow = { key: string; title: string; sub: string; date: string; state: string; onClick: () => void };

    const taskEvidence: EvRow[] = applicableTasks
      .filter((x) => {
        const ts = getTaskState(x.t.id);
        return !!(ts.evidence_link || ts.receipt);
      })
      .map((x) => {
        const ts = getTaskState(x.t.id);
        return {
          key: "tev-" + x.t.id,
          title: x.t.task,
          sub: `Filing evidence · ${ts.receipt ? `Receipt ${ts.receipt}` : "Link on file"}`,
          date: ts.submitted_date ? fmtDate(parseISODate(ts.submitted_date)) : "—",
          state: "complete",
          onClick: () => openTaskDrawer(x.t.id),
        };
      });
    const controlEvidence: EvRow[] = applicableControls
      .filter((c) => !!getControlState(c.id).last_reviewed)
      .map((c) => {
        const cs = getControlState(c.id);
        return {
          key: "cev-" + c.id,
          title: c.objective,
          sub: "Control review evidence",
          date: cs.last_reviewed ? fmtDate(parseISODate(cs.last_reviewed)) : "—",
          state: controlStateKey(cs),
          onClick: () => openControlDrawer(c.id),
        };
      });
    const eventEvidence: EvRow[] = loggedEvents
      .filter((l) => l.status === "closed")
      .map((l) => {
        const ev = eventsById[l.event_id];
        return {
          key: "eev-" + l.id,
          title: ev ? ev.trigger_name : l.event_id,
          sub: "Event record · resolved",
          date: fmtDate(parseISODate(l.chosen_date.slice(0, 10))),
          state: "complete",
          onClick: () => openEventDrawer(l.event_id),
        };
      });
    const rows = [...taskEvidence, ...controlEvidence, ...eventEvidence];

    return (
      <>
        <div className={styles["pc-page-head"]}>
          <div>
            <p className={styles["pc-eyebrow"]}>Audit trail</p>
            <h1>Evidence</h1>
            <p>Every record here is linked to the filing, control review or event it supports.</p>
          </div>
          <button className={styles["pc-btn"]} onClick={() => setActiveTab("calendar")}>
            Add evidence
          </button>
        </div>
        <div className={styles["pc-evidence-list"]}>
          {rows.length === 0 ? (
            <div className={styles["pc-empty"]}>
              No evidence has been recorded yet. Add evidence from a calendar filing, a control review or a resolved event.
            </div>
          ) : (
            rows.map((r) => (
              <button key={r.key} type="button" className={styles["pc-evidence-row"]} onClick={r.onClick}>
                <div>
                  <div className={styles["pc-row-title"]}>{r.title}</div>
                  <div className={styles["pc-row-sub"]}>{r.sub}</div>
                </div>
                <div className={styles["pc-row-meta-value"]}>{r.date}</div>
                <span className={`${styles["pc-state"]} ${styles[r.state] ?? ""}`}>{STATE_LABELS[r.state] ?? r.state}</span>
              </button>
            ))
          )}
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------
  // App screen — Fees
  // ---------------------------------------------------------------------

  function renderFees() {
    return (
      <>
        <div className={styles["pc-page-head"]}>
          <div>
            <p className={styles["pc-eyebrow"]}>Fees &amp; capital</p>
            <h1>Fees</h1>
            <p>Fees, thresholds and other financial requirements published under this catalog&apos;s regulatory framework.</p>
          </div>
        </div>
        {catalogFees.length === 0 ? (
          <div className={styles["pc-empty"]}>No fee schedule published for this catalog yet.</div>
        ) : (
          <table className={styles["pc-fee-table"]}>
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
              {catalogFees.map((f) => (
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
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------
  // Drawer
  // ---------------------------------------------------------------------

  function drawerContent(): { kicker: string; title: string; body: ReactNode } | null {
    if (!drawer) return null;

    if (drawer.kind === "task") {
      const x = applicableTasks.find((r) => r.t.id === drawer.id);
      if (!x) return null;
      const t = x.t;
      const ts = getTaskState(t.id);
      const obligation = obligationsById[t.obligation_external_id];
      const wfOptions = workflowStates.length > 0 ? workflowStates.map((w) => w.state) : (WORKFLOW_STATES as readonly string[]);
      return {
        kicker: t.applies_to,
        title: t.task,
        body: (
          <>
            {obligation?.description && <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--pc-ink-soft)" }}>{obligation.description}</p>}
            <div className={styles["pc-meta-grid"]}>
              <div>
                <div className={styles["pc-row-meta-label"]}>Reporting period</div>
                <div className={styles["pc-row-meta-value"]}>{t.period || "—"}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Internal target</div>
                <div className={styles["pc-row-meta-value"]}>{fmtDate(parseISODate(t.internal_target))}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Owner / reviewer</div>
                <div className={styles["pc-row-meta-value"]}>
                  {t.owner_role || "—"} / {t.reviewer_role || "—"}
                </div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Legal due date</div>
                <div className={styles["pc-row-meta-value"]}>{fmtDate(x.due)}</div>
              </div>
            </div>
            {t.notes && <div className={styles["pc-notice"]}>{t.notes}</div>}
            {t.source_link && (
              <a className={styles["pc-source-link"]} href={t.source_link} target="_blank" rel="noopener noreferrer">
                view source ↗
              </a>
            )}

            <div className={styles["pc-wf-row"]} style={{ marginTop: 20 }}>
              <label>Workflow status</label>
              <select value={ts.workflow} onChange={(e) => updateTaskState(t.id, { workflow: e.target.value })}>
                {wfOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles["pc-evidence-grid"]}>
              <div className={styles["pc-field"]}>
                <label>Evidence / submission link</label>
                <input
                  type="text"
                  defaultValue={ts.evidence_link ?? ""}
                  placeholder="Link to filed document or folder"
                  onBlur={(e) => updateTaskState(t.id, { evidence_link: e.target.value })}
                />
              </div>
              <div className={styles["pc-field"]}>
                <label>Submitted date</label>
                <input
                  type="date"
                  defaultValue={ts.submitted_date ?? ""}
                  onChange={(e) => updateTaskState(t.id, { submitted_date: e.target.value || null })}
                />
              </div>
              <div className={styles["pc-field"]}>
                <label>Receipt / acknowledgment</label>
                <input
                  type="text"
                  defaultValue={ts.receipt ?? ""}
                  placeholder="Reference or confirmation number"
                  onBlur={(e) => updateTaskState(t.id, { receipt: e.target.value })}
                />
              </div>
            </div>
            <div className={styles["pc-field"]}>
              <label>Notes</label>
              <textarea defaultValue={ts.notes ?? ""} placeholder="Notes…" onBlur={(e) => updateTaskState(t.id, { notes: e.target.value })} />
            </div>
          </>
        ),
      };
    }

    if (drawer.kind === "obligation") {
      const o = obligations.find((ob) => ob.id === drawer.id);
      if (!o) return null;
      const related = o.external_id ? tasksByObligation[o.external_id] ?? [] : [];
      return {
        kicker: o.domain || "General",
        title: o.title,
        body: (
          <>
            {o.description && <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--pc-ink-soft)" }}>{o.description}</p>}
            <div className={styles["pc-meta-grid"]}>
              <div>
                <div className={styles["pc-row-meta-label"]}>Legal reference</div>
                <div className={styles["pc-row-meta-value"]}>{o.legal_ref || "—"}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Cadence</div>
                <div className={styles["pc-row-meta-value"]}>{o.cadence || "—"}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Owner / reviewer</div>
                <div className={styles["pc-row-meta-value"]}>
                  {o.owner_role || "—"} / {o.reviewer_role || "—"}
                </div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Evidence needed</div>
                <div className={styles["pc-row-meta-value"]}>{o.evidence_needed || "—"}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Submission channel</div>
                <div className={styles["pc-row-meta-value"]}>{o.submission_channel || "—"}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Authority</div>
                <div className={styles["pc-row-meta-value"]}>{o.authority || "—"}</div>
              </div>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--pc-muted)" }}>Source: {o.source_doc_name || "—"}</p>
            {related.length > 0 && (
              <div style={{ marginTop: 20, borderTop: "1px solid var(--pc-rule)", paddingTop: 16 }}>
                <p className={styles["pc-eyebrow"]}>Related calendar occurrences</p>
                {related.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={styles["pc-section-link"]}
                    style={{ display: "block", padding: "8px 0" }}
                    onClick={() => openTaskDrawer(t.id)}
                  >
                    {t.task} — due {fmtDateShort(parseISODate(t.legal_due))} →
                  </button>
                ))}
              </div>
            )}
          </>
        ),
      };
    }

    if (drawer.kind === "control") {
      const c = controls.find((cc) => cc.id === drawer.id);
      if (!c) return null;
      const cs = getControlState(c.id);
      const interval = intervalDaysForCadence(c.cadence);
      let nextCheckText = "";
      if (interval && cs.last_reviewed) {
        const next = parseISODate(cs.last_reviewed);
        if (next) {
          next.setDate(next.getDate() + interval);
          const rem = daysBetween(next, todayDate());
          nextCheckText = `Next check: ${fmtDate(next)}${rem < 0 ? " — overdue" : ""}`;
        }
      }
      return {
        kicker: c.domain || "Continuous control",
        title: c.objective,
        body: (
          <>
            {c.operation && <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--pc-ink-soft)" }}>{c.operation}</p>}
            <div className={styles["pc-meta-grid"]}>
              <div>
                <div className={styles["pc-row-meta-label"]}>Cadence</div>
                <div className={styles["pc-row-meta-value"]}>{c.cadence || "—"}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Owner / reviewer</div>
                <div className={styles["pc-row-meta-value"]}>
                  {c.owner_role || "—"} / {c.reviewer_role || "—"}
                </div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>Evidence / test</div>
                <div className={styles["pc-row-meta-value"]}>{c.evidence || "—"}</div>
              </div>
              <div>
                <div className={styles["pc-row-meta-label"]}>If this fails</div>
                <div className={styles["pc-row-meta-value"]}>{c.failure_response || "—"}</div>
              </div>
            </div>
            {c.source_link && (
              <a className={styles["pc-source-link"]} href={c.source_link} target="_blank" rel="noopener noreferrer">
                view source ↗
              </a>
            )}
            <div className={styles["pc-wf-row"]} style={{ marginTop: 20 }}>
              <label>Status</label>
              <select value={cs.status} onChange={(e) => updateControlState(c.id, { status: e.target.value })}>
                <option value="Effective">Effective</option>
                <option value="Needs attention">Needs attention</option>
                <option value="Exception">Exception</option>
              </select>
            </div>
            <div className={styles["pc-field"]}>
              <label>Last checked</label>
              <input type="date" defaultValue={cs.last_reviewed ?? ""} onChange={(e) => updateControlState(c.id, { last_reviewed: e.target.value || null })} />
            </div>
            {nextCheckText && <p style={{ fontSize: 11, color: "var(--pc-muted)", marginTop: 8 }}>{nextCheckText}</p>}
          </>
        ),
      };
    }

    if (drawer.kind === "event") {
      const ev = events.find((e) => e.id === drawer.id);
      if (!ev) return null;
      const openLog = loggedEvents
        .filter((l) => l.event_id === ev.id && l.status !== "closed")
        .sort((a, b) => new Date(a.deadline ?? a.chosen_date).getTime() - new Date(b.deadline ?? b.chosen_date).getTime());
      const history = loggedEvents.filter((l) => l.event_id === ev.id && l.status === "closed");
      return {
        kicker: ev.applies_to,
        title: ev.trigger_name,
        body: <EventDrawerBody ev={ev} openLog={openLog} history={history} onLog={logEvent} onResolve={resolveLoggedEvent} />,
      };
    }

    if (drawer.kind === "pickEvent") {
      return {
        kicker: "Payments compliance",
        title: "Report a change or event",
        body: (
          <>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--pc-slate)", marginBottom: 16 }}>
              Choose what happened. Beacon works out the obligations and timing that follow.
            </p>
            {applicableEvents.length === 0 ? (
              <div className={styles["pc-empty"]}>No event-triggered clocks apply to this profile.</div>
            ) : (
              <div className={styles["pc-event-grid"]}>
                {applicableEvents.map((ev) => (
                  <button key={ev.id} type="button" className={styles["pc-event-card"]} onClick={() => setDrawer({ kind: "event", id: ev.id })}>
                    <strong>{ev.trigger_name}</strong>
                    <span>{ev.legal_clock || "Applies to " + ev.applies_to}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ),
      };
    }

    return null;
  }

  const dc = drawerContent();

  return (
    <>
      <div className={styles["pc-workspace-bar"]}>
        <div className={styles["pc-workspace-brand"]}>
          <span className={styles["pc-workspace-title"]}>Payments Compliance Assistant</span>
          <span className={styles["pc-workspace-sub"]}>{profileSummaryText(appliedProfile, catalogKey)}</span>
        </div>
        <div className={styles["pc-workspace-actions"]}>
          <button
            className={styles["pc-link-btn"]}
            onClick={() => {
              setDraftProfile(appliedProfile);
              setWizardStep(1);
              setScreen("wizard");
            }}
          >
            Compliance profile
          </button>
          <button className={`${styles["pc-btn"]} ${styles.primary} ${styles.small}`} onClick={() => setDrawer({ kind: "pickEvent" })}>
            + Report change or event
          </button>
        </div>
      </div>

      <nav className={styles["pc-tabs"]}>
        {(
          [
            ["home", "Home"],
            ["obligations", "Obligations"],
            ["calendar", "Calendar"],
            ["evidence", "Evidence"],
            ["fees", "Fees"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} className={`${styles["pc-tab"]} ${activeTab === key ? styles.active : ""}`} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      <main className={styles["pc-shell"]}>
        {activeTab === "home" && renderHome()}
        {activeTab === "obligations" && renderObligations()}
        {activeTab === "calendar" && renderCalendar()}
        {activeTab === "evidence" && renderEvidence()}
        {activeTab === "fees" && renderFees()}
      </main>

      <button className={styles["pc-fab"]} onClick={() => setDrawer({ kind: "pickEvent" })}>
        + Report change or event
      </button>

      <div className={`${styles["pc-backdrop"]} ${drawer ? styles.open : ""}`} onClick={() => setDrawer(null)} />
      <aside className={`${styles["pc-drawer"]} ${drawer ? styles.open : ""}`}>
        <div className={styles["pc-drawer-head"]}>
          <div>
            <div className={styles["pc-drawer-kicker"]}>{dc?.kicker ?? ""}</div>
            <h2>{dc?.title ?? ""}</h2>
          </div>
          <button className={styles["pc-drawer-close"]} aria-label="Close" onClick={() => setDrawer(null)}>
            ×
          </button>
        </div>
        <div className={styles["pc-drawer-body"]}>{dc?.body}</div>
      </aside>
    </>
  );
}
