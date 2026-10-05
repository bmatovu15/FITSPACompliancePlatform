"use client";

import { useEffect, useRef, useState } from "react";
import {
  BY_ID,
  EVENT_TYPES,
  advanceWork,
  applicableEntries,
  completionEvidenceSatisfied,
  evidenceFor,
  evidenceTypeOptions,
  eventActions,
  fmtDate,
  fmtDateTime,
  hoursRemaining,
  isEmi,
  neededEvidenceWording,
  nextStepLabel,
  occurrenceOptionsFor,
  profileText,
  statusLabel,
  taskTiming,
  workflowFor,
  workflowStage,
  type EventDraft,
  type EvidenceRecord,
} from "@/lib/comply/payments-engine";
import type { DrawerView, PcCtx } from "./pc-types";
import { fmtDateLike } from "./pc-app";

function Alert({ msg }: { msg: string }) {
  return msg ? (
    <div className="inline-alert" role="alert">
      {msg}
    </div>
  ) : null;
}

function EvidenceName({ ctx, v }: { ctx: PcCtx; v: EvidenceRecord }) {
  return v.file ? (
    <button type="button" className="file-link" title="Open file" onClick={() => ctx.openEvidenceFile(v.file!)}>
      <strong>{v.name}</strong>
    </button>
  ) : (
    <strong>{v.name}</strong>
  );
}

// ---------------------------------------------------------------------------
// Guidance
// ---------------------------------------------------------------------------

