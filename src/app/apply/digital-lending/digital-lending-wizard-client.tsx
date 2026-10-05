"use client";

// Public, no-login Digital Lending "Apply" module -- a port of the Beacon
// design prototype (digital_apply.html): landing -> route picker -> workspace
// (Application / Documents / Review / Post-submission tabs, right rail,
// requirement drawers, Expert Support drawer, Record-submission drawer and
// MRD-MoFPED request tracking). The application is anonymous by default
// (member_id null); the visitor's browser remembers which application is theirs
// via localStorage. Requirement forms are data-driven (dl-schemas.ts +
// dl-forms.tsx) and "ready" is evaluated by dl-engine.ts.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./digital-lending-apply.css";
import SchemaForm, { type FormHost } from "./dl-forms";
import {
  captionFor,
  computeStatus,
  labelForSlot,
  latestFileForSlot,
  latestPerSlot,
  schemaFor,
  type Answers,
  type ItemStatus,
} from "./dl-engine";
import { DL_ROUTE_FALLBACK } from "./dl-schemas";
import type {
  LicenceApplicationTemplate,
  LicenceApplicationWizardClass,
  MemberLicenceApplication,
  MemberLicenceApplicationFile,
  MemberLicenceApplicationItemState,
  MemberLicenceApplicationRegulatorRequest,
  MemberLicenceApplicationReview,
} from "@/lib/types";

const STORAGE_KEY = "beaconDigitalLendingApplicationId";
const TOKEN_KEY = "beaconDigitalLendingApplicationToken";
const SUPPORT_KEY = "beaconDigitalLendingSupport";
const BUCKET = "licence-application-files";
const SUBMISSION_ID = "_submission";

const PHASES: [string, string][] = [
  ["business", "Business & licence details"],
  ["people", "People & governance"],
  ["products", "Loan products & funding"],
  ["technology", "Technology & third parties"],
  ["policies", "Policies & controls"],
  ["finalise", "Finalise application"],
];
const PHASE_LABEL = Object.fromEntries(PHASES) as Record<string, string>;

type Screen = "landing" | "route" | "workspace";
type Tab = "application" | "documents" | "review" | "post";
type ExpertContext = "general" | "route" | "workspace" | "requirement";
type Drawer =
  | { kind: "item" | "guide"; id: string }
  | { kind: "expert"; context: ExpertContext; reqId?: string }
  | { kind: "submission" }
  | { kind: "regrequest" }
  | null;
