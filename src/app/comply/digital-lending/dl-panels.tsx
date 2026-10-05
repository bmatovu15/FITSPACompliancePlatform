"use client";

import {
  CONTROL_AREAS,
  DOMAIN_LABELS,
  FITSPA,
  addYears,
  badgeClass,
  controlIds,
  controlLabel,
  controlStatus,
  feeLabel,
  fmt,
  getOb,
  legalDueText,
  monthKey,
  obligations,
  occurrenceState,
  parseDate,
  priorityOccurrences,
  profileWarningText,
  routeName,
  summary,
  type ControlArea,
  type Occurrence,
} from "@/lib/comply/digital-engine";
import { Info, useApp } from "./dl-shared";

// ---------------------------------------------------------------------------
// shared row pieces
// ---------------------------------------------------------------------------

function WorkRows({ rows, empty }: { rows: Occurrence[]; empty: string }) {
  const { openDrawer } = useApp();
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="work-list">
      {rows.map((o) => (
        <div className="work-row" key={o.uid}>
          <div>
            <div className="work-title-line">
              <span className="work-title">{o.title}</span>
              <Info attr={{ "data-occ-info": o.uid }} onClick={() => (o.ids || [])[0] && openDrawer({ kind: "guide", id: o.ids[0] })} />
            </div>
            <div className="work-sub">
              {(o.ids || [])
                .map((id) => getOb(id)?.Obligation)
                .filter(Boolean)
                .slice(0, 2)
                .join(" · ")}
            </div>
            {o.fee ? (
              <div className="fee-line">
                Regulatory fee: <strong>{feeLabel(o.fee)}</strong>
              </div>
            ) : null}
            {o.internalTarget ? <div className="internal">Internal target: {fmt(o.internalTarget)}</div> : null}
          </div>
          <div className="row-date">
            <strong>Legal / regulator due</strong>
            <br />
            {legalDueText(o)}
          </div>
          <div className="row-owner">{o.owner || "Unassigned"}</div>
          <button type="button" className="row-action" data-open-occ={o.uid} onClick={() => openDrawer({ kind: "occurrence", uid: o.uid })}>
            {o.action || "Open workflow"}
          </button>
        </div>
      ))}
    </div>
  );
}

function ControlCard({ c, i }: { c: ControlArea; i: number }) {
  const { state, openDrawer } = useApp();
  const label = controlLabel(controlStatus(state, i));
  return (
    <div className="control-card">
      <h3>
        {c.title}
        <Info attr={{ "data-control-info": String(i) }} onClick={() => openControlGuide(state, i, openDrawer)} />
      </h3>
      <p>{c.maintains}</p>
      <div className="control-bottom">
        <span className={`badge ${badgeClass(label)}`}>{label}</span>
        <button type="button" data-open-control={i} onClick={() => openDrawer({ kind: "control", idx: i })}>
          Review control
        </button>
      </div>
    </div>
  );
}