export function GuideDrawer({ id }: { id: string }) {
  const e = BY_ID[id];
  if (!e) return null;
  return (
    <>
      <div className="guide-source">
        <strong>Source</strong>
        <br />
        {e.source}
      </div>
      <div className="guide-block">
        <h3>What this means</h3>
        <p>{e.meaning}</p>
      </div>
      <div className="guide-block">
        <h3>What you need to do</h3>
        <p>{e.what_do}</p>
      </div>
      <div className="guide-block">
        <h3>When you need to do it</h3>
        <p>{e.when}</p>
      </div>
      <div className="guide-block">
        <h3>What you need to keep / provide</h3>
        <p>{e.evidence}</p>
      </div>
      <div className="guide-block">
        <h3>What happens next</h3>
        <p>{e.next}</p>
      </div>
      <div className="source-links">
        {(e.links || []).map((l, i) => (
          <a key={i} className="source-link" href={l[1]} target="_blank" rel="noopener noreferrer">
            {l[0]} ↗
          </a>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

export function WorkDrawer({ ctx, id, taskKey }: { ctx: PcCtx; id: string; taskKey: string | null }) {
  const e = BY_ID[id];
  const { state, tasks, clock } = ctx;
  const task = taskKey ? (tasks.find((x) => x.key === taskKey) ?? null) : null;
  const options = e ? evidenceTypeOptions(e) : [];
  const [evType, setEvType] = useState(options[0] || "");
  const [formKey, setFormKey] = useState(0);
  const [alertMsg, setAlertMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!e) return null;

  const steps = workflowFor(e);
  const stage = workflowStage(task, e, state);
  const evidence = evidenceFor(state, task, e);
  const timing = task ? taskTiming(task, clock) : e.when;
  const current = task ? state.taskStates[task.key]?.state || task.state : state.controlStates[id]?.state || "controlreview";
  const history = tasks.filter((t) => t.id === id).sort((a, b) => (b.due || "").localeCompare(a.due || ""));

  const addEvidence = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setAlertMsg("Choose a file first.");
      return;
    }
    setAlertMsg("");
    setBusy(true);
    const res = await ctx.adapter.uploadEvidence(f);
    setBusy(false);
    if (!res.ok) {
      setAlertMsg(`Could not upload ${f.name}: ${res.error}`);
      return;
    }
    ctx.update((s) => ({
      ...s,
      evidence: [
        ...s.evidence,
        { uid: Date.now(), name: f.name, type: evType, obligationId: id, taskKey: taskKey || "", added: clock.todayISO, file: res.file },
      ],
    }));
    setFormKey((k) => k + 1);
    setEvType(options[0] || "");
  };

  const next = () => {
    if (stage >= 2 && !completionEvidenceSatisfied(state, task, e)) {
      setAlertMsg(`Add ${neededEvidenceWording(e)} before closing this workflow.`);
      return;
    }
    setAlertMsg("");
    ctx.update((s) => advanceWork(s, task, e, stage + 1, clock));
  };

  return (
    <>
      <div className="workflow-card">
        <div className="workflow-top">
          <h3>{task ? task.period : "Current obligation"}</h3>
          <p>{timing}</p>
          {task?.dueDateTime ? <div className="deadline-clock">{hoursRemaining(task.dueDateTime, clock)}</div> : null}
        </div>
        <div className="steps">
          {steps.map((s, i) => {
            const done = i < stage || stage >= 3;
            const active = !done && i === stage;
            return (
              <div className={`step-row ${done ? "done" : active ? "active" : ""}`} key={i}>
                <span className="step-mark">{done ? "✓" : i + 1}</span>
                <div>
                  <b>{s}</b>
                  <span>{active ? "Current step" : done ? "Completed" : "Not started"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="work-actions">
        <button type="button" className="btn small" id="work-guide" onClick={() => ctx.openDrawer({ kind: "guide", id }, { kind: "work", id, taskKey })}>
          View guidance i
        </button>
        {stage < 3 ? (
          <button type="button" className="btn primary small" id="work-next" onClick={next}>
            {nextStepLabel(e, stage)}
          </button>
        ) : (
          <button type="button" className="btn small" disabled>
            {current === "current" ? "Current evidence on file" : "Workflow complete"}
          </button>
        )}
      </div>
      <Alert msg={alertMsg} />
      <div className="evidence-form" key={formKey}>
        <p className="eyebrow">Evidence</p>
        {evidence.length ? (
          evidence.map((v) => (
            <div className="success-box" key={v.uid}>
              <EvidenceName ctx={ctx} v={v} />
              <br />
              {v.type} · added {fmtDateLike(v.added)}
            </div>
          ))
        ) : (
          <p className="helper">
            No evidence recorded yet. FITSPA Compliance Platform will not treat evidence-dependent completion as satisfied just because a status button was
            clicked.
          </p>
        )}
        <div className="field-row">
          <div className="field">
            <label htmlFor="work-evidence-type">Evidence type</label>
            <select id="work-evidence-type" value={evType} onChange={(ev) => setEvType(ev.target.value)}>
              {options.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="work-file">File or record</label>
            <input type="file" id="work-file" ref={fileRef} onChange={() => setAlertMsg("")} />
          </div>
        </div>
        <div className="work-actions">
          <button type="button" className="btn small" id="work-add-evidence" disabled={busy} onClick={addEvidence}>
            {busy ? "Uploading…" : "Add evidence"}
          </button>
        </div>
      </div>
      {history.length >= 2 && (
        <div className="occurrence-history">
          <h3>Occurrence history</h3>
          {history.map((t) => (
            <div className="occurrence-item" key={t.key}>
              <div>
                <b>{t.period}</b>
                <span>{taskTiming(t, clock)}</span>
              </div>
              <button
                type="button"
                className="btn small"
                data-open-occurrence={t.key}
                onClick={() => ctx.openDrawer({ kind: "work", id, taskKey: t.key })}
              >
                {t.key === taskKey ? "Current" : "Open"} · {statusLabel(t.state)}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add evidence
// ---------------------------------------------------------------------------

export function AddEvidenceDrawer({ ctx }: { ctx: PcCtx }) {
  const { state, tasks, clock } = ctx;
  const entries = applicableEntries(state.profile);
  const [obId, setObId] = useState(entries[0]?.id || "");
  const occ = obId ? occurrenceOptionsFor(obId, tasks) : [];
  const [occKey, setOccKey] = useState<string | null>(null);
  const types = obId ? evidenceTypeOptions(BY_ID[obId]) : [];
  const [type, setType] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const occValue = occKey !== null && occ.some((o) => o.value === occKey) ? occKey : (occ[0]?.value ?? "");
  const typeValue = type !== null && types.includes(type) ? type : types[0] || "";

  const save = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setAlertMsg("Choose a file first.");
      return;
    }
    setAlertMsg("");
    setBusy(true);
    const res = await ctx.adapter.uploadEvidence(f);
    setBusy(false);
    if (!res.ok) {
      setAlertMsg(`Could not upload ${f.name}: ${res.error}`);
      return;
    }
    ctx.update((s) => ({
      ...s,
      evidence: [
        ...s.evidence,
        { uid: Date.now(), name: f.name, type: typeValue, obligationId: obId, taskKey: occValue, added: clock.todayISO, file: res.file },
      ],
    }));
    ctx.closeDrawer();
    ctx.goTab("evidence");
  };

  return (
    <>
      <div className="field">
        <label htmlFor="ev-obligation">Obligation</label>
        <select
          id="ev-obligation"
          value={obId}
          onChange={(e) => {
            setObId(e.target.value);
            setOccKey(null);
            setType(null);
            setAlertMsg("");
          }}
        >
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.requirement}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ev-occurrence">Reporting period / event / control review</label>
        <select id="ev-occurrence" value={occValue} onChange={(e) => { setOccKey(e.target.value); setAlertMsg(""); }}>
          {occ.map((o) => (
            <option key={o.value || "general"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="ev-type">Evidence type</label>
          <select id="ev-type" value={typeValue} onChange={(e) => { setType(e.target.value); setAlertMsg(""); }}>
            {types.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ev-file">File</label>
          <input type="file" id="ev-file" ref={fileRef} onChange={() => setAlertMsg("")} />
        </div>
      </div>
      <Alert msg={alertMsg} />
      <div className="work-actions">
        <button type="button" className="btn primary" id="save-evidence" disabled={busy} onClick={save}>
          {busy ? "Uploading…" : "Add evidence"}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Report change or event
// ---------------------------------------------------------------------------

export function EventDrawer({ ctx }: { ctx: PcCtx }) {
  const { state, clock } = ctx;
  const [draft, setDraft] = useState<EventDraft>({ uid: null, type: "", date: "", time: "", label: "" });
  const actions = draft.type && draft.type !== "other" ? eventActions(draft, state.profile, clock) : [];
  const recent = state.events.slice().reverse().slice(0, 5);
  const timed = ["outage", "insolvency"].includes(draft.type);

  const create = () => {
    const type = EVENT_TYPES.find((x) => x.key === draft.type);
    if (!type) return;
    const uid = draft.uid || Date.now();
    const record = {
      uid,
      type: draft.type,
      label: draft.label || type.title,
      date: draft.date,
      time: draft.time,
      actions: eventActions(draft, state.profile, clock),
    };
    ctx.update((s) => {
      const ix = s.events.findIndex((x) => x.uid === uid);
      const events = s.events.slice();
      if (ix >= 0) events[ix] = record;
      else events.push(record);
      // Tasks are keyed by obligation id, so re-generating an event keeps the progress of actions that still apply.
      return { ...s, events };
    });
    ctx.closeDrawer();
    ctx.goTab("home");
  };

  return (
    <>
      <div className="event-grid">
        {EVENT_TYPES.map((x) => (
          <button
            type="button"
            key={x.key}
            className={`event-card ${draft.type === x.key ? "selected" : ""}`}
            data-event={x.key}
            aria-pressed={draft.type === x.key}
            onClick={() => setDraft((d) => ({ ...d, type: x.key, date: clock.todayISO }))}
          >
            <strong>{x.title}</strong>
            <span>{x.hint}</span>
          </button>
        ))}
      </div>
      {draft.type === "other" ? (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="event-other-text">Describe the change or issue</label>
            <textarea id="event-other-text" placeholder="Describe what happened or what you are planning." />
          </div>
          <div className="work-actions">
            <button type="button" className="btn primary" id="event-other-expert" onClick={() => ctx.openDrawer({ kind: "question", contextId: null }, { kind: "expert", contextId: null })}>
              Ask an expert
            </button>
          </div>
        </>
      ) : draft.type ? (
        <>
          <div className="field-row">
            <div className="field">
              <label htmlFor="event-date">{timed ? "Occurrence / service date" : "Planned / effective date"}</label>
              <input type="date" id="event-date" value={draft.date || clock.todayISO} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor={timed ? "event-time" : "event-label"}>{timed ? "Time" : "Short label"}</label>
              {timed ? (
                <input type="time" id="event-time" value={draft.time || "09:00"} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} />
              ) : (
                <input
                  id="event-label"
                  value={draft.label}
                  placeholder="Optional description"
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                />
              )}
            </div>
          </div>
          <div className="consequence">
            <h3>
              FITSPA Compliance Platform will create {actions.length} compliance action{actions.length === 1 ? "" : "s"}
            </h3>
            {actions.length ? (
              actions.map((a) => (
                <div className="consequence-item" key={a.id}>
                  <b>{BY_ID[a.id].requirement}</b>
                  <span>
                    {a.timing || BY_ID[a.id].when}
                    {a.dueDateTime ? ` · ${a.dateType} ${fmtDateTime(a.dueDateTime)}` : a.due ? ` · ${a.dateType} ${fmtDate(a.due)}` : ""}
                  </span>
                </div>
              ))
            ) : (
              <div className="notice">
                No validated action is generated for this profile. Check the licence/profile or ask an expert before proceeding.
              </div>
            )}
          </div>
          <div className="work-actions">
            <button type="button" className="btn primary" id="create-event-actions" disabled={!actions.length} onClick={create}>
              {draft.uid ? "Update compliance actions" : "Create compliance actions"}
            </button>
          </div>
        </>
      ) : null}
      {!draft.type && recent.length ? (
        <div className="event-history">
          <p className="eyebrow">Recent changes & events</p>
          {recent.map((ev) => (
            <div className="event-history-item" key={ev.uid}>
              <div>
                <b>{ev.label}</b>
                <span>
                  {ev.date || ""} · {(ev.actions || []).length} compliance action{(ev.actions || []).length === 1 ? "" : "s"}
                </span>
              </div>
              <button
                type="button"
                className="btn small"
                data-edit-event={ev.uid}
                onClick={() => setDraft({ uid: ev.uid, type: ev.type, date: ev.date, time: ev.time || "", label: ev.label || "" })}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// BoU request / instruction
// ---------------------------------------------------------------------------

export function RegulatorDrawer({ ctx }: { ctx: PcCtx }) {
  const [title, setTitle] = useState("");
  const [received, setReceived] = useState(ctx.clock.todayISO);
  const [due, setDue] = useState("");
  const [details, setDetails] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const save = () => {
    const t = title.trim();
    if (!t || !due) {
      setAlertMsg("Add the required action and the deadline.");
      return;
    }
    ctx.update((s) => ({ ...s, regulatorTasks: [...s.regulatorTasks, { uid: Date.now(), title: t, due, received, details: details.trim() }] }));
    ctx.closeDrawer();
    ctx.goTab("home");
  };
  return (
    <>
      <div className="notice">
        Use this for a licence condition, directive, inspection finding or information request where BoU specifies the action or deadline.
        FITSPA Compliance Platform should not invent the requirement.
      </div>
      <div className="field">
        <label htmlFor="reg-title">Title / required action</label>
        <input id="reg-title" placeholder="e.g. Submit response to inspection finding" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="reg-received">Received date</label>
          <input type="date" id="reg-received" value={received} onChange={(e) => setReceived(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="reg-due">BoU deadline</label>
          <input type="date" id="reg-due" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="reg-details">Instruction details</label>
        <textarea
          id="reg-details"
          placeholder="Capture the instruction exactly enough for the team to act on it."
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>
      <Alert msg={alertMsg} />
      <div className="work-actions">
        <button type="button" className="btn primary" id="save-regulator" onClick={save}>
          Create task
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Expert Support
// ---------------------------------------------------------------------------

export function ExpertDrawer({ ctx, contextId }: { ctx: PcCtx; contextId: string | null }) {
  const { state } = ctx;
  const context = contextId && BY_ID[contextId] ? BY_ID[contextId].requirement : "your compliance workspace";
  const review = state.review;
  const history = state.inquiries.slice().reverse().slice(0, 5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const requestReview = async () => {
    const scope = contextId ? context : "Current compliance workspace";
    setBusy(true);
    setErr("");
    const res = await ctx.adapter.sendExpertRequest({
      kind: "compliance_review",
      message: `Compliance review requested. Scope: ${scope}. Profile: ${profileText(state.profile)}.`,
      contextKey: contextId || "workspace",
      contextLabel: contextId ? context : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(`Your review request could not be sent: ${res.error || "please try again"}`);
      return;
    }
    ctx.update((s) => ({ ...s, review: { date: ctx.clock.todayISO, scope } }));
  };

  return (
    <>
      <div className="support-option">
        <h3>Ask a question</h3>
        <p>Ask about {context}. FITSPA Compliance Platform keeps the question linked to the current compliance context.</p>
        <button type="button" className="btn small" id="expert-question" onClick={() => ctx.openDrawer({ kind: "question", contextId }, { kind: "expert", contextId })}>
          Ask a question
        </button>
      </div>
      <div className="support-option">
        <h3>Request compliance review</h3>
        <p>Have an expert review the compliance position and evidence currently available. This can be requested at any stage.</p>
        {review ? (
          <div className="success-box">
            <strong>Review requested</strong>
            <br />
            {fmtDateLike(review.date)} · {review.scope}
          </div>
        ) : (
          <button type="button" className="btn small" id="expert-review" disabled={busy} onClick={requestReview}>
            {busy ? "Sending…" : "Request review"}
          </button>
        )}
        <Alert msg={err} />
      </div>
      {history.length ? (
        <div className="event-history">
          <p className="eyebrow">Recent inquiries</p>
          {history.map((q) => (
            <div className="event-history-item" key={q.uid}>
              <div>
                <b>
                  {q.text.slice(0, 80)}
                  {q.text.length > 80 ? "…" : ""}
                </b>
                <span>
                  {fmtDateLike(q.date)}
                  {q.contextId && BY_ID[q.contextId] ? ` · ${BY_ID[q.contextId].requirement}` : ""}
                </span>
              </div>
              <span className="state waiting">Sent</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function QuestionDrawer({ ctx, contextId }: { ctx: PcCtx; contextId: string | null }) {
  const [text, setText] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t) {
      setAlertMsg("Enter your question.");
      return;
    }
    setAlertMsg("");
    setBusy(true);
    const res = await ctx.adapter.sendExpertRequest({
      kind: "question",
      message: t,
      contextKey: contextId || "workspace",
      contextLabel: contextId && BY_ID[contextId] ? BY_ID[contextId].requirement : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setAlertMsg(`Your inquiry could not be sent: ${res.error || "please try again"}`);
      return;
    }
    ctx.update((s) => ({
      ...s,
      inquiries: [...s.inquiries, { uid: Date.now(), text: t, contextId: contextId || "", date: ctx.clock.todayISO }],
    }));
    ctx.openDrawer({ kind: "sent", contextId }, { kind: "expert", contextId });
  };
  return (
    <>
      <p className="helper">
        {contextId && BY_ID[contextId]
          ? `Context: ${BY_ID[contextId].requirement}`
          : "Your current payments-compliance profile and workspace will be available to the expert."}
      </p>
      <div className="field">
        <label htmlFor="expert-text">Your question</label>
        <textarea id="expert-text" placeholder="What do you need help with?" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Alert msg={alertMsg} />
      <div className="work-actions">
        <button type="button" className="btn primary" id="send-question" disabled={busy} onClick={send}>
          {busy ? "Sending…" : "Send inquiry"}
        </button>
      </div>
    </>
  );
}

export function SentDrawer({ contextId }: { contextId: string | null }) {
  return (
    <div className="success-box">
      <strong>Your inquiry has been captured.</strong>
      <br />
      {contextId ? "It remains linked to this obligation." : "The expert can use your current compliance profile and workspace context."}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance profile
// ---------------------------------------------------------------------------

export function ProfileDrawer({ ctx }: { ctx: PcCtx }) {
  const p = ctx.state.profile;
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <div className="guide-block">
        <h3>Licence profile</h3>
        <p>{profileText(p)}</p>
      </div>
      <div className="guide-block">
        <h3>Operating facts</h3>
        <p>
          Agents: {p.agents ? "Yes" : "No"} · Stored-value/prepaid cards: {p.cards ? "Yes" : "No"} · Payment-system participant:{" "}
          {p.participant ? "Yes" : "No"}
          {isEmi(p) ? ` · Safeguarding: ${p.safeguard || "—"} · FI/MDI: ${p.fiMdi ? "Yes" : "No"}` : ""}
        </p>
      </div>
      <div className="notice">
        Changing the profile can add or remove obligations. In production FITSPA Compliance Platform should show an impact preview before applying the change.
      </div>
      <div className="work-actions">
        <button
          type="button"
          className="btn"
          id="edit-profile-drawer"
          onClick={() => {
            ctx.setSetupOrigin("app");
            ctx.closeDrawer();
            ctx.setScreen("licence");
          }}
        >
          Edit profile
        </button>
        <button type="button" className="btn danger" id="reset-prototype" onClick={() => setConfirming(true)}>
          Reset prototype
        </button>
      </div>
      {confirming && (
        <div className="confirm-box" role="alertdialog" aria-label="Confirm reset">
          Clear this prototype workspace and start again?
          <div className="work-actions">
            <button type="button" className="btn danger small" id="reset-confirm" onClick={() => ctx.resetWorkspace()}>
              Yes, clear it
            </button>
            <button type="button" className="btn small" id="reset-cancel" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Drawer shell
// ---------------------------------------------------------------------------

export function drawerMeta(view: DrawerView | null): { kicker: string; title: string } {
  if (!view) return { kicker: "", title: "" };
  switch (view.kind) {
    case "guide":
      return { kicker: "Guidance", title: BY_ID[view.id]?.requirement || "" };
    case "work":
      return { kicker: "Work", title: BY_ID[view.id]?.requirement || "" };
    case "addEvidence":
      return { kicker: "Evidence", title: "Add compliance evidence" };
    case "event":
      return { kicker: "Change or event", title: "What happened — or what are you planning?" };
    case "regulator":
      return { kicker: "BoU request / instruction", title: "Track an exact regulator-set action" };
    case "expert":
      return { kicker: "Expert Support", title: "Get expert help" };
    case "question":
      return { kicker: "Expert Support", title: "Ask an expert" };
    case "sent":
      return { kicker: "Expert Support", title: "Inquiry sent" };
    case "profile":
      return { kicker: "Compliance profile", title: "What FITSPA Compliance Platform is using" };
  }
}

export function viewKey(v: DrawerView | null): string {
  if (!v) return "none";
  switch (v.kind) {
    case "guide":
      return `guide-${v.id}`;
    case "work":
      return `work-${v.id}-${v.taskKey}`;
    case "expert":
    case "question":
    case "sent":
      return `${v.kind}-${v.contextId}`;
    default:
      return v.kind;
  }
}

export function DrawerBody({ ctx, view }: { ctx: PcCtx; view: DrawerView | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = viewKey(view);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [key]);
  let body = null;
  if (view) {
    switch (view.kind) {
      case "guide":
        body = <GuideDrawer id={view.id} />;
        break;
      case "work":
        body = <WorkDrawer key={key} ctx={ctx} id={view.id} taskKey={view.taskKey} />;
        break;
      case "addEvidence":
        body = <AddEvidenceDrawer key={key} ctx={ctx} />;
        break;
      case "event":
        body = <EventDrawer key={key} ctx={ctx} />;
        break;
      case "regulator":
        body = <RegulatorDrawer key={key} ctx={ctx} />;
        break;
      case "expert":
        body = <ExpertDrawer key={key} ctx={ctx} contextId={view.contextId} />;
        break;
      case "question":
        body = <QuestionDrawer key={key} ctx={ctx} contextId={view.contextId} />;
        break;
      case "sent":
        body = <SentDrawer contextId={view.contextId} />;
        break;
      case "profile":
        body = <ProfileDrawer key={key} ctx={ctx} />;
        break;
    }
  }
  return (
    <div className="drawer-body" id="drawer-body" ref={ref}>
      {body}
    </div>
  );
}
