"use client";

import { useState } from "react";
import type { WorkspaceAdapter } from "@/lib/comply/workspace";
import {
  CONTROL_AREAS,
  EVENT_DEFS,
  EVENT_FIELD_LABELS,
  REGULATOR_OBLIGATIONS,
  addSupport,
  badgeClass,
  controlIds,
  controlLabel,
  controlStatus,
  costForObligation,
  createEvent,
  createRegulatorSet,
  eventApplicable,
  eventFee,
  eventFieldType,
  eventIds,
  expertContext,
  feeLabel,
  fmt,
  getOb,
  isPriorApproval,
  legalDueText,
  knownCosts,
  makeClock,
  occurrenceState,
  resolveException,
  saveControlReview,
  saveOccurrence,
  saveSettings,
  type Answer,
  type Fee,
  type FileRef,
  type OccurrenceMode,
  type SettingsForm,
} from "@/lib/comply/digital-engine";
import {
  InlineMessage,
  SavedFileList,
  SavedFileName,
  filePlaceholder,
  useApp,
} from "./dl-shared";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function uploadFiles(
  adapter: WorkspaceAdapter,
  files: Record<string, File | null>,
): Promise<{ ok: true; refs: Record<string, FileRef | null> } | { ok: false; error: string }> {
  const refs: Record<string, FileRef | null> = {};
  for (const [k, f] of Object.entries(files)) {
    if (!f) {
      refs[k] = null;
      continue;
    }
    const r = await adapter.uploadEvidence(f);
    if (!r.ok) return { ok: false, error: `Could not upload ${f.name}: ${r.error}` };
    refs[k] = { name: r.file.name, size: r.file.size, mime: r.file.mime, path: r.file.path };
  }
  return { ok: true, refs };
}

function FeeItemsList({ fee }: { fee: Fee }) {
  return (
    <ul className="fee-items">
      {(fee.items || []).map((x, i) => (
        <li key={i}>
          <span>{x.name}</span>
          <strong>{x.amount != null ? `UGX ${Number(x.amount).toLocaleString("en-UG")}` : x.label || "Check current fee"}</strong>
        </li>
      ))}
    </ul>
  );
}

function FileInput({ id, onFile }: { id: string; onFile: (f: File | null) => void }) {
  return <input type="file" id={id} onChange={(e) => onFile(e.target.files?.[0] || null)} />;
}

// ---------------------------------------------------------------------------
// Requirement guidance (the "i" drawer)
// ---------------------------------------------------------------------------