type SupportItem = { type: string; text: string; date: string; context: string };

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private browsing) -- the visitor just can't resume across a reload
  }
}
function readSupport(): SupportItem[] {
  try {
    const v = JSON.parse(lsGet(SUPPORT_KEY) || "[]");
    return Array.isArray(v) ? (v as SupportItem[]) : [];
  } catch {
    return [];
  }
}
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100) || "file";
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DigitalLendingWizardClient({
  applicationKey,
  templates,
  wizardClasses,
}: {
  applicationKey: string;
  templates: LicenceApplicationTemplate[];
  wizardClasses: LicenceApplicationWizardClass[];
}) {
  const router = useRouter();
  const sbRef = useRef(createClient());
  const sb = () => sbRef.current;

  const [screen, setScreen] = useState<Screen>("landing");
  const [application, setApplication] = useState<MemberLicenceApplication | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, MemberLicenceApplicationItemState>>({});
  const [files, setFiles] = useState<Record<string, MemberLicenceApplicationFile[]>>({});
  const [reviews, setReviews] = useState<MemberLicenceApplicationReview[]>([]);
  const [regRequests, setRegRequests] = useState<MemberLicenceApplicationRegulatorRequest[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("application");
  const [activePhase, setActivePhase] = useState("business");
  const [drawer, setDrawerState] = useState<Drawer>(null);
  const [drawerNonce, setDrawerNonce] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyRoute, setBusyRoute] = useState<string | null>(null);
  const [support, setSupport] = useState<SupportItem[]>([]);

  const applicationRef = useRef(application);
  const filesRef = useRef(files);
  const itemStatesRef = useRef(itemStates);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const lastDrawer = useRef<Drawer>(null);
  useEffect(() => {
    applicationRef.current = application;
    filesRef.current = files;
    itemStatesRef.current = itemStates;
  }, [application, files, itemStates]);

  // ------------------------------------------------------------------ data
  const chosenRoute = application?.class_key ?? null;
  const routeClass = wizardClasses.find((c) => c.class_key === chosenRoute) ?? null;
  const routeName =
    routeClass?.fee_class_label ?? (chosenRoute ? DL_ROUTE_FALLBACK[chosenRoute]?.badge : null) ?? "Digital Lending";

  const routeTemplates = useMemo(
    () =>
      chosenRoute
        ? templates
            .filter((t) => t.route_key === null || t.route_key === chosenRoute)
            .sort((a, b) => a.seq - b.seq)
        : [],
    [templates, chosenRoute]
  );
  const schemas = useMemo(() => Object.fromEntries(templates.map((t) => [t.external_id, schemaFor(t)])), [templates]);

  function statusOf(t: LicenceApplicationTemplate): ItemStatus {
    return computeStatus(
      schemas[t.external_id],
      (itemStates[t.external_id]?.answers ?? {}) as Answers,
      files[t.external_id] ?? [],
      chosenRoute
    );
  }

  const total = routeTemplates.length;
  const statuses = routeTemplates.map(statusOf);
  const readyCount = statuses.filter((s) => s === "ready").length;
  const inProgressCount = statuses.filter((s) => s === "in_progress").length;
  const remainingCount = total - readyCount - inProgressCount;
  const pct = total ? Math.round((readyCount / total) * 100) : 0;
  const complete = total > 0 && readyCount === total;
  const nextTemplate = routeTemplates.find((t, i) => statuses[i] !== "ready") ?? null;
  const formTemplate = routeTemplates.find((t) => t.external_id === (chosenRoute === "ml" ? "ML-S2" : "NDT-S2"));
  const feeTemplate = routeTemplates.find((t) => t.external_id === (chosenRoute === "ml" ? "ML-S1" : "NDT-S1"));
  const formReady = formTemplate ? statusOf(formTemplate) === "ready" : false;
  const feeReady = feeTemplate ? statusOf(feeTemplate) === "ready" : false;

  const submitted = application?.status === "submitted";
  const submissionDate = application?.submission_date ?? application?.submitted_at?.slice(0, 10) ?? "";
  const submissionRef = application?.submission_reference ?? "";

  // ------------------------------------------------------------------ boot / resume
  useEffect(() => {
    setSupport(readSupport());
    const t = setTimeout(async () => {
      const id = lsGet(STORAGE_KEY);
      if (!id) return;
      const token = lsGet(TOKEN_KEY);
      if (token) sbRef.current = createClient({ headers: { "x-application-token": token } });
      const { data, error } = await sb().from("member_licence_applications").select("*").eq("id", id).maybeSingle();
      if (error || !data) {
        lsSet(STORAGE_KEY, null);
        lsSet(TOKEN_KEY, null);
        return;
      }
      await loadApplicationData(data as MemberLicenceApplication);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadApplicationData(app: MemberLicenceApplication) {
    setApplication(app);
    applicationRef.current = app;
    const [st, fl, rv, rr] = await Promise.all([
      sb().from("member_licence_application_item_state").select("*").eq("application_id", app.id),
      sb().from("member_licence_application_files").select("*").eq("application_id", app.id),
      sb().from("member_licence_application_reviews").select("*").eq("application_id", app.id).order("requested_at", { ascending: false }),
      sb().from("member_licence_application_regulator_requests").select("*").eq("application_id", app.id).order("created_at", { ascending: true }),
    ]);
    setItemStates(
      Object.fromEntries(((st.data ?? []) as MemberLicenceApplicationItemState[]).map((r) => [r.external_id, r]))
    );
    const byItem: Record<string, MemberLicenceApplicationFile[]> = {};
    ((fl.data ?? []) as MemberLicenceApplicationFile[]).forEach((f) => (byItem[f.external_id] ??= []).push(f));
    setFiles(byItem);
    setReviews((rv.data ?? []) as MemberLicenceApplicationReview[]);
    setRegRequests((rr.data ?? []) as MemberLicenceApplicationRegulatorRequest[]);
  }

  function go(s: Screen) {
    setScreen(s);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ route selection
  async function chooseRoute(classKey: string) {
    setErrorMsg(null);
    setBusyRoute(classKey);
    try {
      if (application) {
        // Switching route keeps the same application: answers and files are keyed
        // by requirement id, so the shared DL-* requirements keep their data.
        if (application.class_key !== classKey) {
          const { error } = await sb().from("member_licence_applications").update({ class_key: classKey }).eq("id", application.id);
          if (error) throw error;
          setApplication({ ...application, class_key: classKey });
        }
      } else {
        const { data, error } = await sb()
          .from("member_licence_applications")
          .insert({ member_id: null, application_key: applicationKey, class_key: classKey, status: "draft" })
          .select("*")
          .single();
        if (error || !data) throw error ?? new Error("no row");
        const row = data as MemberLicenceApplication;
        lsSet(STORAGE_KEY, row.id);
        if (row.access_token) {
          lsSet(TOKEN_KEY, row.access_token);
          sbRef.current = createClient({ headers: { "x-application-token": row.access_token } });
        }
        await loadApplicationData(row);
      }
      setActiveTab("application");
      setActivePhase("business");
      go("workspace");
    } catch (e) {
      console.error("Failed to start application", e);
      setErrorMsg("We couldn’t start your application. Please try again.");
    } finally {
      setBusyRoute(null);
    }
  }

  // ------------------------------------------------------------------ persistence helpers
  async function saveItem(t: LicenceApplicationTemplate, answers: Answers, nextFiles?: MemberLicenceApplicationFile[]): Promise<boolean> {
    const app = applicationRef.current;
    if (!app) return false;
    const status = computeStatus(schemas[t.external_id], answers, nextFiles ?? filesRef.current[t.external_id] ?? [], app.class_key);
    setItemStates((s) => {
      const next = {
        ...s,
        [t.external_id]: {
          id: s[t.external_id]?.id ?? "",
          application_id: app.id,
          external_id: t.external_id,
          answers,
          status,
          updated_at: new Date().toISOString(),
        },
      };
      itemStatesRef.current = next;
      return next;
    });
    const { data, error } = await sb()
      .from("member_licence_application_item_state")
      .upsert({ application_id: app.id, external_id: t.external_id, answers, status }, { onConflict: "application_id,external_id" })
      .select("*")
      .single();
    if (error) {
      console.error("Failed to save requirement", error);
      return false;
    }
    if (data) setItemStates((s) => ({ ...s, [t.external_id]: data as MemberLicenceApplicationItemState }));
    return true;
  }

  async function uploadFile(
    externalId: string,
    slot: string,
    label: string,
    file: File
  ): Promise<MemberLicenceApplicationFile | null> {
    const app = applicationRef.current;
    if (!app) return null;
    const existing = (filesRef.current[externalId] ?? []).filter((f) => f.slot === slot);
    const version = existing.length ? Math.max(...existing.map((f) => f.version)) + 1 : 1;
    const path = `${app.id}/${externalId}/${safeName(slot)}-v${version}-${Date.now()}-${safeName(file.name)}`;
    const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      console.error("Failed to upload file", up.error);
      return null;
    }
    const row = { application_id: app.id, external_id: externalId, slot, file_name: file.name, storage_path: path, version };
    let res = await sb().from("member_licence_application_files").insert({ ...row, label }).select("*").single();
    if (res.error && /label/i.test(`${res.error.message} ${res.error.code}`)) {
      // files.label column not migrated yet -- record the file without it
      res = await sb().from("member_licence_application_files").insert(row).select("*").single();
    }
    if (res.error || !res.data) {
      console.error("Failed to record uploaded file", res.error);
      return null;
    }
    const rec = res.data as MemberLicenceApplicationFile;
    const next = { ...filesRef.current, [externalId]: [...(filesRef.current[externalId] ?? []), rec] };
    filesRef.current = next;
    setFiles(next);
    return rec;
  }

  async function uploadRequirementFile(t: LicenceApplicationTemplate, slot: string, label: string, file: File, answers: Answers) {
    const rec = await uploadFile(t.external_id, slot, label, file);
    if (!rec) return false;
    await saveItem(t, answers, filesRef.current[t.external_id]);
    return true;
  }

  async function deleteSlotFiles(externalId: string, slot: string) {
    const app = applicationRef.current;
    if (!app) return;
    const doomed = (filesRef.current[externalId] ?? []).filter((f) => f.slot === slot);
    if (!doomed.length) return;
    const next = { ...filesRef.current, [externalId]: (filesRef.current[externalId] ?? []).filter((f) => f.slot !== slot) };
    filesRef.current = next;
    setFiles(next);
    await sb().from("member_licence_application_files").delete().eq("application_id", app.id).eq("external_id", externalId).eq("slot", slot);
    await sb().storage.from(BUCKET).remove(doomed.map((f) => f.storage_path));
  }

  async function viewFile(f: MemberLicenceApplicationFile) {
    const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(f.storage_path, 60);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // ------------------------------------------------------------------ drawers
  function setDrawer(next: Drawer) {
    if (next) lastDrawer.current = next;
    setDrawer_(next);
  }
  function setDrawer_(next: Drawer) {
    setDrawerState(next);
    setDrawerNonce((n) => n + 1);
  }
  function openDrawer(next: Drawer) {
    void flushRef.current?.();
    setDrawer(next);
  }
  function closeDrawer() {
    void flushRef.current?.();
    setDrawerState(null);
  }
  const shown: Drawer = drawer ?? lastDrawer.current;

  // ------------------------------------------------------------------ expert / reviews
  async function postExpert(input: { requestType: "question" | "application_review"; message: string; contextLabel: string; externalId?: string }) {
    try {
      const res = await fetch("/api/expert-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceModule: "apply",
          contextKey: "digital-lending-application",
          applicationKey,
          contextLabel: input.contextLabel,
          requestType: input.requestType,
          message: input.message,
          applicationId: applicationRef.current?.id,
          externalId: input.externalId,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function addSupport(item: SupportItem) {
    const next = [...readSupport(), item].slice(-30);
    lsSet(SUPPORT_KEY, JSON.stringify(next));
    setSupport(next);
  }

  async function requestReview(scope: string, reqId?: string): Promise<boolean> {
    const app = applicationRef.current;
    if (!app) return false;
    setErrorMsg(null);
    const review_type = scope === "Final application review" ? "final" : reqId ? "requirement" : "interim";
    const { data, error } = await sb()
      .from("member_licence_application_reviews")
      .insert({ application_id: app.id, scope, review_type, external_id: reqId ?? null, requested_progress: pct })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Failed to record review request", error);
      setErrorMsg("We couldn’t record that review request. Please try again.");
      return false;
    }
    setReviews((r) => [data as MemberLicenceApplicationReview, ...r]);
    void postExpert({
      requestType: "application_review",
      message: `${scope} requested at ${pct}% complete (${readyCount} of ${total} requirements ready).`,
      contextLabel: `${routeName} application`,
      externalId: reqId,
    });
    setDrawerState(null);
    setActiveTab("review");
    return true;
  }

  async function recordSubmission(date: string, reference: string) {
    const app = applicationRef.current;
    if (!app) return false;
    const patch = {
      status: "submitted" as const,
      submitted_at: new Date().toISOString(),
      submission_date: date || today(),
      submission_reference: reference || null,
    };
    const { error } = await sb().from("member_licence_applications").update(patch).eq("id", app.id);
    if (error) {
      console.error("Failed to record submission", error);
      setErrorMsg("We couldn’t record the submission. Please try again.");
      return false;
    }
    setApplication({ ...app, ...patch });
    setDrawerState(null);
    setActiveTab("post");
    return true;
  }

  async function addRegRequest(title: string, due: string) {
    const app = applicationRef.current;
    if (!app) return false;
    const { data, error } = await sb()
      .from("member_licence_application_regulator_requests")
      .insert({ application_id: app.id, title, due_date: due || null })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Failed to add MRD-MoFPED request", error);
      setErrorMsg("We couldn’t add that request. Please try again.");
      return false;
    }
    setRegRequests((r) => [...r, data as MemberLicenceApplicationRegulatorRequest]);
    setDrawerState(null);
    setActiveTab("post");
    return true;
  }

  // ------------------------------------------------------------------ documents
  const documentRows = useMemo(() => {
    const rows: { file: MemberLicenceApplicationFile; title: string; label: string; externalId: string }[] = [];
    for (const t of routeTemplates) {
      const answers = (itemStates[t.external_id]?.answers ?? {}) as Answers;
      for (const f of latestPerSlot(files[t.external_id] ?? [])) {
        rows.push({
          file: f,
          title: t.title,
          label: f.label || labelForSlot(schemas[t.external_id], f.slot, answers) || f.slot,
          externalId: t.external_id,
        });
      }
    }
    for (const f of latestPerSlot(files[SUBMISSION_ID] ?? [])) {
      rows.push({ file: f, title: "Submission", label: f.label || "Submission evidence", externalId: SUBMISSION_ID });
    }
    rows.sort((a, b) => (b.file.uploaded_at ?? "").localeCompare(a.file.uploaded_at ?? ""));
    return rows;
  }, [files, routeTemplates, itemStates, schemas]);

  // ------------------------------------------------------------------ render helpers
  function expertButton(context: ExpertContext, cls: string, label: string) {
    return (
      <button className={cls} data-expert={context} onClick={() => openDrawer({ kind: "expert", context })}>
        {label}
      </button>
    );
  }

  function brandMark() {
    return (
      <svg className="brand-mark" viewBox="0 0 34 34">
        <circle cx="17" cy="17" r="16" fill="none" stroke="#111" strokeWidth="1.5" />
        <path d="M17 6 L17 17 L25 22" stroke="#111" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="17" cy="17" r="2.5" fill="#111" />
      </svg>
    );
  }

  function jumpToPhase(key: string) {
    setActivePhase(key);
    document.getElementById(`phase-${key}`)?.scrollIntoView({ behavior: "smooth" });
  }

  const errorBanner = errorMsg ? (
    <div className="app-error" role="alert">
      {errorMsg}
    </div>
  ) : null;

  // ------------------------------------------------------------------ drawer content
  let drawerEyebrow = "";
  let drawerTitle = "";
  let drawerBody: ReactNode = null;
  let drawerReqId: string | null = null;
  const shownTemplate =
    shown && (shown.kind === "item" || shown.kind === "guide")
      ? templates.find((t) => t.external_id === shown.id) ?? null
      : null;

  if (shown?.kind === "item" && shownTemplate) {
    drawerReqId = shownTemplate.external_id;
    drawerEyebrow = PHASE_LABEL[shownTemplate.phase] ?? "Requirement";
    drawerTitle = shownTemplate.title;
    const host: FormHost = {
      schema: schemas[shownTemplate.external_id],
      route: chosenRoute,
      sourceUrl: shownTemplate.source_url,
      answers: (itemStates[shownTemplate.external_id]?.answers ?? {}) as Answers,
      files: files[shownTemplate.external_id] ?? [],
      onCommit: (a) => saveItem(shownTemplate, a),
      onUpload: (slot, label, file, a) => uploadRequirementFile(shownTemplate, slot, label, file, a),
      onDeleteSlot: (slot) => deleteSlotFiles(shownTemplate.external_id, slot),
      registerFlush: (fn) => {
        flushRef.current = fn;
      },
    };
    drawerBody = <SchemaForm key={`${shownTemplate.external_id}-${drawerNonce}`} host={host} />;
  } else if (shown?.kind === "guide" && shownTemplate) {
    drawerReqId = shownTemplate.external_id;
    drawerEyebrow = "Requirement guidance";
    drawerTitle = shownTemplate.title;
    drawerBody = <GuideBody template={shownTemplate} />;
  } else if (shown?.kind === "expert") {
    drawerEyebrow = "Support";
    drawerTitle = "Expert Support";
    const reqTitle = shown.reqId ? templates.find((t) => t.external_id === shown.reqId)?.title : undefined;
    const contextText = reqTitle
      ? reqTitle
      : shown.context === "route"
        ? "Choosing between Money Lender and NDTMFI"
        : shown.context === "workspace"
          ? `${routeName} application`
          : "Digital Lending licence application";
    drawerBody = (
      <ExpertBody
        key={`expert-${drawerNonce}`}
        contextText={contextText}
        history={support.slice(-3).reverse()}
        hasApplication={!!application}
        onSend={async (text) => {
          const ok = await postExpert({ requestType: "question", message: text, contextLabel: contextText, externalId: shown.reqId });
          if (ok) addSupport({ type: "Question sent", text, date: new Date().toLocaleDateString(), context: contextText });
          return ok;
        }}
        onReview={async () => {
          const scope = shown.reqId && reqTitle ? `Review: ${reqTitle}` : "Application review";
          if (application) return requestReview(scope, shown.reqId);
          const ok = await postExpert({ requestType: "application_review", message: `${scope} requested.`, contextLabel: contextText });
          if (ok) addSupport({ type: "Review requested", text: scope, date: new Date().toLocaleDateString(), context: contextText });
          return ok;
        }}
      />
    );
  } else if (shown?.kind === "submission") {
    drawerEyebrow = "Finalise application";
    drawerTitle = "Record submission";
    drawerBody = (
      <SubmissionBody
        key={`sub-${drawerNonce}`}
        initialDate={submitted ? submissionDate : today()}
        initialRef={submissionRef}
        evidence={latestFileForSlot(files[SUBMISSION_ID] ?? [], "evidence")}
        onUpload={async (file) => !!(await uploadFile(SUBMISSION_ID, "evidence", "Submission evidence", file))}
        onSave={recordSubmission}
      />
    );
  } else if (shown?.kind === "regrequest") {
    drawerEyebrow = "Post-submission";
    drawerTitle = "Add MRD-MoFPED request";
    drawerBody = <RegRequestBody key={`rr-${drawerNonce}`} onSave={addRegRequest} />;
  }

  const hasReview = reviews.length > 0;

  // ================================================================== screens
  let content: ReactNode;

  if (screen === "landing") {
    content = (
      <section className="screen active" id="screen-landing">
        <header className="masthead">
          <div className="brand">
            {brandMark()}
            <div>
              <span className="brand-title">Beacon</span>
              <span className="brand-sub">Digital Lending Licence Application</span>
            </div>
          </div>
          <div className="mast-actions">
            <button className="link-btn" id="digital-applications" type="button" onClick={() => router.push("/apply")}>
              ← Applications
            </button>
            {expertButton("general", "link-btn", "Expert Support")}
          </div>
        </header>
        <main className="landing">
          <div className="eyebrow">Licence Application Manager</div>
          <h1>Prepare your digital lending licence application.</h1>
          <p className="dek">
            Build a Money Lender or NDTMFI application step by step, keep your supporting documents together, and get expert
            help when you need it.
          </p>
          <div className="hero-actions">
            <button className="btn primary" id="start-application" onClick={() => go("route")}>
              Start application →
            </button>
            {application?.class_key && (
              <button className="btn" id="resume-application" onClick={() => go("workspace")}>
                Resume application
              </button>
            )}
            {expertButton("general", "text-link support-inline", "Speak to an expert")}
          </div>
          <div className="landing-note">
            <strong>Already know your licence route?</strong>
            <p>
              You will choose Money Lender or Non-Deposit-Taking Microfinance Institution next. If you are unsure, Expert
              Support can help before you begin.
            </p>
          </div>
        </main>
      </section>
    );
  } else if (screen === "route") {
    const routes = wizardClasses.length
      ? wizardClasses
      : (Object.keys(DL_ROUTE_FALLBACK).map((k) => ({ class_key: k, label: DL_ROUTE_FALLBACK[k].title })) as LicenceApplicationWizardClass[]);
    content = (
      <section className="screen active" id="screen-route">
        <header className="masthead">
          <div className="brand">
            {brandMark()}
            <div>
              <span className="brand-title">Digital Lending Licence Application</span>
              <span className="brand-sub">Choose licence route</span>
            </div>
          </div>
          <div className="mast-actions">
            <button className="link-btn" id="route-to-landing" onClick={() => go("landing")}>
              ← Back
            </button>
            {expertButton("route", "link-btn", "Expert Support")}
          </div>
        </header>
        <main className="route-wrap">
          {errorBanner}
          <div className="eyebrow">Choose your route</div>
          <h2>Which licence are you applying for?</h2>
          <p className="intro">
            Choose the application you want Beacon to help you prepare. If you are not sure which route applies, get help
            before building the checklist.
          </p>
          <div className="route-grid">
            {routes.map((c) => {
              const fb = DL_ROUTE_FALLBACK[c.class_key];
              return (
                <article className="route-card" key={c.class_key}>
                  <div className="route-tag">{c.route_tag ?? fb?.tag ?? ""}</div>
                  <h3>{c.card_title ?? fb?.title ?? c.label}</h3>
                  <p>{c.card_blurb ?? fb?.blurb ?? c.description ?? ""}</p>
                  <button
                    className="btn primary"
                    data-select-route={c.class_key}
                    disabled={busyRoute !== null}
                    onClick={() => void chooseRoute(c.class_key)}
                  >
                    Use this route →
                  </button>
                </article>
              );
            })}
          </div>
          <div className="route-help">
            <div>
              <strong>Not sure which licence applies?</strong>
              <p>Get help choosing before Beacon builds your application.</p>
            </div>
            {expertButton("route", "btn", "Speak to an expert")}
          </div>
        </main>
      </section>
    );
  } else {
    const phaseGroups = PHASES.map(([key, label]) => ({
      key,
      label,
      items: routeTemplates.filter((t) => t.phase === key),
    })).filter((g) => g.items.length);

    content = (
      <section className="screen active" id="screen-app">
        <header className="workspace-head">
          <div className="workspace-head-left">
            <button className="back-btn" id="app-back-route" onClick={() => go("route")}>
              ← Licence route
            </button>
            <span className="workspace-title">Digital Lending Licence Application</span>
            <span className="route-badge" id="route-badge">
              {routeName}
            </span>
          </div>
          <div className="workspace-head-right">{expertButton("workspace", "ghost-btn", "Expert Support")}</div>
        </header>
        <nav className="workspace-tabs">
          <button className={`app-tab${activeTab === "application" ? " active" : ""}`} data-tab="application" onClick={() => setActiveTab("application")}>
            Application
          </button>
          <button className={`app-tab${activeTab === "documents" ? " active" : ""}`} data-tab="documents" onClick={() => setActiveTab("documents")}>
            Documents
          </button>
          <button
            className={`app-tab${activeTab === "review" ? " active" : ""}${hasReview ? "" : " hidden"}`}
            id="review-tab-button"
            data-tab="review"
            onClick={() => setActiveTab("review")}
          >
            Review
          </button>
          <button
            className={`app-tab${activeTab === "post" ? " active" : ""}${submitted ? "" : " hidden"}`}
            id="post-tab-button"
            data-tab="post"
            onClick={() => setActiveTab("post")}
          >
            Post-submission
          </button>
        </nav>
        {errorBanner}
        <div className="workspace-grid">
          <aside className="phase-nav" id="phase-nav">
            <div className="phase-label">Application</div>
            {PHASES.map(([key, label]) => (
              <button key={key} className={`phase-btn${activePhase === key ? " active" : ""}`} data-phase-jump={key} onClick={() => jumpToPhase(key)}>
                {label}
              </button>
            ))}
          </aside>
          <main className="app-main">
            <section className={`tab-panel${activeTab === "application" ? " active" : ""}`} id="tab-application">
              <h1>Your application</h1>
              <p className="workspace-intro" id="workspace-intro">
                Prepare the {routeName} application requirement by requirement. Beacon only shows work that belongs in this
                route.
              </p>
              <div id="application-sections">
                {phaseGroups.map((g) => (
                  <section className="phase-section" id={`phase-${g.key}`} key={g.key}>
                    <h2>{g.label}</h2>
                    <div className="req-list">
                      {g.items.map((t) => {
                        const s = statusOf(t);
                        const cap = captionFor(
                          schemas[t.external_id].caption,
                          (itemStates[t.external_id]?.answers ?? {}) as Answers,
                          files[t.external_id] ?? []
                        );
                        const cls = s === "ready" ? "ready" : s === "in_progress" ? "inprogress" : "not";
                        return (
                          <article className="req-card" key={t.external_id} data-req={t.external_id}>
                            <div>
                              <div className="req-title-line">
                                <span className="req-title">{t.title}</span>
                                <button className="info-btn" data-guide={t.external_id} aria-label={`About ${t.title}`} onClick={() => openDrawer({ kind: "guide", id: t.external_id })}>
                                  i
                                </button>
                              </div>
                              <div className="req-copy">{t.copy}</div>
                              {cap && <div className="req-progress">{cap}</div>}
                            </div>
                            <span className={`status ${cls}`}>
                              {s === "ready" ? "Ready to submit" : s === "in_progress" ? "In progress" : "Not started"}
                            </span>
                            <button className="req-action" data-open={t.external_id} onClick={() => openDrawer({ kind: "item", id: t.external_id })}>
                              {t.cta_label ?? "Open requirement"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              <div id="readiness-wrap">
                <div className="readiness-card">
                  <h3>Application readiness</h3>
                  <p>Use this summary when you are ready to review the complete application before submission.</p>
                  <div className="readiness-row">
                    <span>All application requirements</span>
                    <span className={complete ? "ok" : "notok"}>{complete ? "Complete" : `${readyCount}/${total} ready`}</span>
                  </div>
                  <div className="readiness-row">
                    <span>Prescribed form signed</span>
                    <span className={formReady ? "ok" : "notok"}>{formReady ? "Ready" : "Not ready"}</span>
                  </div>
                  <div className="readiness-row">
                    <span>Application fee evidence</span>
                    <span className={feeReady ? "ok" : "notok"}>{feeReady ? "Ready" : "Not ready"}</span>
                  </div>
                  <div className="drawer-actions">
                    <button className="save-btn" data-final-review disabled={!complete} onClick={() => void requestReview("Final application review")}>
                      Request final review
                    </button>
                    {complete && (
                      <button className="subtle-btn" id="record-submission" onClick={() => openDrawer({ kind: "submission" })}>
                        Record submission
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className={`tab-panel${activeTab === "documents" ? " active" : ""}`} id="tab-documents">
              <div className="docs-head">
                <h2>Documents</h2>
                <p className="workspace-intro">Files added while preparing the application appear here automatically.</p>
              </div>
              {documentRows.length === 0 ? (
                <div className="empty">No documents have been added yet.</div>
              ) : (
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Requirement</th>
                      <th>Version</th>
                      <th>Added</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentRows.map((r) => (
                      <tr key={r.file.id}>
                        <td>
                          <div className="docs-name">{r.file.file_name}</div>
                          <div className="docs-sub">{r.label}</div>
                        </td>
                        <td>{r.title}</td>
                        <td>v{r.file.version}</td>
                        <td>{(r.file.uploaded_at ?? "").slice(0, 10)}</td>
                        <td>
                          {r.externalId !== SUBMISSION_ID && (
                            <button
                              className="open-req"
                              data-doc-open={r.externalId}
                              onClick={() => {
                                setActiveTab("application");
                                openDrawer({ kind: "item", id: r.externalId });
                              }}
                            >
                              Open requirement
                            </button>
                          )}
                          {r.externalId === SUBMISSION_ID && (
                            <button className="open-req" onClick={() => void viewFile(r.file)}>
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className={`tab-panel${activeTab === "review" ? " active" : ""}`} id="tab-review">
              <div className="review-head">
                <h2>Expert review</h2>
                <p className="workspace-intro">Review requests and requirement-level issues appear here.</p>
              </div>
              {reviews.length === 0 ? (
                <div className="empty">No review has been requested.</div>
              ) : (
                reviews.map((r) => (
                  <div className="review-card" key={r.id}>
                    <div className="review-top">
                      <div>
                        <h3>{r.scope}</h3>
                        <p>Requested {new Date(r.requested_at).toLocaleDateString()}</p>
                      </div>
                      <span className="review-state">Requested</span>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className={`tab-panel${activeTab === "post" ? " active" : ""}`} id="tab-post">
              <div className="post-head">
                <h2>Post-submission</h2>
                <p className="workspace-intro">Track the submitted application and any subsequent MRD-MoFPED requests.</p>
              </div>
              {!submitted ? (
                <div className="empty">Record the application submission to start post-submission tracking.</div>
              ) : (
                <>
                  <div className="post-card">
                    <div className="post-top">
                      <div>
                        <h3>Application submitted</h3>
                        <p>
                          {submissionDate}
                          {submissionRef ? ` · Reference ${submissionRef}` : ""}
                        </p>
                      </div>
                      <span className="review-state">Submitted</span>
                    </div>
                  </div>
                  <div className="post-card">
                    <h3>MRD-MoFPED requests</h3>
                    <p>Add a request only when the regulator asks for additional information after submission.</p>
                    <div className="drawer-actions">
                      <button className="subtle-btn" id="add-reg-request" onClick={() => openDrawer({ kind: "regrequest" })}>
                        Add request
                      </button>
                    </div>
                  </div>
                  {regRequests.map((x) => (
                    <div className="post-card" key={x.id}>
                      <h3>{x.title}</h3>
                      <p>
                        Due {x.due_date || "Not set"} · {x.closed_at ? "Response recorded" : "Open"}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </section>
          </main>

          <aside className="right-rail" id="right-rail">
            <section className="rail-card">
              <div className="rail-label">Progress</div>
              <div className="rail-number">{pct}%</div>
              <div className="rail-progress">
                <span style={{ width: `${pct}%` }}></span>
              </div>
              <div className="rail-stat">
                <span>Ready</span>
                <strong>{readyCount}</strong>
              </div>
              <div className="rail-stat">
                <span>In progress</span>
                <strong>{inProgressCount}</strong>
              </div>
              <div className="rail-stat">
                <span>Remaining</span>
                <strong>{remainingCount}</strong>
              </div>
            </section>
            <section className="rail-card">
              <div className="rail-label">Next</div>
              <div className="rail-next">
                {nextTemplate ? (
                  <>
                    Continue with <strong>{nextTemplate.title}</strong>.
                  </>
                ) : (
                  "Your applicant-side requirements are complete."
                )}
              </div>
              {nextTemplate ? (
                <button className="rail-btn" id="open-next" onClick={() => openDrawer({ kind: "item", id: nextTemplate.external_id })}>
                  Open requirement
                </button>
              ) : (
                <button className="rail-btn primary" id="rail-final-review" onClick={() => void requestReview("Final application review")}>
                  Request final review
                </button>
              )}
            </section>
            <section className="rail-card">
              <div className="rail-label">Expert Support</div>
              <div className="rail-next">Ask a question or request a review at any stage.</div>
              {expertButton("workspace", "rail-btn", "Ask a question")}
              <button className="rail-btn" id="rail-review" onClick={() => void requestReview("Application review")}>
                Request application review
              </button>
            </section>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <div className="dl-apply">
      {content}
      <div className={`overlay${drawer ? " open" : ""}`} id="overlay" onClick={closeDrawer}></div>
      <aside className={`drawer${drawer ? " open" : ""}`} id="drawer" aria-hidden={!drawer} role="dialog" aria-label={drawerTitle || "Drawer"}>
        <div className="drawer-head">
          <div>
            <div className="drawer-eyebrow" id="drawer-eyebrow">
              {drawerEyebrow}
            </div>
            <h2 id="drawer-title">{drawerTitle}</h2>
          </div>
          <button className="drawer-close" id="drawer-close" aria-label="Close" onClick={closeDrawer}>
            ×
          </button>
        </div>
        <div className="drawer-body" id="drawer-body">
          {drawerBody}
        </div>
        <div className="drawer-footer" id="drawer-footer">
          <button
            className={`text-link${drawerReqId ? "" : " hidden"}`}
            id="drawer-expert"
            onClick={() => drawerReqId && openDrawer({ kind: "expert", context: "requirement", reqId: drawerReqId })}
          >
            Ask an expert about this requirement
          </button>
          <button className="subtle-btn" id="drawer-done" onClick={closeDrawer}>
            Close
          </button>
        </div>
      </aside>
      {/* Keep a plain link to the Apply hub in the DOM for crawlers / no-JS users. */}
      <noscript>
        <Link href="/apply">Applications</Link>
      </noscript>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer bodies
// ---------------------------------------------------------------------------

function GuideBody({ template }: { template: LicenceApplicationTemplate }) {
  return (
    <>
      <div className="guide-block">
        <div className="guide-label">What this is</div>
        <div className="guide-text">{template.guide_what}</div>
      </div>
      <div className="guide-block">
        <div className="guide-label">What you need to do</div>
        <div className="guide-text">{template.guide_do}</div>
      </div>
      <div className="guide-block">
        <div className="guide-label">What good evidence looks like</div>
        <div className="guide-text">{template.guide_evidence}</div>
      </div>
      {template.source_url && (
        <div className="guide-block">
          <div className="guide-label">Source</div>
          <a className="source-link" href={template.source_url} target="_blank" rel="noopener noreferrer">
            {template.source_label ?? "Source"} ↗
          </a>
        </div>
      )}
    </>
  );
}

function ExpertBody({
  contextText,
  history,
  hasApplication,
  onSend,
  onReview,
}: {
  contextText: string;
  history: SupportItem[];
  hasApplication: boolean;
  onSend: (text: string) => Promise<boolean>;
  onReview: () => Promise<boolean>;
}) {
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  return (
    <>
      <div className="support-context">
        <strong>Context</strong>
        <p>{contextText}</p>
      </div>
      <div className="drawer-section">
        <h3>Ask a question</h3>
        <div className="field">
          <textarea id="expert-question" placeholder="What do you need help with?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        </div>
        <button
          className="save-btn"
          id="send-question"
          disabled={sending}
          onClick={async () => {
            const q = question.trim();
            if (!q) return;
            setSending(true);
            setNote(null);
            const ok = await onSend(q);
            setSending(false);
            if (ok) setQuestion("");
            else setNote("We couldn’t send that question. Please try again.");
          }}
        >
          Send question
        </button>
        {note && <p className="form-hint">{note}</p>}
      </div>
      <div className="drawer-section">
        <h3>Application review</h3>
        <p>
          Request a review of the application as it stands now. A final review becomes most useful when the applicant-side
          requirements are complete.
        </p>
        <button
          className="subtle-btn"
          id="support-review"
          onClick={async () => {
            setReviewNote(null);
            const sent = await onReview();
            if (sent && !hasApplication) setReviewNote("Review request sent to Expert Support.");
            else if (!sent) setReviewNote("We couldn’t send that review request. Please try again.");
          }}
        >
          Request application review
        </button>
        {reviewNote && <p className="form-hint">{reviewNote}</p>}
      </div>
      {history.length > 0 && (
        <div className="support-history">
          <div className="guide-label">Recent support</div>
          {history.map((x, i) => (
            <div className="support-item" key={`${x.date}-${i}`}>
              <strong>{x.type}</strong>
              <p>
                {x.text} · {x.date}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function SubmissionBody({
  initialDate,
  initialRef,
  evidence,
  onUpload,
  onSave,
}: {
  initialDate: string;
  initialRef: string;
  evidence: MemberLicenceApplicationFile | null;
  onUpload: (file: File) => Promise<boolean>;
  onSave: (date: string, reference: string) => Promise<boolean>;
}) {
  const [date, setDate] = useState(initialDate);
  const [reference, setReference] = useState(initialRef);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="sub-date">Submission date</label>
          <input id="sub-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sub-ref">Reference number (if available)</label>
          <input id="sub-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="upload">
        <div className="upload-top">
          <div>
            <label className="upload-title" htmlFor="sub-evidence">
              Submission evidence
            </label>
            {busy ? (
              <div className="upload-meta">Uploading…</div>
            ) : err ? (
              <div className="upload-meta err">That file couldn’t be uploaded. Please try again.</div>
            ) : evidence ? (
              <div className="upload-meta">
                {evidence.file_name} · v{evidence.version}
              </div>
            ) : null}
          </div>
          <input
            id="sub-evidence"
            className="file-input"
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              setBusy(true);
              setErr(false);
              const okUp = await onUpload(file);
              setBusy(false);
              setErr(!okUp);
              input.value = "";
            }}
          />
        </div>
      </div>
      <div className="drawer-actions">
        <button className="save-btn" id="save-sub" onClick={() => void onSave(date, reference.trim())}>
          Record submission
        </button>
      </div>
    </>
  );
}

function RegRequestBody({ onSave }: { onSave: (title: string, due: string) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [hint, setHint] = useState(false);
  return (
    <>
      <div className="field">
        <label htmlFor="rr-title">Request / subject</label>
        <input id="rr-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="rr-due">Due date</label>
        <input id="rr-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div className="drawer-actions">
        <button
          className="save-btn"
          id="save-rr"
          onClick={() => {
            if (!title.trim()) {
              setHint(true);
              return;
            }
            void onSave(title.trim(), due);
          }}
        >
          Add request
        </button>
      </div>
      {hint && !title.trim() && <p className="form-hint">Enter the request or subject first.</p>}
    </>
  );
}
