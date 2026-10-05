"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx, PaymentsMasthead } from "./pw-ui";
import { EditorBody, GuidanceBody, editorEyebrow, type EditorApi } from "./payments-drawers";
import {
  cardSummary,
  cardTitle,
  phaseLabel,
  phaseOrder,
  productConfig,
  type ApplicationSummary,
  type Ctx,
  type FactAnswers,
  type FileMeta,
  type ItemStatus,
  type Template,
} from "./payments-model";

// The Application / Documents / Review workspace (design #screen-app):
// masthead, tabs, phase rail, search + filters, requirement cards, the right
// rail, the documents table with the application-pack card, the review tab
// and the single slide-in drawer that hosts guidance, every requirement
// editor and the expert-support views.

export type ReviewState = {
  status: string;
  type: "final" | "interim";
  requestedAt: string;
  requestedProgress: number;
  updatedAfterRequest?: boolean;
  updatedAt?: string;
};

export type PackState = { builtAt: string; fileCount: number };

type Tab = "checklist" | "documents" | "review";
type Filter = "all" | "remaining" | "done";
type Drawer =
  | null
  | { kind: "guidance"; id: string }
  | { kind: "editor"; id: string }
  | { kind: "expert-menu" }
  | { kind: "expert-ask" }
  | { kind: "expert-sent" };

export type WorkspaceProps = {
  routeSummary: string;
  templates: Template[]; // every template (for file titles)
  visible: Template[]; // the applicable, visible requirements in seq order
  statuses: Record<string, ItemStatus>;
  ctx: Ctx;
  summary: ApplicationSummary;
  review: ReviewState | null;
  pack: PackState | null;
  onBackToResult: () => void;
  onEditDetails: () => void;
  onChangeSelections: () => void;
  onRestart: () => void;
  onSave: (t: Template, next: any, factsPatch?: Partial<FactAnswers>) => Promise<void>;
  onSetFact: (patch: Partial<FactAnswers>) => Promise<void>;
  onUpload: (t: Template, slot: string, label: string, file: File) => Promise<void>;
  onViewFile: (meta: FileMeta) => void;
  onRequestReview: () => Promise<void>;
  onCancelReview: () => Promise<void>;
  onBuildPack: () => Promise<void>;
  onSendInquiry: (text: string) => Promise<boolean>;
  errorMsg: string | null;
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  ready: "Ready",
  in_progress: "In progress",
  not_started: "Not started",
};