function openControlGuide(
  state: ReturnType<typeof useApp>["state"],
  i: number,
  openDrawer: ReturnType<typeof useApp>["openDrawer"],
) {
  const ids = controlIds(state, CONTROL_AREAS[i]);
  if (ids[0]) openDrawer({ kind: "guide", id: ids[0] });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function DashboardPanel() {
  const { state, clock, openDrawer } = useApp();
  const s = summary(state, clock);
  const all = priorityOccurrences(state, clock);
  const pri = all.slice(0, 5);
  const upcoming = all.filter((x) => occurrenceState(x, clock) === "Upcoming").slice(0, 5);
  const controls = CONTROL_AREAS.map((c, i) => ({ c, i, status: controlStatus(state, i), ids: controlIds(state, c) }))
    .filter((x) => x.ids.length && ["notreviewed", "attention"].includes(x.status))
    .slice(0, 3);
  const act = state.activities.slice(0, 6);
  const warn = profileWarningText(state);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>What needs action now, what is due next and which controls still need review.</p>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Action needed</div>
          <div className="metric-value">{s.action}</div>
          <div className="metric-note">Open work requiring action now</div>
        </div>
        <div className="metric">
          <div className="metric-label">Overdue</div>
          <div className="metric-value">{s.overdue}</div>
          <div className="metric-note">Legal / regulator due date passed</div>
        </div>
        <div className="metric">
          <div className="metric-label">Due next 30 days</div>
          <div className="metric-value">{s.due30}</div>
          <div className="metric-note">Known legal / regulator deadlines</div>
        </div>
        <div className="metric">
          <div className="metric-label">Controls to review</div>
          <div className="metric-value">{s.controls}</div>
          <div className="metric-note">Not reviewed or evidence/review needs action</div>
        </div>
      </div>
      {warn ? (
        <div className="note">
          <strong>Finish your profile.</strong> {warn} so FITSPA Compliance Platform can confirm which conditional obligations apply.{" "}
          <button type="button" className="textlink" id="profile-warning-link" onClick={() => openDrawer({ kind: "profile" })}>
            Open Profile &amp; registrations
          </button>
        </div>
      ) : null}
      <section className="section">
        <div className="section-head">
          <h2>Priority actions</h2>
          <p>Overdue first, then nearest due work.</p>
        </div>
        <WorkRows rows={pri} empty="No priority work right now." />
      </section>
      <section className="section">
        <div className="section-head">
          <h2>Upcoming</h2>
          <p>Next dated occurrences.</p>
        </div>
        <WorkRows rows={upcoming} empty="No upcoming dated occurrences." />
      </section>
      <section className="section">
        <div className="section-head">
          <h2>Controls to review</h2>
          <p>New controls start as Not reviewed; genuine gaps are labelled Needs attention.</p>
        </div>
        <div className="control-strip">
          {controls.length ? (
            controls.map((x) => <ControlCard key={x.i} c={x.c} i={x.i} />)
          ) : (
            <div className="empty">No controls currently need review.</div>
          )}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>Recent activity</h2>
        </div>
        {act.length ? (
          <div className="activity">
            {act.map((a, i) => (
              <div className="activity-row" key={i}>
                {a.text}
                <span>{new Date(a.date).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">Activity will appear here as you submit work, add evidence and close occurrences.</div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const CAL_FILTERS = ["all", "Upcoming", "Action needed", "Overdue", "Submitted", "Awaiting regulator", "Closed"];

export function CalendarPanel() {
  const { state, clock, patch, openDrawer } = useApp();
  const rows = (state.occurrences || [])
    .filter((o) => state.calendarFilter === "all" || occurrenceState(o, clock) === state.calendarFilter)
    .slice()
    .sort((a, b) => (a.legalDue || "9999").localeCompare(b.legalDue || "9999"));
  const groups: Record<string, Occurrence[]> = {};
  rows.forEach((o) => {
    const k = monthKey(o.legalDue);
    (groups[k] = groups[k] || []).push(o);
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p>Dated occurrences only. Legal and regulator due dates are primary; internal targets and regulatory fees are secondary.</p>
        </div>
        <button type="button" className="btn" id="add-reg-date" onClick={() => openDrawer({ kind: "regulator" })}>
          Add regulator-set due date
        </button>
      </div>
      <div className="calendar-toolbar">
        <div className="filters">
          {CAL_FILTERS.map((f) => (
            <button
              type="button"
              key={f}
              className={`filter ${state.calendarFilter === f ? "active" : ""}`}
              data-cal-filter={f}
              onClick={() => patch({ calendarFilter: f })}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>
      {Object.keys(groups).length ? (
        Object.entries(groups).map(([m, arr]) => (
          <div key={m}>
            <div className="cal-month">{m}</div>
            <div className="cal-list">
              {arr.map((o) => {
                const st = occurrenceState(o, clock);
                return (
                  <div className="cal-row" key={o.uid}>
                    <div className="cal-date">
                      {o.legalDue ? fmt(o.legalDue) : "No date"}
                      <span>Legal / regulator due</span>
                    </div>
                    <div>
                      <div className="work-title-line">
                        <span className="work-title">{o.title}</span>
                        <Info attr={{ "data-occ-info": o.uid }} onClick={() => (o.ids || [])[0] && openDrawer({ kind: "guide", id: o.ids[0] })} />
                      </div>
                      {o.fee ? (
                        <div className="fee-line">
                          Regulatory fee: <strong>{feeLabel(o.fee)}</strong>
                        </div>
                      ) : null}
                      {o.internalTarget ? <div className="internal">Internal target: {fmt(o.internalTarget)}</div> : null}
                    </div>
                    <span className={`badge ${badgeClass(st)}`}>{st}</span>
                    <button type="button" className="row-action" data-open-occ={o.uid} onClick={() => openDrawer({ kind: "occurrence", uid: o.uid })}>
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="empty">No dated work matches this view.</div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

export function ObligationsPanel() {
  const { state, clock, patch, openDrawer } = useApp();
  const applicable = obligations(state);
  const items = applicable.filter((o) => {
    const q = (state.obSearch || "").toLowerCase();
    let ok = !q || (o.Obligation + " " + o.ID + " " + o["Source / provision"]).toLowerCase().includes(q);
    if (state.obDomain !== "all") ok = ok && o.domain === state.obDomain;
    if (state.obBehaviour !== "all") ok = ok && o.Behaviour === state.obBehaviour;
    return ok;
  });
  const domains = [...new Set(applicable.map((o) => o.domain))].sort();
  const behaviours = [...new Set(applicable.map((o) => o.Behaviour))].sort();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Obligations</h1>
          <p>The complete applicable regulatory library. Use it to understand the rule and open any current occurrence or linked control.</p>
        </div>
      </div>
      <div className="lib-toolbar">
        <input id="ob-search" placeholder="Search obligations or source…" value={state.obSearch || ""} onChange={(e) => patch({ obSearch: e.target.value })} />
        <select id="ob-domain" value={state.obDomain} onChange={(e) => patch({ obDomain: e.target.value })}>
          <option value="all">All topics</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {DOMAIN_LABELS[d] || d}
            </option>
          ))}
        </select>
        <select id="ob-behaviour" value={state.obBehaviour} onChange={(e) => patch({ obBehaviour: e.target.value })}>
          <option value="all">All behaviours</option>
          {behaviours.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="work-list">
        {items.map((o) => {
          const active = (state.occurrences || []).filter((x) => (x.ids || []).includes(o.ID) && occurrenceState(x, clock) !== "Closed");
          return (
            <div className="ob-row" key={o.ID}>
              <div>
                <div className="work-title-line">
                  <span className="ob-id">{o.ID}</span>
                  <span className="work-title">{o.Obligation}</span>
                  <Info attr={{ "data-ob-info": o.ID }} onClick={() => openDrawer({ kind: "guide", id: o.ID })} />
                </div>
                <div className="work-sub">
                  {o.domainLabel} · {o["Applies to"]}
                  {active.length ? ` · ${active.length} active occurrence${active.length === 1 ? "" : "s"}` : ""}
                </div>
              </div>
              <div className="ob-clock">{o["Legal clock"]}</div>
              <div className="behaviour">{o.Behaviour}</div>
              <button type="button" className="row-action" data-ob-open={o.ID} onClick={() => openDrawer({ kind: "obligation", id: o.ID })}>
                Open
              </button>
            </div>
          );
        })}
      </div>
      {state.profile?.fitspa === "yes" ? (
        <section className="section">
          <div className="section-head">
            <h2>Optional industry layer — FITSPA Code</h2>
            <p>Industry commitments, clearly separated from statutory/regulatory obligations.</p>
          </div>
          <div className="work-list">
            {FITSPA.map((x) => (
              <div className="ob-row" key={x.ID}>
                <div>
                  <div className="work-title-line">
                    <span className="ob-id">{x.ID}</span>
                    <span className="work-title">{x["Industry obligation"]}</span>
                  </div>
                  <div className="work-sub">FITSPA Responsible Digital Lending Code</div>
                </div>
                <div className="ob-clock">{x["Code timing"]}</div>
                <div className="behaviour">Industry code</div>
                <button type="button" className="row-action" disabled>
                  Industry layer
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function ControlsPanel() {
  const { state, openDrawer } = useApp();
  const cs = CONTROL_AREAS.map((c, i) => ({ c, i, ids: controlIds(state, c) })).filter((x) => x.ids.length);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Controls</h1>
          <p>Continuous and transaction controls remain active over time. Review them, keep current evidence and record exceptions when something is wrong.</p>
        </div>
      </div>
      <div className="controls-grid">
        {cs.map((x) => {
          const cd = state.controls[x.i] || { evidence: [], exceptions: [] };
          const label = controlLabel(controlStatus(state, x.i));
          const nEv = (cd.evidence || []).length;
          const nEx = (cd.exceptions || []).filter((e) => !e.closed).length;
          return (
            <div className="big-control" key={x.i}>
              <h3>
                {x.c.title}
                <Info attr={{ "data-control-info": String(x.i) }} onClick={() => openControlGuide(state, x.i, openDrawer)} />
              </h3>
              <p>{x.c.maintains}</p>
              <div className="control-meta">
                <span>
                  {nEv} evidence item{nEv === 1 ? "" : "s"}
                </span>
                <span>
                  {nEx} open exception{nEx === 1 ? "" : "s"}
                </span>
                {cd.lastReview ? <span>Last review {fmt(cd.lastReview)}</span> : null}
              </div>
              <div className="control-actions">
                <span className={`badge ${badgeClass(label)}`}>{label}</span>
                <button type="button" className="row-action" data-open-control={x.i} onClick={() => openDrawer({ kind: "control", idx: x.i })}>
                  Review control
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Right rail
// ---------------------------------------------------------------------------

export function RightRail() {
  const { state, clock, openDrawer } = useApp();
  const pri = priorityOccurrences(state, clock)[0];
  const p = state.profile;
  const pdpo =
    p?.pdpoStatus === "yes"
      ? p.pdpo
        ? `PDPO expiry: ${fmt(p.pdpo)}`
        : "PDPO expiry: add date"
      : p?.pdpoStatus === "no"
        ? "PDPO: not registered"
        : "PDPO: status not confirmed";
  return (
    <>
      <section className="rail-card">
        <div className="rail-label">Next</div>
        <div className="rail-next">
          {pri ? (
            <>
              <strong>{pri.title}</strong>
              <br />
              {pri.legalDue ? `Legal / regulator due ${fmt(pri.legalDue)}` : "Action required"}
              {pri.fee ? (
                <>
                  <br />
                  Regulatory fee {feeLabel(pri.fee)}
                </>
              ) : null}
            </>
          ) : (
            "No open dated work."
          )}
        </div>
        {pri ? (
          <button type="button" className="rail-btn" id="rail-open-next" onClick={() => openDrawer({ kind: "occurrence", uid: pri.uid })}>
            Open workflow
          </button>
        ) : null}
        <button type="button" className="rail-btn primary" id="rail-log-event" onClick={() => openDrawer({ kind: "eventStart" })}>
          Log an event
        </button>
      </section>
      <section className="rail-card">
        <div className="rail-label">Expert Support</div>
        <div className="rail-next">Ask a question or request a compliance review with the current context attached.</div>
        {/* FIX: the prototype never bound this button; it opens Expert Support here. */}
        <button type="button" className="rail-btn" data-expert="workspace" onClick={() => openDrawer({ kind: "expert", ctx: { kind: "general" } })}>
          Ask Expert Support
        </button>
      </section>
      <section className="rail-card">
        <div className="rail-label">Profile &amp; registrations</div>
        <div className="rail-profile">
          <strong>{routeName(state)}</strong>
          <br />
          FCP effective: {p?.issue ? fmt(addYears(parseDate(p.issue) as Date, 1)) : "Add first-licence date"}
          <br />
          Current licence expiry: {fmt(new Date(clock.today.getFullYear(), 11, 31))}
          <br />
          {pdpo}
        </div>
        <button type="button" className="rail-btn" id="edit-profile" onClick={() => openDrawer({ kind: "profile" })}>
          Edit profile &amp; registrations
        </button>
      </section>
    </>
  );
}