export function GuideBody({ id }: { id: string }) {
  const { state } = useApp();
  const o = getOb(id);
  if (!o) return null;
  const g = o.guide || ({} as Partial<typeof o.guide>);
  const cost = costForObligation(id, state.profile?.route || "ml");
  return (
    <>
      <div className="guide-block">
        <div className="guide-label">What this means</div>
        <div className="guide-text">{g.what || ""}</div>
      </div>
      <div className="guide-block">
        <div className="guide-label">What you need to do</div>
        <div className="guide-text">{g.do || ""}</div>
      </div>
      <div className="guide-block">
        <div className="guide-label">When</div>
        <div className="guide-text">{g.when || o["Legal clock"]}</div>
      </div>
      <div className="guide-block">
        <div className="guide-label">What you need to keep / provide</div>
        <div className="guide-text">{g.keep || ""}</div>
      </div>
      {cost ? (
        <div className="guide-block">
          <div className="guide-label">Cost</div>
          <div className="guide-text">{cost}</div>
        </div>
      ) : null}
      <div className="guide-block">
        <div className="guide-label">Source</div>
        <div className="guide-text">{o["Source / provision"]}</div>
        {o.sourceUrl ? (
          <div style={{ marginTop: 7 }}>
            <a className="source-link" href={o.sourceUrl} target="_blank" rel="noopener noreferrer">
              Open source ↗
            </a>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Obligation drawer
// ---------------------------------------------------------------------------

export function ObligationBody({ id }: { id: string }) {
  const { state, clock, openDrawer } = useApp();
  const o = getOb(id);
  if (!o) return null;
  const active = (state.occurrences || []).filter((x) => (x.ids || []).includes(id));
  const controlIndexes = CONTROL_AREAS.map((c, i) => (controlIds(state, c).includes(id) ? i : null)).filter(
    (x): x is number => x !== null,
  );
  return (
    <>
      <div className="meta-grid">
        <div className="meta-box">
          <label>Applies to</label>
          <div>{o["Applies to"]}</div>
        </div>
        <div className="meta-box">
          <label>Behaviour</label>
          <div>{o.Behaviour}</div>
        </div>
        <div className="meta-box">
          <label>Legal clock</label>
          <div>{o["Legal clock"]}</div>
        </div>
        <div className="meta-box">
          <label>Recipient</label>
          <div>{o.Recipient}</div>
        </div>
      </div>
      <div className="drawer-section">
        <h3>Current work</h3>
        {active.length ? (
          active.map((x) => (
            <div className="generated" key={x.uid}>
              <strong>{x.title}</strong>
              <p>
                {occurrenceState(x, clock)} · {x.legalDue ? `due ${fmt(x.legalDue)}` : "no fixed date"}
              </p>
              <button
                type="button"
                className="textlink"
                data-from-ob-occ={x.uid}
                onClick={() => openDrawer({ kind: "occurrence", uid: x.uid })}
              >
                Open occurrence
              </button>
            </div>
          ))
        ) : (
          <p>No active occurrence is linked to this obligation.</p>
        )}
      </div>
      <div className="drawer-section">
        <h3>Linked control</h3>
        {controlIndexes.length ? (
          controlIndexes.map((i, n) => (
            <span key={i}>
              {n > 0 ? " " : ""}
              <button type="button" className="subtle" data-from-ob-control={i} onClick={() => openDrawer({ kind: "control", idx: i })}>
                {CONTROL_AREAS[i].title}
              </button>
            </span>
          ))
        ) : (
          <p>This obligation is primarily managed through occurrence workflows.</p>
        )}
      </div>
      <div className="drawer-section">
        <h3>Source</h3>
        <p>{o["Source / provision"]}</p>
        {o.sourceUrl ? (
          <a className="source-link" href={o.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open source ↗
          </a>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Occurrence workflow drawer
// ---------------------------------------------------------------------------

export function OccurrenceBody({ uid }: { uid: string }) {
  const { state, getState, clock, adapter, commit, closeDrawer, openDrawer } = useApp();
  const oc = state.occurrences.find((x) => x.uid === uid);
  const [owner, setOwner] = useState(oc?.owner || "");
  const [reviewer, setReviewer] = useState(oc?.reviewer || "");
  const [target, setTarget] = useState(oc?.internalTarget || "");
  const [feeRef, setFeeRef] = useState(oc?.fee?.reference || "");
  const [subDate, setSubDate] = useState(oc?.submission?.date || "");
  const [subRef, setSubRef] = useState(oc?.submission?.reference || "");
  const [outcome, setOutcome] = useState(oc?.outcome?.status || "");
  const [workFile, setWorkFile] = useState<File | null>(null);
  const [feeFile, setFeeFile] = useState<File | null>(null);
  const [subFile, setSubFile] = useState<File | null>(null);
  const [outcomeFile, setOutcomeFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!oc) return null;
  const st = occurrenceState(oc, clock);
  const obs = (oc.ids || []).map(getOb).filter((o): o is NonNullable<ReturnType<typeof getOb>> => !!o);
  const prior = isPriorApproval(oc);

  async function run(mode: OccurrenceMode) {
    setError("");
    const form = (refs: { work: FileRef | null; fee: FileRef | null; sub: FileRef | null; outcome: FileRef | null }) => ({
      owner,
      reviewer,
      internalTarget: target,
      workFile: refs.work,
      feeRef,
      feeFile: refs.fee,
      subDate,
      subRef,
      subFile: refs.sub,
      outcomeStatus: outcome,
      outcomeFile: refs.outcome,
    });
    // Validate with placeholders first (same rules as the prototype) so nothing
    // is uploaded for a submission that would be rejected.
    const dry = saveOccurrence(
      getState(),
      uid,
      form({
        work: workFile ? filePlaceholder(workFile) : null,
        fee: feeFile ? filePlaceholder(feeFile) : null,
        sub: subFile ? filePlaceholder(subFile) : null,
        outcome: outcomeFile ? filePlaceholder(outcomeFile) : null,
      }),
      mode,
      makeClock(),
    );
    if (!dry.ok) {
      setError(dry.error);
      return;
    }
    setBusy(true);
    const up = await uploadFiles(adapter, { work: workFile, fee: feeFile, sub: subFile, outcome: outcomeFile });
    if (!up.ok) {
      setBusy(false);
      setError(up.error);
      return;
    }
    const res = saveOccurrence(
      getState(),
      uid,
      form({ work: up.refs.work, fee: up.refs.fee, sub: up.refs.sub, outcome: up.refs.outcome }),
      mode,
      makeClock(),
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    commit(res.state);
    closeDrawer();
  }

  return (
    <>
      <div className="meta-grid">
        <div className="meta-box">
          <label>State</label>
          <div>
            <span className={`badge ${badgeClass(st)}`}>{st}</span>
          </div>
        </div>
        <div className="meta-box">
          <label>Legal / regulator due</label>
          <div>{legalDueText(oc)}</div>
        </div>
        <div className="meta-box">
          <label>Owner</label>
          <div>{oc.owner || "Unassigned"}</div>
        </div>
        <div className="meta-box">
          <label>Internal target</label>
          <div>{oc.internalTarget ? fmt(oc.internalTarget) : "Not set"}</div>
        </div>
      </div>
      {oc.fee ? (
        <div className="drawer-section">
          <h3>Regulatory fee</h3>
          <div className="fee-box">
            <strong>{feeLabel(oc.fee)}</strong>
            <FeeItemsList fee={oc.fee} />
            <div className="profile-hint">{oc.fee.source || ""}</div>
          </div>
          <div className="field-grid">
            <div className="field">
              <label>Payment reference</label>
              <input id="fee-ref" value={feeRef} onChange={(e) => setFeeRef(e.target.value)} />
            </div>
            <div className="upload">
              <strong>Payment evidence</strong>
              <FileInput id="fee-file" onFile={setFeeFile} />
              <div className="saved-file">
                {oc.fee.file ? <SavedFileName file={oc.fee.file} /> : "No payment evidence added."}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="drawer-section">
        <h3>Underlying obligation{obs.length === 1 ? "" : "s"}</h3>
        {obs.map((o) => (
          <div className="generated" key={o.ID}>
            <strong>
              {o.Obligation}{" "}
              <button type="button" className="info" aria-label="Requirement guidance" data-occ-ob-info={o.ID} onClick={() => openDrawer({ kind: "guide", id: o.ID })}>
                i
              </button>
            </strong>
            <p>{o["Legal clock"]}</p>
          </div>
        ))}
      </div>
      <div className="drawer-section">
        <h3>Work</h3>
        <div className="field-grid">
          <div className="field">
            <label>Owner</label>
            <input id="occ-owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="field">
            <label>Reviewer</label>
            <input id="occ-reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </div>
          <div className="field">
            <label>Internal target</label>
            <input id="occ-target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            <small>Internal target only — it never replaces the legal/regulator due date.</small>
          </div>
        </div>
        <div className="upload">
          <strong>Working / response evidence</strong>
          <FileInput id="occ-file" onFile={setWorkFile} />
          <div className="saved-file">
            <SavedFileList files={oc.evidence || []} empty="No evidence added yet." />
          </div>
        </div>
      </div>
      <div className="drawer-section">
        <h3>Submission / notice</h3>
        <div className="field-grid">
          <div className="field">
            <label>Submission / delivery date</label>
            <input type="date" id="sub-date" value={subDate} onChange={(e) => setSubDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Reference / receipt</label>
            <input id="sub-ref" value={subRef} onChange={(e) => setSubRef(e.target.value)} />
          </div>
        </div>
        <div className="upload">
          <strong>Submission / delivery evidence</strong>
          <FileInput id="sub-file" onFile={setSubFile} />
          <div className="saved-file">
            {oc.submission?.file ? <SavedFileName file={oc.submission.file} /> : "No submission evidence added."}
          </div>
        </div>
      </div>
      {prior ? (
        <div className="drawer-section">
          <h3>Regulator outcome</h3>
          <p>This workflow cannot close until approval/no-objection/outcome evidence is recorded.</p>
          <div className="field">
            <label>Outcome</label>
            <select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">Select…</option>
              <option value="approved">Approved / no objection</option>
              <option value="refused">Refused</option>
            </select>
          </div>
          <div className="upload">
            <strong>Outcome evidence</strong>
            <FileInput id="outcome-file" onFile={setOutcomeFile} />
            <div className="saved-file">
              {oc.outcome?.file ? <SavedFileName file={oc.outcome.file} /> : "No outcome evidence added."}
            </div>
          </div>
        </div>
      ) : null}
      <div className="drawer-section">
        <h3>Audit trail</h3>
        {(oc.history || [])
          .slice()
          .reverse()
          .map((h, i) => (
            <div className="activity-row" key={i}>
              {h.text}
              <span>{new Date(h.date).toLocaleString()}</span>
            </div>
          ))}
      </div>
      <InlineMessage message={error} />
      <div className="drawer-actions">
        <button type="button" className="save" id="save-occ" disabled={busy} onClick={() => run("save")}>
          Save progress
        </button>
        <button type="button" className="subtle" id="mark-submitted" disabled={busy} onClick={() => run("submit")}>
          Record submitted
        </button>
        <button type="button" className="subtle" id="mark-closed" disabled={busy} onClick={() => run("close")}>
          {prior ? "Close with regulator outcome" : "Close occurrence"}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Control drawer
// ---------------------------------------------------------------------------

export function ControlBody({ idx }: { idx: number }) {
  const { state, getState, adapter, commit, closeDrawer, openDrawer } = useApp();
  const c = CONTROL_AREAS[idx];
  const d = state.controls[idx] || { evidence: [], exceptions: [] };
  const [file, setFile] = useState<File | null>(null);
  const [last, setLast] = useState(d.lastReview || "");
  const [next, setNext] = useState(d.nextReview || "");
  const [ex, setEx] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const ids = controlIds(state, c);
  const st = controlStatus(state, idx);
  const label = controlLabel(st);

  async function save() {
    setError("");
    setBusy(true);
    const up = await uploadFiles(adapter, { file });
    if (!up.ok) {
      setBusy(false);
      setError(up.error);
      return;
    }
    commit(saveControlReview(getState(), idx, { file: up.refs.file, lastReview: last, nextReview: next, exception: ex }, makeClock()));
    setBusy(false);
    closeDrawer();
  }

  return (
    <>
      <div className="meta-grid">
        <div className="meta-box">
          <label>Status</label>
          <div>
            <span className={`badge ${badgeClass(label)}`}>{label}</span>
          </div>
        </div>
        <div className="meta-box">
          <label>Last review</label>
          <div>{d.lastReview ? fmt(d.lastReview) : "Not recorded"}</div>
        </div>
        <div className="meta-box">
          <label>Internal next review</label>
          <div>{d.nextReview ? fmt(d.nextReview) : "Not set"}</div>
        </div>
        <div className="meta-box">
          <label>Open exceptions</label>
          <div>{(d.exceptions || []).filter((x) => !x.closed).length}</div>
        </div>
      </div>
      <div className="drawer-section">
        <h3>What this control maintains</h3>
        <p>{c.maintains}</p>
      </div>
      <div className="drawer-section">
        <h3>Linked obligations</h3>
        {ids.map((id) => {
          const o = getOb(id);
          if (!o) return null;
          return (
            <div className="generated" key={id}>
              <strong>
                {o.Obligation}{" "}
                <button type="button" className="info" aria-label="Requirement guidance" data-control-ob-info={id} onClick={() => openDrawer({ kind: "guide", id })}>
                  i
                </button>
              </strong>
              <p>{o["Legal clock"]}</p>
            </div>
          );
        })}
      </div>
      <div className="drawer-section">
        <h3>Evidence &amp; review</h3>
        <div className="upload">
          <strong>Add control evidence</strong>
          <FileInput id="control-file" onFile={setFile} />
          <div className="saved-file">
            <SavedFileList files={d.evidence || []} empty="No evidence added yet." />
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label>Last review date</label>
            <input type="date" id="control-last" value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
          <div className="field">
            <label>Internal next review</label>
            <input type="date" id="control-next" value={next} onChange={(e) => setNext(e.target.value)} />
            <small>Internal date only — not a statutory deadline.</small>
          </div>
        </div>
      </div>
      <div className="drawer-section">
        <h3>Exceptions</h3>
        {(d.exceptions || []).map((x, i) => (
          <div className="exception" key={i}>
            <strong>{x.title}</strong>
            <p>
              {x.closed ? "Resolved" : "Open"}
              {x.note ? " · " + x.note : ""}
            </p>
            {!x.closed ? (
              <button type="button" className="textlink" data-close-ex={i} onClick={() => commit(resolveException(getState(), idx, i))}>
                Resolve exception
              </button>
            ) : null}
          </div>
        ))}
        <div className="field">
          <label>Record a new exception</label>
          <input id="ex-title" placeholder="What went wrong or needs remediation?" value={ex} onChange={(e) => setEx(e.target.value)} />
        </div>
      </div>
      <InlineMessage message={error} />
      <div className="drawer-actions">
        <button type="button" className="save" id="save-control" disabled={busy} onClick={save}>
          Save control review
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Log an event
// ---------------------------------------------------------------------------

export function EventStartBody() {
  const { state, openDrawer } = useApp();
  const events = EVENT_DEFS.filter((e) => eventApplicable(state, e));
  const cats = [...new Set(events.map((e) => e.cat))];
  return (
    <>
      <div className="drawer-section">
        <p>Tell Beacon what happened in the business. Beacon will generate the regulatory work that follows.</p>
      </div>
      {cats.map((cat) => (
        <div className="drawer-section" key={cat}>
          <h3>{cat}</h3>
          <div className="event-grid">
            {events
              .filter((e) => e.cat === cat)
              .map((e) => (
                <button type="button" className="event-card" data-event={e.id} key={e.id} onClick={() => openDrawer({ kind: "event", id: e.id })}>
                  <strong>{e.title}</strong>
                  <span>{e.desc}</span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function EventFormBody({ id }: { id: string }) {
  const { state, getState, commit, openDrawer } = useApp();
  const e = EVENT_DEFS.find((x) => x.id === id);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  if (!e) return null;
  const ids = eventIds(state, e);
  const linked = ids.map(getOb).filter((o): o is NonNullable<ReturnType<typeof getOb>> => !!o);
  const fee = eventFee(e.id, state.profile?.route || "ml");
  return (
    <>
      <div className="drawer-section">
        <p>{e.desc}</p>
      </div>
      <div className="field-grid">
        {e.fields.map((f) => {
          const type = eventFieldType(f);
          const label = EVENT_FIELD_LABELS[f] || f;
          return (
            <div className="field" key={f}>
              <label>{label}</label>
              {type === "textarea" ? (
                <textarea id={`ev-${f}`} value={vals[f] || ""} onChange={(ev) => setVals({ ...vals, [f]: ev.target.value })} />
              ) : (
                <input id={`ev-${f}`} type={type} value={vals[f] || ""} onChange={(ev) => setVals({ ...vals, [f]: ev.target.value })} />
              )}
            </div>
          );
        })}
      </div>
      <div className="drawer-section">
        <h3>Regulatory work Beacon will create</h3>
        {linked.map((o) => (
          <div className="generated" key={o.ID}>
            <strong>{o.Obligation}</strong>
            <p>{o["Legal clock"]}</p>
          </div>
        ))}
        {fee ? (
          <div className="fee-box">
            <strong>Regulatory fee: {feeLabel(fee)}</strong>
            <FeeItemsList fee={fee} />
            <div className="profile-hint">{fee.source || ""}</div>
          </div>
        ) : null}
      </div>
      <InlineMessage message={error} />
      <div className="drawer-actions">
        <button
          type="button"
          className="save"
          id="create-event"
          onClick={() => {
            const r = createEvent(getState(), e, vals, makeClock());
            if (!r.ok) {
              setError(r.error);
              return;
            }
            commit(r.state);
            openDrawer({ kind: "occurrence", uid: r.uid });
          }}
        >
          Create case &amp; work
        </button>
        <button type="button" className="subtle" id="event-back" onClick={() => openDrawer({ kind: "eventStart" })}>
          ← Events
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Add regulator-set due date
// ---------------------------------------------------------------------------

export function RegulatorSetBody() {
  const { getState, adapter, commit, closeDrawer } = useApp();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [ob, setOb] = useState("LIC-03");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setError("");
    const dry = createRegulatorSet(getState(), { title, due, obligationId: ob }, makeClock());
    if (!dry.ok) {
      setError(dry.error);
      return;
    }
    setBusy(true);
    const up = await uploadFiles(adapter, { file });
    if (!up.ok) {
      setBusy(false);
      setError(up.error);
      return;
    }
    const res = createRegulatorSet(getState(), { title, due, obligationId: ob, file: up.refs.file }, makeClock());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    commit(res.state);
    closeDrawer();
  }

  return (
    <>
      <div className="drawer-section">
        <p>Create this only from an actual regulator letter, portal schedule, direction or reporting instruction.</p>
      </div>
      <div className="field">
        <label>Title</label>
        <input id="reg-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field-grid">
        <div className="field">
          <label>Regulator due date</label>
          <input id="reg-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="field">
          <label>Underlying obligation</label>
          <select id="reg-ob" value={ob} onChange={(e) => setOb(e.target.value)}>
            {REGULATOR_OBLIGATIONS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="upload">
        <strong>Regulator instruction</strong>
        <FileInput id="reg-file" onFile={setFile} />
      </div>
      <InlineMessage message={error} />
      <div className="drawer-actions">
        <button type="button" className="save" id="save-reg" disabled={busy} onClick={create}>
          Create occurrence
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Profile & registrations (settings drawer)
// ---------------------------------------------------------------------------

function ChoiceRow({
  k,
  value,
  onPick,
  withNotSure = true,
}: {
  k: string;
  value: string;
  onPick: (v: Answer) => void;
  withNotSure?: boolean;
}) {
  const opts: [Answer, string][] = [
    ["yes", "Yes"],
    ["no", "No"],
  ];
  if (withNotSure) opts.push(["not-sure", "Not sure"]);
  return (
    <div className="choice-row inline-choice">
      {opts.map(([v, label]) => (
        <button
          type="button"
          key={v}
          className={`choice ${value === v ? "selected" : ""}`}
          data-setting-choice={k}
          data-value={v}
          onClick={() => onPick(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ProfileSettingsBody() {
  const { state, getState, clock, commit, closeDrawer, goSetup } = useApp();
  const p = state.profile;
  const r = state.registrations || {};
  const [f, setF] = useState<SettingsForm>({
    issue: p?.issue || "",
    fye: p?.fye || "",
    pdpoStatus: p?.pdpoStatus || "",
    pdpo: p?.pdpo || "",
    collateral: p?.collateral || "",
    custody: p?.custody || "",
    recovery: p?.recovery || "",
    crossborder: p?.crossborder || "",
    advice: p?.advice || "",
    fitspa: p?.fitspa || "",
    registrations: {
      licenceNo: r.licenceNo || "",
      pdpoNo: r.pdpoNo || "",
      fiaNo: r.fiaNo || "",
      mlco: r.mlco || "",
      goaml: r.goaml || "",
      contact: r.contact || "",
    },
  });
  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const setReg = (k: keyof SettingsForm["registrations"], v: string) =>
    setF((x) => ({ ...x, registrations: { ...x.registrations, [k]: v } }));
  const costs = knownCosts(state, clock);
  const licExpiry = fmt(new Date(clock.today.getFullYear(), 11, 31));
  return (
    <>
      <div className="drawer-section">
        <h3>Licence</h3>
        <div className="field-grid">
          <div className="field">
            <label>Date first licensed by MRD-MoFPED</label>
            <input id="set-issue" type="date" value={f.issue} onChange={(e) => set("issue", e.target.value)} />
          </div>
          <div className="field">
            <label>Current licence expiry</label>
            <input value={licExpiry} disabled readOnly />
            <small>Derived from the annual 31 December licence cycle.</small>
          </div>
          <div className="field">
            <label>Financial year-end</label>
            <input id="set-fye" type="date" value={f.fye} onChange={(e) => set("fye", e.target.value)} />
            <small>Only month and day are used for recurring fiscal-year workflows.</small>
          </div>
          <div className="field">
            <label>MRD-MoFPED licence number</label>
            <input id="set-licno" value={f.registrations.licenceNo || ""} onChange={(e) => setReg("licenceNo", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="drawer-section">
        <h3>PDPO</h3>
        <div className="field">
          <label>Registration status</label>
          <select id="set-pdpo-status" value={f.pdpoStatus} onChange={(e) => set("pdpoStatus", e.target.value as Answer)}>
            <option value="yes">Yes — registered</option>
            <option value="no">No — not registered</option>
            <option value="not-sure">Not sure</option>
          </select>
        </div>
        <div className="field-grid">
          <div className="field" id="set-pdpo-expiry-wrap" style={{ display: f.pdpoStatus === "yes" ? "block" : "none" }}>
            <label>Certificate expiry</label>
            <input id="set-pdpo" type="date" value={f.pdpo} onChange={(e) => set("pdpo", e.target.value)} />
          </div>
          <div className="field">
            <label>PDPO registration number</label>
            <input id="set-pdpono" value={f.registrations.pdpoNo || ""} onChange={(e) => setReg("pdpoNo", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="drawer-section">
        <h3>How you operate</h3>
        <div className="field">
          <label>Do you use collateral/security for any loans?</label>
          <ChoiceRow k="collateral" value={f.collateral} onPick={(v) => set("collateral", v)} />
        </div>
        <div className="field" id="settings-custody" style={{ display: f.collateral === "yes" ? "block" : "none" }}>
          <label>Do you take physical custody/possession of customer collateral?</label>
          <ChoiceRow k="custody" value={f.custody} onPick={(v) => set("custody", v)} />
        </div>
        <div className="field">
          <label>Do you use external debt-collection or recovery agents?</label>
          <ChoiceRow k="recovery" value={f.recovery} onPick={(v) => set("recovery", v)} />
        </div>
        <div className="field">
          <label>Do you store or process customer data outside Uganda, including through overseas cloud services?</label>
          <ChoiceRow k="crossborder" value={f.crossborder} onPick={(v) => set("crossborder", v)} />
        </div>
        <div className="field">
          <label>Do you provide personal advice or recommendations to customers?</label>
          <ChoiceRow k="advice" value={f.advice} onPick={(v) => set("advice", v)} />
          <small>This affects a specific FCP suitability control; it does not block initial setup.</small>
        </div>
      </div>
      <div className="drawer-section">
        <h3>FIA / AML</h3>
        <div className="field-grid">
          <div className="field">
            <label>FIA registration number</label>
            <input id="set-fiano" value={f.registrations.fiaNo || ""} onChange={(e) => setReg("fiaNo", e.target.value)} />
          </div>
          <div className="field">
            <label>MLCO</label>
            <input id="set-mlco" value={f.registrations.mlco || ""} onChange={(e) => setReg("mlco", e.target.value)} />
          </div>
          <div className="field">
            <label>goAML status</label>
            <select id="set-goaml" value={f.registrations.goaml || ""} onChange={(e) => setReg("goaml", e.target.value)}>
              <option value="">Select…</option>
              <option value="active">Active</option>
              <option value="not-active">Not active</option>
            </select>
          </div>
          <div className="field">
            <label>Regulator / reporting contact</label>
            <input id="set-contact" value={f.registrations.contact || ""} onChange={(e) => setReg("contact", e.target.value)} />
          </div>
        </div>
      </div>
      <div className="drawer-section">
        <h3>Optional industry layer</h3>
        <div className="field">
          <label>FITSPA Code subscriber/member?</label>
          <ChoiceRow k="fitspa" value={f.fitspa} onPick={(v) => set("fitspa", v as "yes" | "no")} withNotSure={false} />
        </div>
      </div>
      <div className="drawer-section">
        <h3>Known regulatory fees this year</h3>
        <p>Only validated fees already generated by your current renewal/event workflows are shown here.</p>
        {costs.length ? (
          <div className="cost-list">
            {costs.map((o) => (
              <div className="cost-row" key={o.uid}>
                <span>{o.title}</span>
                <strong>{feeLabel(o.fee)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">No known regulatory fees are currently generated for this year.</div>
        )}
      </div>
      <div className="drawer-actions">
        <button
          type="button"
          className="save"
          id="save-settings"
          onClick={() => {
            commit(saveSettings(getState(), f, makeClock()));
            closeDrawer();
          }}
        >
          Save profile
        </button>
        <button
          type="button"
          className="subtle"
          id="reconfigure"
          onClick={() => {
            closeDrawer();
            goSetup();
          }}
        >
          Review setup essentials
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Expert Support
// ---------------------------------------------------------------------------

export function ExpertBody({ ctx }: { ctx: import("@/lib/comply/digital-engine").ExpertCtx }) {
  const { state, getState, clock, adapter, commit, closeDrawer } = useApp();
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ec = expertContext(state, ctx, clock);

  async function send() {
    const text = q.trim();
    if (!text) return; // the prototype ignores an empty question
    setError("");
    setBusy(true);
    const r = await adapter.sendExpertRequest({
      kind: "question",
      message: text,
      contextKey: ec.key,
      contextLabel: ec.meta ? `${ec.text} — ${ec.meta}` : ec.text,
    });
    setBusy(false);
    if (!r.ok) {
      setError(`Your question could not be sent${r.error ? ` (${r.error})` : ""}. Please try again.`);
      return;
    }
    commit(addSupport(getState(), text, ec.text, makeClock(), "question"));
    setQ("");
  }

  async function review() {
    setError("");
    setBusy(true);
    const r = await adapter.sendExpertRequest({
      kind: "compliance_review",
      message: "Compliance review requested",
      contextKey: ec.key,
      contextLabel: ec.meta ? `${ec.text} — ${ec.meta}` : ec.text,
    });
    setBusy(false);
    if (!r.ok) {
      setError(`Your review request could not be sent${r.error ? ` (${r.error})` : ""}. Please try again.`);
      return;
    }
    commit(addSupport(getState(), "Compliance review requested", ec.text, makeClock(), "review"));
    closeDrawer();
  }

  return (
    <>
      <div className="note">
        <strong>Context</strong>
        <br />
        {ec.text}
        {ec.meta ? (
          <>
            <br />
            {ec.meta}
          </>
        ) : null}
      </div>
      <div className="field">
        <label>Your question</label>
        <textarea id="expert-q" placeholder="What do you need help with?" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <InlineMessage message={error} />
      <div className="drawer-actions">
        <button type="button" className="save" id="send-expert" disabled={busy} onClick={send}>
          Send question
        </button>
        <button type="button" className="subtle" id="request-review" disabled={busy} onClick={review}>
          Request compliance review
        </button>
      </div>
      {state.support.length ? (
        <div className="drawer-section" style={{ marginTop: 20 }}>
          <h3>Recent support</h3>
          {state.support
            .slice(-4)
            .reverse()
            .map((x, i) => (
              <div className="activity-row" key={i}>
                {x.text}
                <span>{x.date}</span>
              </div>
            ))}
        </div>
      ) : null}
    </>
  );
}