export default function PaymentsWorkspace(p: WorkspaceProps) {
  const [tabState, setTab] = useState<Tab>("checklist");
  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [inquiry, setInquiry] = useState("");
  const [inquiryBusy, setInquiryBusy] = useState(false);
  const inquiryRef = useRef<HTMLTextAreaElement>(null);

  const { visible, statuses, ctx, summary, review, pack } = p;

  const closeDrawer = useCallback(() => setDrawer(null), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawer(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The Review tab disappears when there is no request.
  const tab: Tab = !review && tabState === "review" ? "checklist" : tabState;

  const phases = useMemo(() => phaseOrder(visible), [visible]);
  const st = (t: Template): ItemStatus => statuses[t.external_id] ?? "not_started";
  const templatesById = useMemo(() => Object.fromEntries(p.templates.map((t) => [t.external_id, t])), [p.templates]);

  // ---- filtered list ----
  const shown = useMemo(() => {
    let items = visible;
    if (activePhase) items = items.filter((t) => t.phase === activePhase);
    if (filter === "remaining") items = items.filter((t) => st(t) !== "ready");
    else if (filter === "done") items = items.filter((t) => st(t) === "ready");
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter((t) => {
        const hay = (cardTitle(t) + " " + (t.guidance_long ?? t.guide_what ?? "") + " " + (t.deliverable ?? t.guide_evidence ?? "")).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, activePhase, filter, search, statuses]);

  const nextTemplate = useMemo(() => visible.find((t) => st(t) !== "ready") ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, statuses]);

  // ---- files table rows ----
  const fileRows = useMemo(() => {
    const rows: { id: string; slot: string; meta: FileMeta; title: string }[] = [];
    Object.keys(ctx.files).forEach((id) => {
      Object.keys(ctx.files[id]).forEach((slot) => {
        const meta = ctx.files[id][slot];
        if (!meta) return;
        const t = templatesById[id];
        rows.push({ id, slot, meta, title: t ? cardTitle(t) : id });
      });
    });
    return rows.sort((a, b) => (b.meta.uploadedAt || "").localeCompare(a.meta.uploadedAt || ""));
  }, [ctx.files, templatesById]);

  function openRequirementFromRail(id: string) {
    setActivePhase(null);
    setFilter("all");
    setSearch("");
    setTimeout(() => {
      document.getElementById("requirement-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setDrawer({ kind: "editor", id }), 180);
    }, 0);
  }

  async function requestReview() {
    await p.onRequestReview();
    setDrawer(null);
    setTab("review");
  }

  async function sendInquiry() {
    const text = inquiry.trim();
    if (!text) {
      inquiryRef.current?.focus();
      return;
    }
    setInquiryBusy(true);
    const ok = await p.onSendInquiry(text);
    setInquiryBusy(false);
    if (ok) {
      setInquiry("");
      setDrawer({ kind: "expert-sent" });
    }
  }

  // ---- drawer content ----
  function renderDrawer(): { title: string; eyebrow: string; body: React.ReactNode } {
    if (!drawer) return { title: "", eyebrow: "", body: null };
    if (drawer.kind === "guidance") {
      const t = templatesById[drawer.id];
      return { title: cardTitle(t), eyebrow: "Guidance", body: <GuidanceBody t={t} /> };
    }
    if (drawer.kind === "editor") {
      const t = templatesById[drawer.id];
      const api: EditorApi = {
        t,
        ctx,
        data: ctx.data[t.external_id] ?? {},
        save: (next, factsPatch) => p.onSave(t, next, factsPatch),
        setFact: (patch) => p.onSetFact(patch),
        upload: (slot, label, file) => p.onUpload(t, slot, label, file),
      };
      // `embedded` requirements open the guidance view, as in the design.
      if ((t.product_type || "upload") === "embedded") return { title: cardTitle(t), eyebrow: "Guidance", body: <GuidanceBody t={t} /> };
      return { title: cardTitle(t), eyebrow: editorEyebrow(t, ctx), body: <EditorBody key={t.external_id} api={api} /> };
    }
    if (drawer.kind === "expert-menu") {
      const reviewTitle = summary.complete ? "Request final application review" : "Request application review";
      const reviewCopy = summary.complete
        ? "Your required application items are complete. An expert can review the full application before submission."
        : "An expert can review the application as it currently stands and flag issues in the information and documents already prepared.";
      return {
        title: "Expert support",
        eyebrow: "Help & review",
        body: (
          <div className={cx("support-options")}>
            <div className={cx("support-option")}>
              <h3>Ask a question</h3>
              <p>Get help with a requirement, document or application issue.</p>
              <button className={cx("work-btn subtle")} id="support-ask-question" type="button" onClick={() => { setInquiry(""); setDrawer({ kind: "expert-ask" }); }}>
                Ask a question
              </button>
            </div>
            {review ? (
              <div className={cx("support-option")}>
                <h3>{review.type === "final" ? "Final application review" : "Application review"}</h3>
                <p>Your review request has already been submitted.</p>
                <button className={cx("work-btn subtle")} id="support-open-review" type="button" onClick={() => { setDrawer(null); setTab("review"); }}>
                  Open review
                </button>
              </div>
            ) : (
              <div className={cx("support-option")}>
                <h3>{reviewTitle}</h3>
                <p>{reviewCopy}</p>
                <button className={cx("work-btn primary")} id="support-request-review" type="button" onClick={requestReview}>
                  {summary.complete ? "Request final review" : "Request review"}
                </button>
              </div>
            )}
          </div>
        ),
      };
    }
    if (drawer.kind === "expert-ask") {
      return {
        title: "Ask an expert",
        eyebrow: "Expert support",
        body: (
          <>
            <label className={cx("support-field-label")} htmlFor="expert-inquiry-text">
              What do you need help with?
            </label>
            <textarea
              className={cx("support-textarea")}
              id="expert-inquiry-text"
              ref={inquiryRef}
              value={inquiry}
              onChange={(e) => setInquiry(e.target.value)}
              placeholder="Ask about a requirement, document, regulatory issue or part of your application."
            />
            <div className={cx("work-card-actions")} style={{ marginTop: 14 }}>
              <button className={cx("work-btn primary")} id="send-expert-inquiry" type="button" onClick={sendInquiry} disabled={inquiryBusy}>
                Send inquiry
              </button>
              <button className={cx("work-btn subtle")} id="back-expert-support" type="button" onClick={() => setDrawer({ kind: "expert-menu" })}>
                Back
              </button>
            </div>
            {p.errorMsg && <div className={cx("pw-error")}>{p.errorMsg}</div>}
          </>
        ),
      };
    }
    return {
      title: "Inquiry sent",
      eyebrow: "Expert support",
      body: (
        <div className={cx("support-confirmation")}>
          <strong>Your inquiry has been captured.</strong>
          <div className={cx("doc-sub")}>An expert can respond using the application context available at this stage.</div>
        </div>
      ),
    };
  }

  const dr = renderDrawer();

  // ---- next-step block of the right rail ----
  let nextBlock;
  if (summary.complete) {
    nextBlock = (
      <>
        <div className={cx("rail-label")}>Next</div>
        <p className={cx("rail-next-title")}>Your application requirements are complete.</p>
        <button className={cx("rail-btn")} id="rail-open-documents-next" type="button" onClick={() => setTab("documents")}>
          Review application pack
        </button>
      </>
    );
  } else if (nextTemplate) {
    nextBlock = (
      <>
        <div className={cx("rail-label")}>Next</div>
        <p className={cx("rail-next-title")}>Continue with {cardTitle(nextTemplate)}.</p>
        <button className={cx("rail-btn")} id="rail-open-next" type="button" onClick={() => openRequirementFromRail(nextTemplate.external_id)}>
          Open requirement
        </button>
      </>
    );
  } else {
    nextBlock = (
      <>
        <div className={cx("rail-label")}>Next</div>
        <p className={cx("rail-next-title")}>Continue preparing your application.</p>
      </>
    );
  }

  const readyIn = (list: Template[]) => list.filter((t) => st(t) === "ready").length;

  // group the shown items by phase, in phase order
  const byPhase: Record<string, Template[]> = {};
  shown.forEach((t) => (byPhase[t.phase] ||= []).push(t));

  return (
    <div className={cx("screen-app")}>
      <PaymentsMasthead
        subtitle={p.routeSummary}
        subtitleId="app-route-summary"
        left={
          <button className={cx("app-back-link")} id="btn-back-result" type="button" onClick={p.onBackToResult}>
            ← Licence result
          </button>
        }
        right={
          <>
            <button className={cx("link-btn")} id="btn-edit-details" type="button" onClick={p.onEditDetails}>
              Application details
            </button>
            <button className={cx("link-btn")} id="btn-edit-pathway" type="button" onClick={p.onChangeSelections}>
              Change selections
            </button>
            <button className={cx("link-btn")} id="btn-restart" type="button" onClick={p.onRestart}>
              Restart
            </button>
          </>
        }
      />

      <div className={cx("app-tabs")} id="workspace-tabs">
        <button className={cx("app-tab" + (tab === "checklist" ? " active" : ""))} type="button" onClick={() => setTab("checklist")}>
          Application
        </button>
        <button className={cx("app-tab" + (tab === "documents" ? " active" : ""))} type="button" onClick={() => setTab("documents")}>
          Documents
        </button>
        {review && (
          <button className={cx("app-tab" + (tab === "review" ? " active" : ""))} id="review-tab" type="button" onClick={() => setTab("review")}>
            Review
          </button>
        )}
      </div>

      <div className={cx("app-body")}>
        {tab === "checklist" && (
          <div className={cx("tab-panel active")} id="tab-checklist">
            <nav className={cx("phase-rail")} id="phase-rail">
              <button className={cx("phase-link" + (activePhase === null ? " active" : ""))} type="button" onClick={() => setActivePhase(null)}>
                All requirements
                <span className={cx("pl-count")}>
                  {readyIn(visible)}/{visible.length}
                </span>
              </button>
              {phases.map((ph) => {
                const g = visible.filter((t) => t.phase === ph);
                if (!g.length) return null;
                return (
                  <button key={ph} className={cx("phase-link" + (activePhase === ph ? " active" : ""))} type="button" onClick={() => setActivePhase(ph)}>
                    {phaseLabel(ph)}
                    <span className={cx("pl-count")}>
                      {readyIn(g)}/{g.length}
                    </span>
                  </button>
                );
              })}
            </nav>
            <main className={cx("checklist-main")} id="checklist-main">
              <div className={cx("checklist-toolbar")}>
                <input type="search" id="search-box" placeholder="Search requirements…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className={cx("filter-group")} id="filter-group">
                  {(
                    [
                      ["all", "All"],
                      ["remaining", "Remaining"],
                      ["done", "Ready"],
                    ] as [Filter, string][]
                  ).map(([k, label]) => (
                    <button key={k} className={cx("filter-chip" + (filter === k ? " active" : ""))} type="button" onClick={() => setFilter(k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div id="checklist-items">
                {!shown.length && <div className={cx("empty-state")}>No requirements match this view.</div>}
                {phases.map((ph) => {
                  const group = byPhase[ph];
                  if (!group) return null;
                  const ready = readyIn(group);
                  return (
                    <div key={ph}>
                      <div className={cx("phase-heading-row")}>
                        <div>
                          <h3>{phaseLabel(ph)}</h3>
                          <p>
                            {ready} of {group.length} ready
                          </p>
                        </div>
                      </div>
                      <div className={cx("phase-progress-bar")}>
                        <div className={cx("phase-progress-fill")} style={{ width: (group.length ? Math.round((100 * ready) / group.length) : 0) + "%" }}></div>
                      </div>
                      {group.map((t) => (
                        <ReqCard
                          key={t.external_id}
                          t={t}
                          status={st(t)}
                          ctx={ctx}
                          onInfo={() => setDrawer({ kind: "guidance", id: t.external_id })}
                          onOpen={() => setDrawer({ kind: "editor", id: t.external_id })}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </main>
            <aside className={cx("application-rail")} id="application-rail" aria-label="Application progress">
              <section className={cx("rail-card")}>
                <div className={cx("rail-label")}>Progress</div>
                <div className={cx("rail-number")}>{summary.pct}%</div>
                <div className={cx("rail-progress")}>
                  <span style={{ width: summary.pct + "%" }}></span>
                </div>
                <div className={cx("rail-stat")}>
                  <span>Ready</span>
                  <strong>{summary.ready}</strong>
                </div>
                <div className={cx("rail-stat")}>
                  <span>In progress</span>
                  <strong>{summary.inProgress}</strong>
                </div>
                <div className={cx("rail-stat")}>
                  <span>Remaining</span>
                  <strong>{summary.remaining}</strong>
                </div>
              </section>
              <section className={cx("rail-card")}>
                <div className={cx("rail-label")}>Files</div>
                <div className={cx("rail-file-count")}>{fileRows.length}</div>
                <button className={cx("rail-btn")} id="rail-open-documents" type="button" onClick={() => setTab("documents")}>
                  Open documents
                </button>
              </section>
              <section className={cx("rail-card")}>{nextBlock}</section>
              <section className={cx("rail-card")}>
                <div className={cx("rail-label")}>Expert support</div>
                {review ? (
                  <>
                    <div className={cx("expert-support-status")}>Review requested</div>
                    <p className={cx("rail-copy")}>Ask a question or return to your review.</p>
                  </>
                ) : (
                  <p className={cx("rail-copy")}>Ask a question or request an application review at any stage.</p>
                )}
                <button
                  className={cx("rail-btn" + (summary.complete && !review ? " primary" : ""))}
                  id="rail-expert-support"
                  type="button"
                  onClick={() => setDrawer({ kind: "expert-menu" })}
                >
                  Get expert help
                </button>
              </section>
            </aside>
          </div>
        )}

        {tab === "documents" && (
          <div className={cx("tab-panel active")} id="tab-documents">
            <div className={cx("workspace-wide")} id="documents-wrap">
              <h2>Documents</h2>
              <p className={cx("workspace-intro")}>
                Your uploaded application documents appear here automatically. Replacing a file creates a new version and updates the application used for any expert review.
              </p>
              {!fileRows.length ? (
                <div className={cx("empty-state")}>No documents uploaded yet.</div>
              ) : (
                <table className={cx("docs-table")}>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Requirement</th>
                      <th>Version</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileRows.map((r) => (
                      <tr key={r.id + "|" + r.slot}>
                        <td>
                          <div className={cx("doc-name")}>{r.meta.name}</div>
                          <div className={cx("doc-sub")}>
                            {r.meta.label || r.slot}
                            {r.meta.storagePath && (
                              <button className={cx("doc-view")} type="button" onClick={() => p.onViewFile(r.meta)}>
                                View
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{r.title}</td>
                        <td>v{r.meta.version}</td>
                        <td>{(r.meta.uploadedAt || "").slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className={cx("pack-card")}>
                <h3>Final application pack</h3>
                <p>
                  {summary.complete
                    ? "All visible preparation requirements are complete. Beacon can organise the current final versions into the application pack."
                    : summary.ready +
                      " of " +
                      summary.total +
                      " requirements are ready" +
                      (summary.unresolved
                        ? " and " + summary.unresolved + " application detail" + (summary.unresolved === 1 ? " remains" : "s remain") + " unresolved"
                        : "") +
                      "."}
                </p>
                <button
                  className={cx("work-btn " + (summary.complete ? "primary" : "subtle"))}
                  id="build-pack"
                  type="button"
                  disabled={!summary.complete}
                  onClick={() => summary.complete && p.onBuildPack()}
                >
                  {pack ? "Rebuild application pack" : "Build application pack"}
                </button>
                {pack && (
                  <div className={cx("doc-sub")} style={{ marginTop: 8 }}>
                    Last built {pack.builtAt || ""}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "review" && (
          <div className={cx("tab-panel active")} id="tab-review">
            <div className={cx("workspace-wide")} id="review-wrap">
              {!review ? (
                <>
                  <h2>Review</h2>
                  <p className={cx("workspace-intro")}>No application review has been requested yet.</p>
                </>
              ) : (
                <>
                  <h2>{review.type === "final" ? "Final application review" : "Application review"}</h2>
                  <p className={cx("workspace-intro")}>
                    {review.type === "final"
                      ? "The expert is reviewing the full application before submission."
                      : "The expert is reviewing the application as it stood when the review was requested and can flag issues while you continue preparing it."}
                  </p>
                  <div className={cx("review-overview")}>
                    <div className={cx("review-overview-top")}>
                      <div>
                        <h3>{review.type === "final" ? "Final review requested" : "Review requested"}</h3>
                        <div className={cx("doc-sub")}>
                          Requested {(review.requestedAt || "").slice(0, 10) || "today"} at {String(review.requestedProgress || 0)}% progress
                        </div>
                      </div>
                      <span className={cx("review-state requested")}>Requested</span>
                    </div>
                    <div className={cx("review-summary-grid")}>
                      <div className={cx("review-summary-box")}>
                        <strong>
                          {summary.ready}/{summary.total}
                        </strong>
                        <span>requirements ready now</span>
                      </div>
                      <div className={cx("review-summary-box")}>
                        <strong>{fileRows.length}</strong>
                        <span>files in application</span>
                      </div>
                      <div className={cx("review-summary-box")}>
                        <strong>{summary.pct}%</strong>
                        <span>current progress</span>
                      </div>
                    </div>
                    <p className={cx("review-note-block")}>
                      The reviewer can flag issues against a specific requirement or document. You can replace documents or update application details while the review is open.
                    </p>
                    {review.updatedAfterRequest && (
                      <div className={cx("attention-guidance")}>
                        <strong>Application updated</strong>
                        <p>One or more documents or details changed after the review request. The reviewer should use the latest application version.</p>
                      </div>
                    )}
                    <div className={cx("work-card-actions")} style={{ marginTop: 16 }}>
                      <button
                        className={cx("work-btn subtle")}
                        id="cancel-application-review"
                        type="button"
                        onClick={async () => {
                          await p.onCancelReview();
                          setTab("checklist");
                        }}
                      >
                        Cancel review request
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {drawer && <div className={cx("workspace-overlay")} id="workspace-overlay" onClick={closeDrawer}></div>}
      <aside className={cx("workspace-drawer" + (drawer ? " open" : ""))} id="workspace-drawer" aria-hidden={drawer ? "false" : "true"} aria-label="Requirement details">
        <div className={cx("drawer-head")}>
          <div>
            <div className={cx("drawer-eyebrow")} id="drawer-eyebrow">
              {dr.eyebrow}
            </div>
            <h2 id="drawer-title">{dr.title}</h2>
          </div>
          <button className={cx("drawer-close")} id="drawer-close" type="button" aria-label="Close" onClick={closeDrawer}>
            ×
          </button>
        </div>
        <div className={cx("drawer-body")} id="drawer-body">
          {dr.body}
        </div>
      </aside>
    </div>
  );
}

function ReqCard({
  t,
  status,
  ctx,
  onInfo,
  onOpen,
}: {
  t: Template;
  status: ItemStatus;
  ctx: Ctx;
  onInfo: () => void;
  onOpen: () => void;
}) {
  const title = cardTitle(t);
  const summary = cardSummary(t, ctx, status);
  const statusClass = status === "ready" ? "ready" : status === "in_progress" ? "progress" : "not-started";
  const cta = t.short_cta || t.cta_label || "Open";
  void productConfig;
  return (
    <div className={cx("work-card " + (status === "ready" ? "is-ready" : status === "in_progress" ? "is-progress" : ""))} id={"requirement-" + t.external_id}>
      <div className={cx("work-card-top")}>
        <div className={cx("work-card-heading")}>
          <p className={cx("work-card-title")}>{title}</p>
          <button className={cx("work-info-btn")} type="button" aria-label={"Guidance for " + title} onClick={onInfo}>
            i
          </button>
        </div>
        <span className={cx("work-status " + statusClass)}>{STATUS_LABEL[status]}</span>
      </div>
      <p className={cx("work-card-note")}>{t.card_note || t.deliverable || "Complete this requirement."}</p>
      <div className={cx("work-card-actions")}>
        <button className={cx("work-btn " + (status === "ready" ? "subtle" : "primary"))} type="button" onClick={onOpen}>
          {cta}
        </button>
        {summary && <span className={cx("work-summary")}>{summary}</span>}
      </div>
    </div>
  );
}
