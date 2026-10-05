"use client";

import type { KeyboardEvent, ReactNode } from "react";
import {
  BY_ID,
  applicableEntries,
  controlsToReview,
  currentStateForEntry,
  filterCalendar,
  filterObligations,
  fmtDate,
  fmtDateTime,
  fmtShort,
  homeSummary,
  longDate,
  operationalGroup,
  profileText,
  stateClass,
  statusLabel,
  taskTiming,
  type CalFilter,
  type ObFilter,
  type ObStateFilter,
  type Task,
} from "@/lib/comply/payments-engine";
import type { PcCtx } from "./pc-types";

function InfoBtn({ ctx, id, label }: { ctx: PcCtx; id: string; label: string }) {
  return (
    <button
      type="button"
      className="info-btn"
      data-info={id}
      aria-label={`Guidance: ${label}`}
      onClick={(ev) => {
        ev.stopPropagation();
        ctx.openDrawer({ kind: "guide", id });
      }}
    >
      i
    </button>
  );
}

function activate(fn: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (ev: KeyboardEvent) => {
      if (ev.target !== ev.currentTarget) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        fn();
      }
    },
  };
}

function TaskRows({ ctx, tasks, empty }: { ctx: PcCtx; tasks: Task[]; empty: string }) {
  if (!tasks.length) return <div className="empty">{empty}</div>;
  return (
    <>
      {tasks.map((t) => {
        const e = BY_ID[t.id] || { requirement: t.period };
        return (
          <div className="attention-row" key={t.key} data-task={t.key} {...activate(() => ctx.openDrawer({ kind: "work", id: t.id, taskKey: t.key }))}>
            <span className={`dot ${t.state === "overdue" ? "danger" : t.state === "confirm" ? "warn" : ""}`}></span>
            <div>
              <div className="attention-title">
                {e.requirement} <InfoBtn ctx={ctx} id={t.id} label={e.requirement} />
              </div>
              <div className="attention-sub">
                {t.period} · {taskTiming(t, ctx.clock)}
              </div>
            </div>
            <div className="attention-meta">
              <strong>{statusLabel(t.state)}</strong>
              <span>{t.due ? fmtShort(t.due) : "Open"}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function HomePanel({ ctx }: { ctx: PcCtx }) {
  const { state, tasks, clock } = ctx;
  const h = homeSummary(tasks, clock);
  const controls = controlsToReview(state);
  const metricClick = (m: "overdue" | "confirm" | "upcoming" | "waiting") => {
    if (m === "upcoming") {
      ctx.setCalFilter("upcoming");
      ctx.goTab("calendar");
      return;
    }
    ctx.setObFilter("all");
    ctx.setObStateFilter(m);
    ctx.goTab("obligations");
  };
  const viewAll = (v: "attention" | "upcoming" | "waiting" | "controls") => {
    if (v === "upcoming") {
      ctx.setCalFilter("upcoming");
      ctx.goTab("calendar");
      return;
    }
    if (v === "attention") {
      ctx.setCalFilter("attention");
      ctx.goTab("calendar");
      return;
    }
    if (v === "controls") {
      ctx.setObFilter("controls");
      ctx.setObStateFilter("all");
      ctx.goTab("obligations");
      return;
    }
    ctx.setObFilter("all");
    ctx.setObStateFilter(v);
    ctx.goTab("obligations");
  };
  const metric = (cls: string, key: "overdue" | "confirm" | "upcoming" | "waiting", label: string, n: number) => (
    <div className={`metric ${cls}`.trim()} data-metric={key} {...activate(() => metricClick(key))} aria-label={`${label}: ${n}`}>
      <span>{label}</span>
      <strong>{n}</strong>
    </div>
  );
  return (
    <section className="panel active" id="panel-home">
      <div className="page-head">
        <div>
          <p className="eyebrow">Payments compliance</p>
          <h1>What needs attention.</h1>
          <p id="home-subtitle">Your current obligations, deadlines and open compliance actions.</p>
        </div>
        <div className="date-note">Workspace date · {longDate(clock.todayISO)}</div>
      </div>
      <div className="metric-strip" id="home-metrics">
        {metric("danger", "overdue", "Overdue", h.overdue)}
        {metric("warn", "confirm", "Needs confirmation", h.confirm)}
        {metric("", "upcoming", "Due within 45 days", h.dueSoon)}
        {metric("success", "waiting", "Waiting on response", h.waiting.length)}
      </div>
      <div className="home-grid">
        <div className="stack">
          <section className="section-card">
            <div className="section-head">
              <h2>Needs attention</h2>
              <div className="section-head-actions">
                <span id="attention-count">
                  {h.attention.length ? `${h.attention.length} item${h.attention.length === 1 ? "" : "s"}` : "Clear"}
                </span>
                <button type="button" className="section-link" data-view-all="attention" onClick={() => viewAll("attention")}>
                  View all →
                </button>
              </div>
            </div>
            <div id="home-attention">
              <TaskRows ctx={ctx} tasks={h.attention.slice(0, 7)} empty="Nothing needs immediate attention." />
            </div>
          </section>
          <section className="section-card">
            <div className="section-head">
              <h2>Upcoming</h2>
              <div className="section-head-actions">
                <span>Next 45 days</span>
                <button type="button" className="section-link" data-view-all="upcoming" onClick={() => viewAll("upcoming")}>
                  View all →
                </button>
              </div>
            </div>
            <div id="home-upcoming">
              <TaskRows ctx={ctx} tasks={h.upcoming.slice(0, 7)} empty="No dated obligations in the next 45 days." />
            </div>
          </section>
          <section className="section-card">
            <div className="section-head">
              <h2>Waiting</h2>
              <div className="section-head-actions">
                <span>Submitted / regulator response</span>
                <button type="button" className="section-link" data-view-all="waiting" onClick={() => viewAll("waiting")}>
                  View all →
                </button>
              </div>
            </div>
            <div id="home-waiting">
              <TaskRows ctx={ctx} tasks={h.waiting.slice(0, 5)} empty="Nothing is currently waiting on a regulator response." />
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="section-card">
            <div className="section-head">
              <h2>Quick actions</h2>
            </div>
            <div className="quick-grid">
              <button type="button" className="quick-btn" id="qa-event" onClick={() => ctx.openDrawer({ kind: "event" })}>
                Report a change or event<span>Outage, director change, outsourcing, branch, fee change and more.</span>
              </button>
              <button type="button" className="quick-btn" id="qa-regulator" onClick={() => ctx.openDrawer({ kind: "regulator" })}>
                Add BoU request or instruction
                <span>Track an exact directive, inspection item or information request.</span>
              </button>
              <button type="button" className="quick-btn" id="qa-evidence" onClick={() => ctx.openDrawer({ kind: "addEvidence" })}>
                Add evidence<span>Link a receipt, approval, report or control record to the right obligation.</span>
              </button>
              <button type="button" className="quick-btn" id="qa-expert" onClick={() => ctx.openDrawer({ kind: "expert", contextId: null })}>
                Ask an expert<span>Get help with an obligation or request a compliance review.</span>
              </button>
            </div>
          </section>
          <section className="section-card">
            <div className="section-head">
              <h2>Controls to review</h2>
              <div className="section-head-actions">
                <span id="controls-count">{controls.length ? `${controls.length} to review` : "Current"}</span>
                <button type="button" className="section-link" data-view-all="controls" onClick={() => viewAll("controls")}>
                  View all →
                </button>
              </div>
            </div>
            <div id="home-controls">
              {controls.length ? (
                controls.map((id) => (
                  <div className="attention-row" key={id} data-control={id} {...activate(() => ctx.openDrawer({ kind: "work", id, taskKey: null }))}>
                    <span className="dot"></span>
                    <div>
                      <div className="attention-title">
                        {BY_ID[id].requirement} <InfoBtn ctx={ctx} id={id} label={BY_ID[id].requirement} />
                      </div>
                      <div className="attention-sub">{BY_ID[id].when}</div>
                    </div>
                    <div className="attention-meta">
                      <strong>Review</strong>
                      <span>Evidence</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">The priority controls you have reviewed are current.</div>
              )}
            </div>
          </section>
          <section className="section-card">
            <div className="profile-mini">
              <strong id="mini-profile-title">Compliance profile</strong>
              <p id="mini-profile-copy">
                {profileText(state.profile)}. {applicableEntries(state.profile).length} validated obligations/controls currently apply under this
                profile.
              </p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

const OB_CHIPS: [ObFilter, string][] = [
  ["all", "All"],
  ["reporting", "Reporting"],
  ["approvals", "Approvals & notices"],
  ["controls", "Controls"],
  ["consumer", "Consumer"],
  ["agents", "Agents"],
];

export function ObligationsPanel({ ctx }: { ctx: PcCtx }) {
  const { state, tasks } = ctx;
  const entries = filterObligations(state, tasks, ctx.obFilter, ctx.obStateFilter, ctx.obQuery);
  const sf: ObStateFilter = ctx.obStateFilter;
  const suffix = sf !== "all" ? ` · filtered by ${sf === "confirm" ? "needs confirmation/evidence" : sf}` : "";
  let last = "";
  const rows: ReactNode[] = [];
  entries.forEach((e) => {
    const st = currentStateForEntry(e, tasks, state);
    const grp = operationalGroup(e);
    if (grp !== last) rows.push(<div className="group-label" key={`g-${grp}`}>{grp}</div>);
    last = grp;
    rows.push(
      <div className="obligation-row" key={e.id}>
        <div>
          <div className="ob-title">
            {e.requirement} <InfoBtn ctx={ctx} id={e.id} label={e.requirement} />
          </div>
          <div className="ob-sub">{e.applies}</div>
        </div>
        <div>
          <div className="ob-meta-label">When</div>
          <div className="ob-meta-value">{e.when}</div>
        </div>
        <div>
          <span className={`state ${stateClass(st)}`}>{statusLabel(st)}</span>
        </div>
        <button
          type="button"
          className="btn small"
          data-work={e.id}
          onClick={() => {
            const task = tasks.find((t) => t.id === e.id && t.state !== "complete");
            ctx.openDrawer({ kind: "work", id: e.id, taskKey: task?.key || null });
          }}
        >
          {e.cta || "Open"}
        </button>
      </div>,
    );
  });
  return (
    <section className="panel active" id="panel-obligations">
      <div className="page-head">
        <div>
          <p className="eyebrow">Your compliance universe</p>
          <h1>Obligations</h1>
          <p>Only obligations that apply to your current licence and operating profile are shown.</p>
        </div>
        <div className="date-note" id="obligation-count">
          {entries.length} shown · {applicableEntries(state.profile).length} applicable{suffix}
        </div>
      </div>
      <div className="toolbar">
        <input
          className="search"
          id="ob-search"
          type="search"
          placeholder="Search obligations…"
          aria-label="Search obligations"
          value={ctx.obQuery}
          onChange={(e) => ctx.setObQuery(e.target.value)}
        />
        <div className="chips" id="ob-chips">
          {OB_CHIPS.map(([f, label]) => (
            <button
              type="button"
              key={f}
              className={`chip${ctx.obFilter === f ? " active" : ""}`}
              data-filter={f}
              aria-pressed={ctx.obFilter === f}
              onClick={() => {
                ctx.setObFilter(f);
                ctx.setObStateFilter("all");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="obligation-list" id="obligation-list">
        {rows.length ? rows : <div className="empty">No obligations match this filter.</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const CAL_CHIPS: [CalFilter, string][] = [
  ["all", "All"],
  ["attention", "Needs attention"],
  ["upcoming", "Upcoming"],
  ["complete", "Complete"],
];

export function CalendarPanel({ ctx }: { ctx: PcCtx }) {
  const list = filterCalendar(ctx.tasks, ctx.calFilter, ctx.calQuery);
  return (
    <section className="panel active" id="panel-calendar">
      <div className="page-head">
        <div>
          <p className="eyebrow">Generated from the rules</p>
          <h1>Calendar</h1>
          <p>Legal deadlines and internal review dates are labelled separately. Event-driven items appear only after the event is logged.</p>
        </div>
      </div>
      <div className="toolbar">
        <input
          className="search"
          id="cal-search"
          type="search"
          placeholder="Search calendar…"
          aria-label="Search calendar"
          value={ctx.calQuery}
          onChange={(e) => ctx.setCalQuery(e.target.value)}
        />
        <div className="chips" id="cal-chips">
          {CAL_CHIPS.map(([f, label]) => (
            <button
              type="button"
              key={f}
              className={`chip${ctx.calFilter === f ? " active" : ""}`}
              data-filter={f}
              aria-pressed={ctx.calFilter === f}
              onClick={() => ctx.setCalFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="calendar-list" id="calendar-list">
        {list.length ? (
          list.map((t) => {
            const e = BY_ID[t.id];
            return (
              <div className="calendar-row" key={t.key} data-task={t.key} {...activate(() => ctx.openDrawer({ kind: "work", id: t.id, taskKey: t.key }))}>
                <div className="cal-date">
                  {t.dueDateTime ? fmtDateTime(t.dueDateTime) : fmtShort(t.due)}
                  <span>{t.dateType}</span>
                </div>
                <div>
                  <div className="ob-title">
                    {e.requirement} <InfoBtn ctx={ctx} id={e.id} label={e.requirement} />
                  </div>
                  <div className="ob-sub">{t.period}</div>
                </div>
                <div>
                  <div className="ob-meta-label">Timing rule</div>
                  <div className="ob-meta-value">{e.when}</div>
                </div>
                <span className={`state ${stateClass(t.state)}`}>{statusLabel(t.state)}</span>
              </div>
            );
          })
        ) : (
          <div className="empty">No calendar items match this view.</div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export function EvidencePanel({ ctx }: { ctx: PcCtx }) {
  const { state, tasks } = ctx;
  const rows = state.evidence.slice().reverse();
  return (
    <section className="panel active" id="panel-evidence">
      <div className="page-head">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h1>Evidence</h1>
          <p>Every file or record should be linked to the obligation, reporting period, event or control review it supports.</p>
        </div>
        <button type="button" className="btn" id="evidence-add-top" onClick={() => ctx.openDrawer({ kind: "addEvidence" })}>
          Add evidence
        </button>
      </div>
      <div className="evidence-list" id="evidence-list">
        {rows.length ? (
          rows.map((v) => {
            const task = v.taskKey ? tasks.find((t) => t.key === v.taskKey) : null;
            const ob = BY_ID[v.obligationId];
            return (
              <div className="evidence-row" key={v.uid}>
                <div>
                  <div className="ev-title">
                    {v.file ? (
                      <button type="button" className="file-link" title="Open file" onClick={() => ctx.openEvidenceFile(v.file!)}>
                        {v.name}
                      </button>
                    ) : (
                      v.name
                    )}{" "}
                    <InfoBtn ctx={ctx} id={v.obligationId} label={ob?.requirement || v.name} />
                  </div>
                  <div className="ev-sub">
                    {ob?.requirement || "General compliance record"}
                    {task ? ` · ${task.period}` : " · General obligation evidence"}
                  </div>
                </div>
                <div>{v.type}</div>
                <div>{fmtDateLike(v.added)}</div>
                <button
                  type="button"
                  className="btn small"
                  data-ev-open={v.taskKey || ""}
                  onClick={() => ctx.openDrawer({ kind: "work", id: v.obligationId, taskKey: v.taskKey || null })}
                >
                  {task ? "Open task" : "Open obligation"}
                </button>
              </div>
            );
          })
        ) : (
          <div className="empty">
            No evidence recorded yet. Add a receipt, approval, report or control record and link it to the obligation and, where relevant,
            the specific reporting period or event it supports.
          </div>
        )}
      </div>
    </section>
  );
}

/** Evidence dates are stored as ISO; tolerate legacy display strings. */
export function fmtDateLike(v: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtDate(v) : v;
}
