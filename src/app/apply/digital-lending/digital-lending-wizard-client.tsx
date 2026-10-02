"use client";

import { useMemo, useState, useEffect, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./digital-lending-workspace.module.css";
import type {
  LicenceApplicationDrawerType,
  LicenceApplicationFeeTier,
  LicenceApplicationTemplate,
  LicenceApplicationWizardClass,
  MemberLicenceApplication,
  MemberLicenceApplicationFile,
  MemberLicenceApplicationItemState,
} from "@/lib/types";

// Public, no-login Digital Lending "Apply" wizard. The application it builds
// is anonymous by default (member_id stays null; RLS on
// member_licence_applications scopes an anonymous row to anyone who knows
// its own id) -- the visitor's browser is the only thing that remembers
// which application is theirs, via STORAGE_KEY. See
// strategy/beacon-template-redesign-plan.md §9.1 for the audited 21-item
// Digital Lending schema this reads.
//
// The wizard screen's presentation is ported 1:1 from the Beacon prototype
// at /tmp/beacon-digital-src.html's #screen-app workspace (masthead +
// tabs + phase-nav + req-cards + right rail + slide-in drawer) -- see
// digital-lending-workspace.module.css for the ported CSS. Every Supabase
// query, upload handler and status computation below is unchanged from the
// previous generic-shell version; only how it's rendered changed.

const STORAGE_KEY = "beaconDigitalLendingApplicationId";
const BUCKET = "licence-application-files";

const PHASE_ORDER = ["business", "people", "products", "technology", "policies", "finalise"] as const;
type Phase = (typeof PHASE_ORDER)[number];
// Exact prototype phase labels (see PHASES in the source HTML) -- PHASE_ORDER
// maps 1:1 in order to the prototype's own PHASES array.
const PHASE_LABELS: Record<Phase, string> = {
  business: "Business & licence details",
  people: "People & governance",
  products: "Loan products & funding",
  technology: "Technology & third parties",
  policies: "Policies & controls",
  finalise: "Finalise application",
};

type ItemStatus = "not_started" | "in_progress" | "ready";
// "landing" / "unlisted" / "expert" / "sandbox" / "result" are the
// pre-workspace "assessment" front door ported from the Beacon prototype's
// Payments module (screen-landing / screen-unlisted / screen-expert /
// screen-sandbox / screen-result) -- see payments-wizard-client.tsx's Screen
// type comment for the full rationale. Digital Lending has no separate
// "facts" gating step, so the order here is simpler: landing -> route ->
// (unlisted -> expert | sandbox, optional detour) -> result -> wizard.
// "sandbox" here is MRD's own equivalent, not BOU's NPS Regulatory Sandbox --
// see SandboxScreen's copy below.
type Screen = "loading" | "landing" | "route" | "unlisted" | "expert" | "sandbox" | "result" | "wizard" | "submitted";

type PersonRow = { rowId: string; name: string; role: string; nationalId: string; address: string };

type ApplicationReview = {
  status: string;
  type: "interim" | "final";
  requestedAt: string;
  requestedProgress: number;
};

// A drawer can host a requirement's own editing form ("item"), its
// guidance ("guide", the info-button popover -- built as a drawer rather
// than a floating popover, since this codebase already has a drawer/overlay
// mechanism and every other Beacon workspace on this site uses it the same
// way), or the Expert Support panel ("expert", optionally scoped to a
// requirement when opened via a requirement's own "Ask an expert" link).
type DrawerState = { kind: "item" | "guide"; externalId: string } | { kind: "expert"; externalId?: string } | null;

function isFilled(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return true;
  return v != null;
}

function newRowId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function latestFileForSlot(itemFiles: MemberLicenceApplicationFile[], slot: string): MemberLicenceApplicationFile | null {
  const matches = itemFiles.filter((f) => f.slot === slot);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.version >= b.version ? a : b));
}

function computeStatus(
  drawerType: LicenceApplicationDrawerType,
  answers: Record<string, unknown>,
  itemFiles: MemberLicenceApplicationFile[],
  isFeeItem: boolean
): ItemStatus {
  const ready = computeReady(drawerType, answers, itemFiles, isFeeItem);
  if (ready) return "ready";
  const hasAnyAnswer = Object.values(answers).some((v) => (Array.isArray(v) ? v.length > 0 : isFilled(v)));
  const hasAnyFile = itemFiles.length > 0;
  return hasAnyAnswer || hasAnyFile ? "in_progress" : "not_started";
}

function computeReady(
  drawerType: LicenceApplicationDrawerType,
  answers: Record<string, unknown>,
  itemFiles: MemberLicenceApplicationFile[],
  isFeeItem: boolean
): boolean {
  switch (drawerType) {
    case "company_registration":
      return isFilled(answers.legalName) && isFilled(answers.registrationNumber) && !!latestFileForSlot(itemFiles, "certificate");
    case "premises":
      return isFilled(answers.physicalAddress) && isFilled(answers.operatingArea);
    case "org_structure":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "org_chart");
    case "capital":
      return isFilled(answers.paidUpCapital) && isFilled(answers.auditorName);
    case "people": {
      const people = Array.isArray(answers.people) ? (answers.people as PersonRow[]) : [];
      return (
        people.length > 0 &&
        people.every((p) => isFilled(p.name) && isFilled(p.role) && !!latestFileForSlot(itemFiles, `id-${p.rowId}`))
      );
    }
    case "declarations": {
      const keys = ["receivership", "investigations", "litigation", "relatedParty"];
      return keys.every((k) => {
        const v = answers[k];
        if (v !== "yes" && v !== "no") return false;
        if (v === "yes") return isFilled(answers[`${k}Explanation`]);
        return true;
      });
    }
    case "official_form":
      return !!latestFileForSlot(itemFiles, "signed_form");
    case "product_desc":
    case "source_funds":
    case "lending_agreement":
    case "it_controls":
    case "generic_upload":
    case "data_protection":
    case "governance":
      if (isFeeItem) return itemFiles.length > 0;
      return isFilled(answers.description) && itemFiles.length > 0;
    default:
      return false;
  }
}

// A short "N added" caption under a requirement's title on the req-card,
// mirroring the prototype's own progressText() function. Repeatable-row
// drawer types get a count; everything else falls back to a file count.
function progressTextFor(
  template: LicenceApplicationTemplate,
  answers: Record<string, unknown>,
  itemFiles: MemberLicenceApplicationFile[]
): string {
  if (template.drawer_type === "people") {
    const people = Array.isArray(answers.people) ? (answers.people as PersonRow[]) : [];
    return people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} added` : "";
  }
  const slots = new Set(itemFiles.map((f) => f.slot)).size;
  return slots ? `${slots} file${slots === 1 ? "" : "s"} added` : "";
}

function readApplicationReview(facts: Record<string, unknown> | undefined): ApplicationReview | null {
  const v = facts?.applicationReview;
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.status !== "requested") return null;
  return {
    status: "requested",
    type: r.type === "final" ? "final" : "interim",
    requestedAt: typeof r.requestedAt === "string" ? r.requestedAt : "",
    requestedProgress: typeof r.requestedProgress === "number" ? r.requestedProgress : 0,
  };
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function DigitalLendingWizardClient({
  applicationKey,
  templates,
  wizardClasses,
  feeTiers,
}: {
  applicationKey: string;
  templates: LicenceApplicationTemplate[];
  wizardClasses: LicenceApplicationWizardClass[];
  feeTiers: LicenceApplicationFeeTier[];
}) {
  const supabase = createClient();

  const [screen, setScreen] = useState<Screen>("loading");
  const [application, setApplication] = useState<MemberLicenceApplication | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, MemberLicenceApplicationItemState>>({});
  const [files, setFiles] = useState<Record<string, MemberLicenceApplicationFile[]>>({});
  const [activePhase, setActivePhase] = useState<Phase>("business");
  const [activeTab, setActiveTab] = useState<"application" | "documents" | "review">("application");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [creatingRoute, setCreatingRoute] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Route chosen on the "route" screen but not yet committed to the
  // database -- the new "result" confirmation screen sits between picking a
  // route and actually creating the application (mirrors Payments'
  // classify-then-result flow; previously chooseRoute() created the
  // application immediately on the route card's own click).
  const [pendingRouteKey, setPendingRouteKey] = useState<string | null>(null);

  async function loadApplicationData(appRow: MemberLicenceApplication) {
    setApplication(appRow);
    const [{ data: stateRows }, { data: fileRows }] = await Promise.all([
      supabase.from("member_licence_application_item_state").select("*").eq("application_id", appRow.id),
      supabase.from("member_licence_application_files").select("*").eq("application_id", appRow.id),
    ]);
    setItemStates(
      Object.fromEntries(((stateRows ?? []) as MemberLicenceApplicationItemState[]).map((r) => [r.external_id, r]))
    );
    const byItem: Record<string, MemberLicenceApplicationFile[]> = {};
    ((fileRows ?? []) as MemberLicenceApplicationFile[]).forEach((f) => {
      (byItem[f.external_id] ??= []).push(f);
    });
    setFiles(byItem);
    setScreen(appRow.status === "submitted" ? "submitted" : "wizard");
  }

  async function resume() {
    let id: string | null = null;
    try {
      id = localStorage.getItem(STORAGE_KEY);
    } catch {
      id = null;
    }
    if (!id) {
      setScreen("landing");
      return;
    }
    const { data, error } = await supabase.from("member_licence_applications").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setScreen("landing");
      return;
    }
    // loadApplicationData always sends an existing application straight to
    // "wizard"/"submitted" -- override that here so a fresh page load always
    // shows the landing front door first (matching the prototype), with
    // "Resume my checklist" taking the visitor straight to their workspace.
    await loadApplicationData(data as MemberLicenceApplication);
    setScreen((s) => (s === "wizard" ? "landing" : s));
  }

  // Kick off resume() from a macrotask rather than calling it bare -- keeps
  // the mount effect's own body free of any (transitively) synchronous
  // setState call, satisfying react-hooks/set-state-in-effect.
  useEffect(() => {
    const timer = setTimeout(() => {
      resume();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecting a route card no longer creates the application immediately --
  // it just holds the choice and shows the new "result" confirmation screen
  // (fee + route summary) first. The application is only actually created
  // when the visitor confirms via confirmRoute() below.
  function selectRoute(classKey: string) {
    setPendingRouteKey(classKey);
    setScreen("result");
  }

  async function confirmRoute() {
    if (!pendingRouteKey) return;
    setErrorMsg(null);
    setCreatingRoute(pendingRouteKey);
    const { data, error } = await supabase
      .from("member_licence_applications")
      .insert({ member_id: null, application_key: applicationKey, class_key: pendingRouteKey, status: "draft" })
      .select("*")
      .single();
    setCreatingRoute(null);
    if (error || !data) {
      console.error("Failed to start application", error);
      setErrorMsg("We couldn't start your application. Please try again.");
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, (data as MemberLicenceApplication).id);
    } catch {
      // localStorage unavailable (private browsing, etc.) -- the applicant
      // just won't be able to resume across a full reload.
    }
    await loadApplicationData(data as MemberLicenceApplication);
  }

  function startOver() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setApplication(null);
    setItemStates({});
    setFiles({});
    setActiveTab("application");
    setDrawer(null);
    setActivePhase("business");
    setPendingRouteKey(null);
    setScreen("landing");
  }

  async function saveItem(externalId: string, patch: { answers: Record<string, unknown>; status: ItemStatus }) {
    if (!application) return;
    setItemStates((s) => ({
      ...s,
      [externalId]: {
        id: s[externalId]?.id ?? "",
        application_id: application.id,
        external_id: externalId,
        answers: patch.answers,
        status: patch.status,
        updated_at: new Date().toISOString(),
      },
    }));
    const { data, error } = await supabase
      .from("member_licence_application_item_state")
      .upsert(
        { application_id: application.id, external_id: externalId, answers: patch.answers, status: patch.status },
        { onConflict: "application_id,external_id" }
      )
      .select("*")
      .single();
    if (error) {
      console.error("Failed to save checklist item", error);
      return;
    }
    if (data) setItemStates((s) => ({ ...s, [externalId]: data as MemberLicenceApplicationItemState }));
  }

  async function commitAnswers(template: LicenceApplicationTemplate, nextAnswers: Record<string, unknown>) {
    const itemFiles = files[template.external_id] ?? [];
    const isFeeItem = template.title === "Application fee";
    const status = computeStatus(template.drawer_type, nextAnswers, itemFiles, isFeeItem);
    await saveItem(template.external_id, { answers: nextAnswers, status });
  }

  async function handleUpload(template: LicenceApplicationTemplate, slot: string, file: File): Promise<boolean> {
    if (!application) return false;
    const existing = (files[template.external_id] ?? []).filter((f) => f.slot === slot);
    const nextVersion = existing.length ? Math.max(...existing.map((f) => f.version)) + 1 : 1;
    const path = `${application.id}/${template.external_id}/${slot}-v${nextVersion}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
    if (uploadError) {
      console.error("Failed to upload file", uploadError);
      setErrorMsg("That file couldn't be uploaded. Please try again.");
      return false;
    }
    const { data, error } = await supabase
      .from("member_licence_application_files")
      .insert({
        application_id: application.id,
        external_id: template.external_id,
        slot,
        file_name: file.name,
        storage_path: path,
        version: nextVersion,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Failed to record uploaded file", error);
      setErrorMsg("That file uploaded, but we couldn't record it. Please try again.");
      return false;
    }
    const nextFilesForItem = [...(files[template.external_id] ?? []), data as MemberLicenceApplicationFile];
    setFiles((s) => ({ ...s, [template.external_id]: nextFilesForItem }));
    const answers = itemStates[template.external_id]?.answers ?? {};
    const isFeeItem = template.title === "Application fee";
    const status = computeStatus(template.drawer_type, answers, nextFilesForItem, isFeeItem);
    await saveItem(template.external_id, { answers, status });
    return true;
  }

  async function viewFile(f: MemberLicenceApplicationFile) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60);
    if (error || !data?.signedUrl) {
      console.error("Failed to create signed url", error);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const chosenRoute = application?.class_key ?? null;
  const routeClass = useMemo(
    () => wizardClasses.find((c) => c.class_key === chosenRoute) ?? null,
    [wizardClasses, chosenRoute]
  );
  const feeTier = useMemo(
    () => feeTiers.find((f) => f.class_key === chosenRoute && f.fee_type === "application") ?? null,
    [feeTiers, chosenRoute]
  );
  const feeAmount = feeTier ? Number(feeTier.amount) : null;

  const routeTemplates = useMemo(() => {
    if (!chosenRoute) return [];
    return templates.filter((t) => t.route_key === null || t.route_key === chosenRoute);
  }, [templates, chosenRoute]);

  const phaseGroups = useMemo(() => {
    const map: Record<Phase, LicenceApplicationTemplate[]> = {
      business: [],
      people: [],
      products: [],
      technology: [],
      policies: [],
      finalise: [],
    };
    routeTemplates.forEach((t) => {
      const p = t.phase as Phase;
      if (map[p]) map[p].push(t);
    });
    (Object.keys(map) as Phase[]).forEach((p) => map[p].sort((a, b) => a.seq - b.seq));
    return map;
  }, [routeTemplates]);

  function statusFor(externalId: string): ItemStatus {
    return itemStates[externalId]?.status ?? "not_started";
  }

  const readyCount = routeTemplates.filter((t) => statusFor(t.external_id) === "ready").length;
  const inProgressCount = routeTemplates.filter((t) => statusFor(t.external_id) === "in_progress").length;
  const total = routeTemplates.length;
  const remainingCount = total - readyCount - inProgressCount;
  const progressPct = total ? Math.round((readyCount / total) * 100) : 0;
  const allReady = total > 0 && readyCount === total;

  const nextTemplate = useMemo(
    () => routeTemplates.find((t) => statusFor(t.external_id) !== "ready") ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeTemplates, itemStates]
  );
  const feeItemTemplate = useMemo(() => routeTemplates.find((t) => t.title === "Application fee") ?? null, [routeTemplates]);
  const officialFormTemplate = useMemo(
    () => routeTemplates.find((t) => t.drawer_type === "official_form") ?? null,
    [routeTemplates]
  );
  const feeReady = feeItemTemplate ? statusFor(feeItemTemplate.external_id) === "ready" : false;
  const formReady = officialFormTemplate ? statusFor(officialFormTemplate.external_id) === "ready" : false;

  const documentRows = useMemo(() => {
    const rows: { file: MemberLicenceApplicationFile; title: string; externalId: string }[] = [];
    Object.entries(files).forEach(([externalId, list]) => {
      const t = routeTemplates.find((tt) => tt.external_id === externalId);
      (list ?? []).forEach((f) => rows.push({ file: f, title: t?.title ?? externalId, externalId }));
    });
    rows.sort((a, b) => (b.file.uploaded_at ?? "").localeCompare(a.file.uploaded_at ?? ""));
    return rows;
  }, [files, routeTemplates]);

  const reviewRequest = useMemo(() => readApplicationReview(application?.facts), [application]);
  const hasReview = !!reviewRequest;

  const drawerTemplate = useMemo(
    () => (drawer && drawer.externalId ? routeTemplates.find((t) => t.external_id === drawer.externalId) ?? null : null),
    [drawer, routeTemplates]
  );

  // Lightweight facts-merge persist helper, matching the pattern already
  // used by the Payments sibling wizard (persistFacts in
  // payments-wizard-client.tsx) -- application.facts is jsonb, so recording
  // a review request needs no schema change.
  async function persistFacts(patch: Record<string, unknown>) {
    if (!application) return;
    const nextFacts = { ...application.facts, ...patch };
    setApplication((a) => (a ? { ...a, facts: nextFacts } : a));
    const { error } = await supabase.from("member_licence_applications").update({ facts: nextFacts }).eq("id", application.id);
    if (error) {
      console.error("Failed to save your review request", error);
      setErrorMsg("We couldn't save that. Please try again.");
    }
  }

  function requestReview(type: "interim" | "final") {
    const pct = total ? Math.round((readyCount / total) * 100) : 0;
    persistFacts({
      applicationReview: {
        status: "requested",
        type,
        requestedAt: new Date().toISOString(),
        requestedProgress: pct,
      },
    });
    setDrawer(null);
    setActiveTab("review");
  }

  function cancelReview() {
    persistFacts({ applicationReview: null });
    setActiveTab("application");
  }

  function jumpToPhase(p: Phase) {
    setActivePhase(p);
    if (typeof document !== "undefined") {
      document.getElementById(`phase-${p}`)?.scrollIntoView({ behavior: "smooth" });
    }
  }

  async function submitApplication() {
    if (!application) return;
    setSubmitting(true);
    const submittedAt = new Date().toISOString();
    const { error } = await supabase
      .from("member_licence_applications")
      .update({ status: "submitted", submitted_at: submittedAt })
      .eq("id", application.id);
    setSubmitting(false);
    if (error) {
      console.error("Failed to submit application", error);
      setErrorMsg("We couldn't submit your application. Please try again.");
      return;
    }
    setApplication((a) => (a ? { ...a, status: "submitted", submitted_at: submittedAt } : a));
    setScreen("submitted");
  }

  // ---- Screens ----

  if (screen === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center" style={{ color: "var(--color-text-muted)" }}>
        Loading your application…
      </div>
    );
  }

  if (screen === "landing") {
    return (
      <LandingScreen
        canResume={application !== null}
        onStart={() => setScreen("route")}
        onResume={() => setScreen("wizard")}
      />
    );
  }

  if (screen === "route") {
    return (
      <RoutePicker
        wizardClasses={wizardClasses}
        feeTiers={feeTiers}
        creatingRoute={creatingRoute}
        errorMsg={errorMsg}
        onChoose={selectRoute}
        onUnlisted={() => setScreen("unlisted")}
      />
    );
  }

  if (screen === "unlisted") {
    return (
      <UnlistedScreen
        onBack={() => setScreen("route")}
        onExpert={() => setScreen("expert")}
        onSandbox={() => setScreen("sandbox")}
      />
    );
  }

  if (screen === "expert") {
    return (
      <ExpertBookingScreen
        sourceModule="apply"
        contextKey="digital-lending-application"
        onBack={() => setScreen("unlisted")}
        onReturn={() => setScreen("route")}
      />
    );
  }

  if (screen === "sandbox") {
    return <SandboxScreen onBack={() => setScreen("unlisted")} onExpert={() => setScreen("expert")} />;
  }

  if (screen === "result") {
    const cls = wizardClasses.find((c) => c.class_key === pendingRouteKey) ?? null;
    const fee = feeTiers.find((f) => f.class_key === pendingRouteKey && f.fee_type === "application") ?? null;
    return (
      <ResultScreen
        routeLabel={cls?.label ?? pendingRouteKey ?? ""}
        routeDescription={cls?.description ?? null}
        feeAmount={fee ? Number(fee.amount) : null}
        creating={creatingRoute !== null}
        onChangeSelections={() => {
          setPendingRouteKey(null);
          setScreen("route");
        }}
        onContinue={confirmRoute}
      />
    );
  }

  if (screen === "submitted" && application) {
    return (
      <SubmittedScreen
        application={application}
        routeLabel={routeClass?.label ?? "Digital Lending"}
        readyCount={readyCount}
        total={routeTemplates.length}
        onStartOver={startOver}
      />
    );
  }

  if (!application) return null;

  // ---- Drawer content dispatch ----

  let drawerEyebrow = "";
  let drawerTitle = "";
  let drawerBody: ReactNode = null;
  const drawerHasRequirementContext = (drawer?.kind === "item" || drawer?.kind === "guide") && !!drawerTemplate;

  if (drawer?.kind === "item" && drawerTemplate) {
    drawerEyebrow = PHASE_LABELS[drawerTemplate.phase as Phase] ?? "Requirement";
    drawerTitle = drawerTemplate.title;
    drawerBody = (
      <DrawerInput
        template={drawerTemplate}
        answers={itemStates[drawerTemplate.external_id]?.answers ?? {}}
        itemFiles={files[drawerTemplate.external_id] ?? []}
        onSaveAnswers={(a) => commitAnswers(drawerTemplate, a)}
        onUpload={(slot, f) => handleUpload(drawerTemplate, slot, f)}
        onViewFile={viewFile}
        feeAmount={drawerTemplate.title === "Application fee" ? feeAmount : null}
      />
    );
  } else if (drawer?.kind === "guide" && drawerTemplate) {
    drawerEyebrow = "Requirement guidance";
    drawerTitle = drawerTemplate.title;
    drawerBody = <GuidanceDrawerBody template={drawerTemplate} />;
  } else if (drawer?.kind === "expert") {
    drawerEyebrow = "Support";
    drawerTitle = "Expert Support";
    const contextLabel = drawerTemplate ? drawerTemplate.title : `${routeClass?.label ?? "Digital Lending"} application`;
    drawerBody = <ExpertSupportBody contextLabel={contextLabel} onRequestReview={() => requestReview("interim")} />;
  }

  return (
    <div className={styles.dwRoot}>
      <header className={styles["workspace-head"]}>
        <div className={styles["workspace-head-left"]}>
          <button type="button" className={styles["back-btn"]} onClick={startOver}>
            ← Licence route
          </button>
          <span className={styles["workspace-title"]}>Digital Lending Licence Application</span>
          <span className={styles["route-badge"]}>{routeClass?.label ?? "—"}</span>
        </div>
      </header>

      <nav className={styles["workspace-tabs"]}>
        <button
          type="button"
          className={`${styles["app-tab"]} ${activeTab === "application" ? styles.active : ""}`}
          onClick={() => setActiveTab("application")}
        >
          Application
        </button>
        <button
          type="button"
          className={`${styles["app-tab"]} ${activeTab === "documents" ? styles.active : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          Documents
        </button>
        {hasReview && (
          <button
            type="button"
            className={`${styles["app-tab"]} ${activeTab === "review" ? styles.active : ""}`}
            onClick={() => setActiveTab("review")}
          >
            Review
          </button>
        )}
      </nav>

      {errorMsg && <div className={styles["error-banner"]}>{errorMsg}</div>}

      <div className={styles["workspace-grid"]}>
        <aside className={styles["phase-nav"]}>
          <div className={styles["phase-label"]}>Application</div>
          {PHASE_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles["phase-btn"]} ${activePhase === p ? styles.active : ""}`}
              onClick={() => jumpToPhase(p)}
            >
              {PHASE_LABELS[p]}
            </button>
          ))}
        </aside>

        <main className={styles["app-main"]}>
          <section style={{ display: activeTab === "application" ? "block" : "none" }}>
            <h1>Your application</h1>
            <p className={styles["workspace-intro"]}>
              Prepare the {routeClass?.label ?? "Digital Lending"} application requirement by requirement. FITSPA
              Compliance Platform only shows work that belongs in this route.
            </p>
            {PHASE_ORDER.map((p) => {
              const items = phaseGroups[p] ?? [];
              if (items.length === 0) return null;
              return (
                <section key={p} id={`phase-${p}`} className={styles["phase-section"]}>
                  <h2>{PHASE_LABELS[p]}</h2>
                  <div className={styles["req-list"]}>
                    {items.map((t) => (
                      <RequirementCard
                        key={t.external_id}
                        template={t}
                        status={statusFor(t.external_id)}
                        progressText={progressTextFor(t, itemStates[t.external_id]?.answers ?? {}, files[t.external_id] ?? [])}
                        onOpenGuide={() => setDrawer({ kind: "guide", externalId: t.external_id })}
                        onOpenItem={() => setDrawer({ kind: "item", externalId: t.external_id })}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            <div className={styles["readiness-card"]}>
              <h3>Application readiness</h3>
              <p>Use this summary when you are ready to review the complete application before submission.</p>
              <div className={styles["readiness-row"]}>
                <span>All application requirements</span>
                <span className={allReady ? styles.ok : styles.notok}>
                  {allReady ? "Complete" : `${readyCount}/${total} ready`}
                </span>
              </div>
              {officialFormTemplate && (
                <div className={styles["readiness-row"]}>
                  <span>Prescribed form signed</span>
                  <span className={formReady ? styles.ok : styles.notok}>{formReady ? "Ready" : "Not ready"}</span>
                </div>
              )}
              {feeItemTemplate && (
                <div className={styles["readiness-row"]}>
                  <span>Application fee evidence</span>
                  <span className={feeReady ? styles.ok : styles.notok}>{feeReady ? "Ready" : "Not ready"}</span>
                </div>
              )}
              <div className={styles["drawer-actions"]}>
                <button
                  type="button"
                  className={styles["save-btn"]}
                  disabled={!allReady}
                  onClick={() => requestReview("final")}
                >
                  Request final review
                </button>
                {allReady && (
                  <button type="button" className={styles["subtle-btn"]} disabled={submitting} onClick={submitApplication}>
                    {submitting ? "Submitting…" : "Submit application"}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section style={{ display: activeTab === "documents" ? "block" : "none" }}>
            <div className={styles["docs-head"]}>
              <h2>Documents</h2>
              <p className={styles["workspace-intro"]}>Files added while preparing the application appear here automatically.</p>
            </div>
            {documentRows.length === 0 ? (
              <div className={styles.empty}>No documents have been added yet.</div>
            ) : (
              <table className={styles["docs-table"]}>
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
                        <div className={styles["docs-name"]}>{r.file.file_name}</div>
                        <div className={styles["docs-sub"]}>{r.file.slot}</div>
                      </td>
                      <td>{r.title}</td>
                      <td>v{r.file.version}</td>
                      <td>{(r.file.uploaded_at ?? "").slice(0, 10)}</td>
                      <td>
                        <button
                          type="button"
                          className={styles["open-req"]}
                          onClick={() => {
                            setActiveTab("application");
                            setDrawer({ kind: "item", externalId: r.externalId });
                          }}
                        >
                          Open requirement
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section style={{ display: activeTab === "review" ? "block" : "none" }}>
            <div className={styles["review-head"]}>
              <h2>Expert review</h2>
              <p className={styles["workspace-intro"]}>Review requests and requirement-level issues appear here.</p>
            </div>
            {reviewRequest ? (
              <>
                <div className={styles["review-card"]}>
                  <div className={styles["review-top"]}>
                    <div>
                      <h3>{reviewRequest.type === "final" ? "Final application review" : "Application review"}</h3>
                      <p>
                        Requested {reviewRequest.requestedAt ? new Date(reviewRequest.requestedAt).toLocaleDateString() : "—"}{" "}
                        at {reviewRequest.requestedProgress}% complete · {readyCount} of {total} requirements ready ·{" "}
                        {documentRows.length} file{documentRows.length === 1 ? "" : "s"} attached.
                      </p>
                    </div>
                    <span className={styles["review-state"]}>Requested</span>
                  </div>
                </div>
                <div className={styles["drawer-actions"]}>
                  <button type="button" className={styles["subtle-btn"]} onClick={cancelReview}>
                    Cancel review request
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.empty}>No review has been requested.</div>
            )}
          </section>
        </main>

        <aside className={styles["right-rail"]}>
          <section className={styles["rail-card"]}>
            <div className={styles["rail-label"]}>Progress</div>
            <div className={styles["rail-number"]}>{progressPct}%</div>
            <div className={styles["rail-progress"]}>
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <div className={styles["rail-stat"]}>
              <span>Ready</span>
              <strong>{readyCount}</strong>
            </div>
            <div className={styles["rail-stat"]}>
              <span>In progress</span>
              <strong>{inProgressCount}</strong>
            </div>
            <div className={styles["rail-stat"]}>
              <span>Remaining</span>
              <strong>{remainingCount}</strong>
            </div>
          </section>

          <section className={styles["rail-card"]}>
            <div className={styles["rail-label"]}>Next</div>
            <div className={styles["rail-next"]}>
              {nextTemplate ? (
                <>
                  Continue with <strong>{nextTemplate.title}</strong>.
                </>
              ) : (
                "Your applicant-side requirements are complete."
              )}
            </div>
            {nextTemplate ? (
              <button
                type="button"
                className={styles["rail-btn"]}
                onClick={() => setDrawer({ kind: "item", externalId: nextTemplate.external_id })}
              >
                Open requirement
              </button>
            ) : (
              <button type="button" className={`${styles["rail-btn"]} ${styles.primary}`} onClick={() => requestReview("final")}>
                Request final review
              </button>
            )}
          </section>

          <section className={styles["rail-card"]}>
            <div className={styles["rail-label"]}>Expert Support</div>
            <div className={styles["rail-next"]}>Ask a question or request a review at any stage.</div>
            <button type="button" className={styles["rail-btn"]} onClick={() => setDrawer({ kind: "expert" })}>
              Ask a question
            </button>
            <button type="button" className={styles["rail-btn"]} onClick={() => requestReview("interim")}>
              Request application review
            </button>
          </section>
        </aside>
      </div>

      <div className={`${styles.overlay} ${drawer ? styles.open : ""}`} onClick={() => setDrawer(null)} />
      <aside className={`${styles.drawer} ${drawer ? styles.open : ""}`}>
        <div className={styles["drawer-head"]}>
          <div>
            <div className={styles["drawer-eyebrow"]}>{drawerEyebrow}</div>
            <h2>{drawerTitle}</h2>
          </div>
          <button type="button" className={styles["drawer-close"]} onClick={() => setDrawer(null)} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles["drawer-body"]}>{drawerBody}</div>
        <div className={styles["drawer-footer"]}>
          {drawerHasRequirementContext && drawerTemplate ? (
            <button
              type="button"
              className={styles["text-link"]}
              onClick={() => setDrawer({ kind: "expert", externalId: drawerTemplate.external_id })}
            >
              Ask an expert about this requirement
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={styles["subtle-btn"]} onClick={() => setDrawer(null)}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assessment front door (screen-landing / screen-unlisted / screen-expert /
// screen-sandbox / screen-result in the Beacon prototype) -- see
// payments-wizard-client.tsx's identical set of components for the full
// rationale and the Screen type's comment above for the flow order.
// ---------------------------------------------------------------------------

function LandingScreen({
  canResume,
  onStart,
  onResume,
}: {
  canResume: boolean;
  onStart: () => void;
  onResume: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        MRD-MoFPED · Digital Lending
      </div>
      <h1 className="text-3xl font-semibold mt-3" style={{ fontFamily: "var(--font-serif)" }}>
        Know what you need for your licence application.
      </h1>
      <p className="mt-3 text-sm max-w-xl mx-auto" style={{ color: "var(--color-text-muted)" }}>
        Tell us what your business plans to do, and we&apos;ll show you the licence requirements that apply. No
        account is needed to start, and your progress is saved in this browser as you go.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
        <button className="btn btn-primary" type="button" onClick={onStart}>
          Start the assessment →
        </button>
        {canResume && (
          <button className="btn btn-ghost" type="button" onClick={onResume}>
            Resume my checklist
          </button>
        )}
      </div>
    </div>
  );
}

function UnlistedScreen({
  onBack,
  onExpert,
  onSandbox,
}: {
  onBack: () => void;
  onExpert: () => void;
  onSandbox: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        ← Back to assessment
      </button>
      <h1 className="text-3xl font-semibold mt-4" style={{ fontFamily: "var(--font-serif)" }}>
        What would you like help with?
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Choose the option that best describes why your activity isn&apos;t listed.
      </p>
      <div className="space-y-3 mt-6">
        <button type="button" className="card p-5 text-left w-full" onClick={onExpert}>
          <span className="block font-semibold">I&apos;m not sure which option applies</span>
          <span className="block text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            My business may fit Money Lender or NDTMFI, but I need help identifying the right one.
          </span>
        </button>
        <button type="button" className="card p-5 text-left w-full" onClick={onSandbox}>
          <span className="block font-semibold">None of these routes describe my business</span>
          <span className="block text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            My lending product or model appears different from the listed routes.
          </span>
        </button>
      </div>
    </div>
  );
}

// Identical component to the one in payments-wizard-client.tsx -- posts a
// real row to expert_support_requests (request_type: "consultation_booking")
// via /api/expert-support.
function ExpertBookingScreen({
  sourceModule,
  contextKey,
  onBack,
  onReturn,
}: {
  sourceModule: "apply" | "comply";
  contextKey: string;
  onBack: () => void;
  onReturn: () => void;
}) {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [product, setProduct] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }, []);

  const canSubmit = name.trim() && business.trim() && email.trim() && date && time && product.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/expert-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceModule,
          contextKey,
          requestType: "consultation_booking",
          contactName: name.trim(),
          contactEmail: email.trim(),
          contactPhone: phone.trim(),
          businessName: business.trim(),
          preferredDate: date,
          preferredTime: time,
          message: product.trim(),
        }),
      });
      if (!res.ok) throw new Error("request failed");
      setSent(true);
    } catch {
      setError("We couldn't send that request. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    const when = date && time ? ` for ${new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} at ${time}` : "";
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="badge badge-green mx-auto" style={{ display: "inline-flex" }}>
          Request captured
        </div>
        <h2 className="text-2xl font-semibold mt-4" style={{ fontFamily: "var(--font-serif)" }}>
          Consultation request captured
        </h2>
        <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Your request{when} has been sent to FITSPA&apos;s Expert Support team. They&apos;ll use your product
          description to prepare for the classification discussion and will reach out to confirm.
        </p>
        <button className="btn btn-primary mt-6" type="button" onClick={onReturn}>
          Return to assessment →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        ← Back
      </button>
      <h1 className="text-3xl font-semibold mt-4" style={{ fontFamily: "var(--font-serif)" }}>
        Speak to an expert
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        If you&apos;re unsure which route applies to your business, request a short session to review your product
        and regulatory pathway.
      </p>

      {error && (
        <div className="badge badge-red mt-4" style={{ display: "block", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>
          {error}
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm">
            Full name
            <input className="input mt-1 w-full" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="text-sm">
            Business / company
            <input className="input mt-1 w-full" type="text" value={business} onChange={(e) => setBusiness(e.target.value)} required />
          </label>
          <label className="text-sm">
            Email
            <input className="input mt-1 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="text-sm">
            Phone number
            <input className="input mt-1 w-full" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="text-sm">
            Preferred date
            <input
              className="input mt-1 w-full"
              type="date"
              min={tomorrow}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            Preferred time
            <select className="input mt-1 w-full" value={time} onChange={(e) => setTime(e.target.value)} required>
              <option value="">Select a time…</option>
              <option>9:00 AM</option>
              <option>11:00 AM</option>
              <option>2:00 PM</option>
              <option>4:00 PM</option>
            </select>
          </label>
        </div>
        <label className="text-sm block">
          Briefly describe what your product does
          <textarea
            className="input mt-1 w-full"
            rows={4}
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="What does the product do, who uses it, and how does money move?"
            required
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={!canSubmit || sending}>
          {sending ? "Sending…" : "Request a session →"}
        </button>
      </form>
    </div>
  );
}

// MRD has no published regulatory-sandbox framework the way BOU's NPS
// Regulatory Sandbox is a specific, named legal instrument (see
// payments-wizard-client.tsx's SandboxScreen) -- per your confirmed choice,
// this is framed honestly as a bespoke-review pathway rather than inventing
// a named MRD program that doesn't exist.
function SandboxScreen({ onBack, onExpert }: { onBack: () => void; onExpert: () => void }) {
  const [showNote, setShowNote] = useState(false);
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        ← Back
      </button>
      <h1 className="text-3xl font-semibold mt-4" style={{ fontFamily: "var(--font-serif)" }}>
        Explore an alternative pathway
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        If your lending product or business model doesn&apos;t fit the Money Lender or NDTMFI routes, FITSPA can
        review your specific case directly with MRD rather than fitting you into a standard checklist.
      </p>
      <div className="mt-8 flex items-center gap-3 flex-wrap">
        <button className="btn btn-primary" type="button" onClick={() => setShowNote(true)}>
          Build my alternative checklist →
        </button>
        <button className="btn btn-ghost" type="button" onClick={onExpert}>
          Speak to an expert
        </button>
      </div>
      {showNote && (
        <p className="text-xs mt-4" style={{ color: "var(--color-text-muted)" }}>
          A tailored checklist for alternative arrangements is the next module to be built -- speak to an expert in
          the meantime.
        </p>
      )}
    </div>
  );
}

function ResultScreen({
  routeLabel,
  routeDescription,
  feeAmount,
  creating,
  onChangeSelections,
  onContinue,
}: {
  routeLabel: string;
  routeDescription: string | null;
  feeAmount: number | null;
  creating: boolean;
  onChangeSelections: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onChangeSelections}>
        ← Change selections
      </button>
      <div className="text-xs font-semibold uppercase tracking-wide mt-4" style={{ color: "var(--color-text-muted)" }}>
        Based on your selection
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        Your licence application
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        This is the route that applies to the activity you selected.
      </p>

      <div className="card p-5 mt-6">
        <div className="font-semibold">{routeLabel}</div>
        {routeDescription && (
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {routeDescription}
          </p>
        )}
        {feeAmount !== null && (
          <div className="flex justify-between text-sm mt-3">
            <span style={{ color: "var(--color-text-muted)" }}>Application fee</span>
            <span className="font-medium">UGX {feeAmount.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button className="btn btn-primary" type="button" disabled={creating} onClick={onContinue}>
          {creating ? "Starting…" : "Build my checklist →"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onChangeSelections}>
          Change selections
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route picker
// ---------------------------------------------------------------------------

function RoutePicker({
  wizardClasses,
  feeTiers,
  creatingRoute,
  errorMsg,
  onChoose,
  onUnlisted,
}: {
  wizardClasses: LicenceApplicationWizardClass[];
  feeTiers: LicenceApplicationFeeTier[];
  creatingRoute: string | null;
  errorMsg: string | null;
  onChoose: (classKey: string) => void;
  onUnlisted: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        MRD-MoFPED · Digital Lending
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        Which route are you applying under?
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        No account is needed to start. Your progress is saved in this browser as you go, so you can close this tab
        and come back to it later on the same device.
      </p>

      {errorMsg && (
        <div className="badge badge-red mt-4" style={{ display: "block", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>
          {errorMsg}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-8">
        {wizardClasses.map((c) => {
          const fee = feeTiers.find((f) => f.class_key === c.class_key && f.fee_type === "application");
          return (
            <div key={c.class_key} className="card p-5 flex flex-col">
              <h2 className="text-lg font-semibold">{c.label}</h2>
              {c.description && (
                <p className="text-sm mt-2 flex-1" style={{ color: "var(--color-text-muted)" }}>
                  {c.description}
                </p>
              )}
              {fee && (
                <p className="text-sm mt-3" style={{ color: "var(--color-text-muted)" }}>
                  Application fee: UGX {Number(fee.amount).toLocaleString()}
                </p>
              )}
              <button
                className="btn btn-primary mt-4"
                type="button"
                disabled={creatingRoute !== null}
                onClick={() => onChoose(c.class_key)}
              >
                See my licence →
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 card p-4">
        <p className="text-sm font-medium">My activity isn&apos;t listed / I&apos;m not sure</p>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Get help identifying the right route before you select anything above.
        </p>
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={onUnlisted}>
          Get help →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submitted confirmation
// ---------------------------------------------------------------------------

function SubmittedScreen({
  application,
  routeLabel,
  readyCount,
  total,
  onStartOver,
}: {
  application: MemberLicenceApplication;
  routeLabel: string;
  readyCount: number;
  total: number;
  onStartOver: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="badge badge-green mx-auto" style={{ display: "inline-flex" }}>
        Submitted
      </div>
      <h1 className="text-3xl font-semibold mt-4" style={{ fontFamily: "var(--font-serif)" }}>
        Your {routeLabel} application has been submitted.
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        {readyCount} of {total} checklist items were marked ready at submission
        {application.submitted_at ? ` on ${new Date(application.submitted_at).toLocaleString()}` : ""}. Keep a note
        of your reference below in case you need to speak to FITSPA about this application.
      </p>
      <div className="card p-4 mt-6 inline-block">
        <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
          Reference
        </div>
        <div className="font-mono text-sm mt-1">{application.id}</div>
      </div>
      <div className="mt-8 flex items-center justify-center gap-3">
        <a href="/apply" className="btn btn-ghost">
          Back to Applications
        </a>
        <button className="btn btn-primary" type="button" onClick={onStartOver}>
          Start a new application
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requirement card (req-card row)
// ---------------------------------------------------------------------------

function RequirementCard({
  template,
  status,
  progressText,
  onOpenGuide,
  onOpenItem,
}: {
  template: LicenceApplicationTemplate;
  status: ItemStatus;
  progressText: string;
  onOpenGuide: () => void;
  onOpenItem: () => void;
}) {
  const statusLabel = status === "ready" ? "Ready to submit" : status === "in_progress" ? "In progress" : "Not started";
  const statusClass = status === "ready" ? styles.ready : status === "in_progress" ? styles.inprogress : "";
  return (
    <article className={styles["req-card"]}>
      <div>
        <div className={styles["req-title-line"]}>
          <span className={styles["req-title"]}>{template.title}</span>
          <button type="button" className={styles["info-btn"]} aria-label={`About ${template.title}`} onClick={onOpenGuide}>
            i
          </button>
        </div>
        {template.copy && <div className={styles["req-copy"]}>{template.copy}</div>}
        {progressText && <div className={styles["req-progress"]}>{progressText}</div>}
      </div>
      <span className={`${styles.status} ${statusClass}`}>{statusLabel}</span>
      <button type="button" className={styles["req-action"]} onClick={onOpenItem}>
        {template.cta_label ?? "Open requirement"}
      </button>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Guidance drawer body (the info-button popover, built as a drawer)
// ---------------------------------------------------------------------------

function GuidanceDrawerBody({ template }: { template: LicenceApplicationTemplate }) {
  if (!template.guide_what && !template.guide_do && !template.guide_evidence && !template.source_url) {
    return <p className={styles["guide-text"]}>No additional guidance is recorded for this requirement.</p>;
  }
  return (
    <>
      {template.guide_what && (
        <div className={styles["guide-block"]}>
          <div className={styles["guide-label"]}>What this is</div>
          <div className={styles["guide-text"]}>{template.guide_what}</div>
        </div>
      )}
      {template.guide_do && (
        <div className={styles["guide-block"]}>
          <div className={styles["guide-label"]}>What you need to do</div>
          <div className={styles["guide-text"]}>{template.guide_do}</div>
        </div>
      )}
      {template.guide_evidence && (
        <div className={styles["guide-block"]}>
          <div className={styles["guide-label"]}>What good evidence looks like</div>
          <div className={styles["guide-text"]}>{template.guide_evidence}</div>
        </div>
      )}
      {template.source_url && (
        <div className={styles["guide-block"]}>
          <div className={styles["guide-label"]}>Source</div>
          <a className={styles["source-link"]} href={template.source_url} target="_blank" rel="noopener noreferrer">
            {template.source_label ?? "Source"} ↗
          </a>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Expert Support drawer body -- "Ask a question" posts to /api/expert-support
// the same way apply-expert-panel.tsx does; "Request application review"
// calls back up to the facts-merge helper via onRequestReview. No support
// history list here (the prototype's is sourced from a purely client-side
// array with no backing table on this site -- skipped rather than invented).
// ---------------------------------------------------------------------------

function ExpertSupportBody({
  contextLabel,
  onRequestReview,
}: {
  contextLabel: string;
  onRequestReview: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!question.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/expert-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceModule: "apply",
          contextKey: "digital-lending-application",
          message: question,
        }),
      });
      if (res.ok) {
        setSent(true);
        setQuestion("");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className={styles["support-context"]}>
        <strong>Context</strong>
        <p>{contextLabel}</p>
      </div>
      <div className={styles["drawer-section"]}>
        <h3>Ask a question</h3>
        <div className={styles.field}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you need help with?"
          />
        </div>
        <button type="button" className={styles["save-btn"]} onClick={send} disabled={sending || !question.trim()}>
          {sending ? "Sending…" : "Send question"}
        </button>
        {sent && <p className={styles["rail-note"]}>Question sent to Expert Support.</p>}
      </div>
      <div className={styles["drawer-section"]}>
        <h3>Application review</h3>
        <p>
          Request a review of the application as it stands now. A final review becomes most useful when the
          applicant-side requirements are complete.
        </p>
        <button type="button" className={styles["subtle-btn"]} onClick={onRequestReview}>
          Request application review
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// File slot control (shared by every drawer that uploads a document)
// ---------------------------------------------------------------------------

function FileSlotRow({
  label,
  file,
  onUpload,
  onViewFile,
}: {
  label: string;
  file: MemberLicenceApplicationFile | null;
  onUpload: (file: File) => Promise<boolean>;
  onViewFile: (f: MemberLicenceApplicationFile) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm" style={{ borderColor: "var(--color-border)" }}>
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {file ? (
          <div className="truncate" style={{ color: "var(--color-text-muted)" }}>
            {file.file_name} · v{file.version}
          </div>
        ) : (
          <div style={{ color: "var(--color-text-muted)" }}>No file uploaded yet</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {file && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewFile(file)}>
            View
          </button>
        )}
        <label className="btn btn-ghost btn-sm cursor-pointer">
          {busy ? "Uploading…" : file ? "Replace" : "Upload"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              await onUpload(f);
              setBusy(false);
            }}
          />
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer dispatch (the per-requirement editing forms -- unchanged from the
// previous inline-expand implementation, just relocated into the overlay
// drawer above)
// ---------------------------------------------------------------------------

type DrawerProps = {
  template: LicenceApplicationTemplate;
  answers: Record<string, unknown>;
  itemFiles: MemberLicenceApplicationFile[];
  onSaveAnswers: (a: Record<string, unknown>) => void;
  onUpload: (slot: string, file: File) => Promise<boolean>;
  onViewFile: (f: MemberLicenceApplicationFile) => void;
  feeAmount: number | null;
};

function DrawerInput(props: DrawerProps) {
  switch (props.template.drawer_type) {
    case "company_registration":
      return <CompanyRegistrationDrawer {...props} />;
    case "premises":
      return <PremisesDrawer {...props} />;
    case "org_structure":
      return <OrgStructureDrawer {...props} />;
    case "capital":
      return <CapitalDrawer {...props} />;
    case "people":
      return <PeopleDrawer {...props} />;
    case "declarations":
      return <DeclarationsDrawer {...props} />;
    case "official_form":
      return <OfficialFormDrawer {...props} />;
    case "product_desc":
    case "source_funds":
    case "lending_agreement":
    case "it_controls":
    case "generic_upload":
    case "data_protection":
    case "governance":
      return <DescribeAndAttachDrawer {...props} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// company_registration
// ---------------------------------------------------------------------------

function CompanyRegistrationDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [legalForm, setLegalForm] = useState(String(answers.legalForm ?? "company"));
  const [legalName, setLegalName] = useState(String(answers.legalName ?? ""));
  const [registrationNumber, setRegistrationNumber] = useState(String(answers.registrationNumber ?? ""));
  const [tin, setTin] = useState(String(answers.tin ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({ legalForm, legalName, registrationNumber, tin, ...patch });
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Legal form</label>
          <select
            className="input"
            value={legalForm}
            onChange={(e) => {
              setLegalForm(e.target.value);
              commit({ legalForm: e.target.value });
            }}
          >
            <option value="company">Company</option>
            <option value="ngo">NGO / other legal entity</option>
          </select>
        </div>
        <div>
          <label className="label">Registered legal name</label>
          <input
            className="input"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            onBlur={() => commit({ legalName })}
          />
        </div>
        <div>
          <label className="label">Registration number</label>
          <input
            className="input"
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            onBlur={() => commit({ registrationNumber })}
          />
        </div>
        <div>
          <label className="label">TIN</label>
          <input className="input" value={tin} onChange={(e) => setTin(e.target.value)} onBlur={() => commit({ tin })} />
        </div>
      </div>
      <div className="space-y-2">
        <FileSlotRow
          label="Registration / incorporation certificate"
          file={latestFileForSlot(itemFiles, "certificate")}
          onUpload={(f) => onUpload("certificate", f)}
          onViewFile={onViewFile}
        />
        <FileSlotRow
          label="TIN certificate"
          file={latestFileForSlot(itemFiles, "tin_certificate")}
          onUpload={(f) => onUpload("tin_certificate", f)}
          onViewFile={onViewFile}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// premises
// ---------------------------------------------------------------------------

function PremisesDrawer({ answers, onSaveAnswers }: DrawerProps) {
  const [physicalAddress, setPhysicalAddress] = useState(String(answers.physicalAddress ?? ""));
  const [postalAddress, setPostalAddress] = useState(String(answers.postalAddress ?? ""));
  const [operatingArea, setOperatingArea] = useState(String(answers.operatingArea ?? ""));
  const [principalContact, setPrincipalContact] = useState(String(answers.principalContact ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({ physicalAddress, postalAddress, operatingArea, principalContact, ...patch });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label className="label">Physical / registered address</label>
        <textarea
          className="input"
          rows={2}
          value={physicalAddress}
          onChange={(e) => setPhysicalAddress(e.target.value)}
          onBlur={() => commit({ physicalAddress })}
        />
      </div>
      <div>
        <label className="label">Postal address</label>
        <input
          className="input"
          value={postalAddress}
          onChange={(e) => setPostalAddress(e.target.value)}
          onBlur={() => commit({ postalAddress })}
        />
      </div>
      <div>
        <label className="label">Proposed area of operation</label>
        <input
          className="input"
          value={operatingArea}
          onChange={(e) => setOperatingArea(e.target.value)}
          onBlur={() => commit({ operatingArea })}
          placeholder="e.g. Kampala, Wakiso and Mukono districts"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Principal office contact</label>
        <input
          className="input"
          value={principalContact}
          onChange={(e) => setPrincipalContact(e.target.value)}
          onBlur={() => commit({ principalContact })}
          placeholder="Name, phone and email"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// org_structure
// ---------------------------------------------------------------------------

function OrgStructureDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Management & administrative structure</label>
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSaveAnswers({ description })}
          placeholder="Describe how the institution is organised and managed"
        />
      </div>
      <FileSlotRow
        label="Organisation chart"
        file={latestFileForSlot(itemFiles, "org_chart")}
        onUpload={(f) => onUpload("org_chart", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// capital
// ---------------------------------------------------------------------------

function CapitalDrawer({ answers, onSaveAnswers }: DrawerProps) {
  const [authorizedCapital, setAuthorizedCapital] = useState(String(answers.authorizedCapital ?? ""));
  const [paidUpCapital, setPaidUpCapital] = useState(String(answers.paidUpCapital ?? ""));
  const [hasBankers, setHasBankers] = useState(String(answers.hasBankers ?? "no"));
  const [bankerName, setBankerName] = useState(String(answers.bankerName ?? ""));
  const [bankerBranch, setBankerBranch] = useState(String(answers.bankerBranch ?? ""));
  const [auditorName, setAuditorName] = useState(String(answers.auditorName ?? ""));
  const [auditorFirm, setAuditorFirm] = useState(String(answers.auditorFirm ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({
      authorizedCapital,
      paidUpCapital,
      hasBankers,
      bankerName,
      bankerBranch,
      auditorName,
      auditorFirm,
      ...patch,
    });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div>
        <label className="label">Authorized capital (UGX)</label>
        <input
          className="input"
          type="number"
          value={authorizedCapital}
          onChange={(e) => setAuthorizedCapital(e.target.value)}
          onBlur={() => commit({ authorizedCapital })}
        />
      </div>
      <div>
        <label className="label">Paid-up capital (UGX)</label>
        <input
          className="input"
          type="number"
          value={paidUpCapital}
          onChange={(e) => setPaidUpCapital(e.target.value)}
          onBlur={() => commit({ paidUpCapital })}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Does the institution have bankers?</label>
        <select
          className="input"
          value={hasBankers}
          onChange={(e) => {
            setHasBankers(e.target.value);
            commit({ hasBankers: e.target.value });
          }}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>
      {hasBankers === "yes" && (
        <>
          <div>
            <label className="label">Banker name</label>
            <input
              className="input"
              value={bankerName}
              onChange={(e) => setBankerName(e.target.value)}
              onBlur={() => commit({ bankerName })}
            />
          </div>
          <div>
            <label className="label">Banker branch</label>
            <input
              className="input"
              value={bankerBranch}
              onChange={(e) => setBankerBranch(e.target.value)}
              onBlur={() => commit({ bankerBranch })}
            />
          </div>
        </>
      )}
      <div>
        <label className="label">Auditor name</label>
        <input
          className="input"
          value={auditorName}
          onChange={(e) => setAuditorName(e.target.value)}
          onBlur={() => commit({ auditorName })}
        />
      </div>
      <div>
        <label className="label">Auditor firm</label>
        <input
          className="input"
          value={auditorFirm}
          onChange={(e) => setAuditorFirm(e.target.value)}
          onBlur={() => commit({ auditorFirm })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// people (repeatable rows, one identity-document slot per person)
// ---------------------------------------------------------------------------

function PeopleDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [people, setPeople] = useState<PersonRow[]>(() => {
    const existing = Array.isArray(answers.people) ? (answers.people as PersonRow[]) : [];
    return existing.length ? existing : [{ rowId: newRowId(), name: "", role: "", nationalId: "", address: "" }];
  });

  function commit(next: PersonRow[]) {
    setPeople(next);
    onSaveAnswers({ people: next });
  }

  function updateRow(rowId: string, patch: Partial<PersonRow>) {
    commit(people.map((p) => (p.rowId === rowId ? { ...p, ...patch } : p)));
  }

  function addRow() {
    commit([...people, { rowId: newRowId(), name: "", role: "", nationalId: "", address: "" }]);
  }

  function removeRow(rowId: string) {
    const next = people.filter((p) => p.rowId !== rowId);
    commit(next.length ? next : [{ rowId: newRowId(), name: "", role: "", nationalId: "", address: "" }]);
  }

  return (
    <div className="space-y-4">
      {people.map((p, idx) => (
        <div key={p.rowId} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
              Person {idx + 1}
            </span>
            {people.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(p.rowId)}>
                Remove
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                defaultValue={p.name}
                onBlur={(e) => updateRow(p.rowId, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <input
                className="input"
                defaultValue={p.role}
                placeholder="e.g. Director, Company Secretary, CEO"
                onBlur={(e) => updateRow(p.rowId, { role: e.target.value })}
              />
            </div>
            <div>
              <label className="label">National ID / passport number</label>
              <input
                className="input"
                defaultValue={p.nationalId}
                onBlur={(e) => updateRow(p.rowId, { nationalId: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Address</label>
              <input
                className="input"
                defaultValue={p.address}
                onBlur={(e) => updateRow(p.rowId, { address: e.target.value })}
              />
            </div>
          </div>
          <FileSlotRow
            label="Identity document"
            file={latestFileForSlot(itemFiles, `id-${p.rowId}`)}
            onUpload={(f) => onUpload(`id-${p.rowId}`, f)}
            onViewFile={onViewFile}
          />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
        + Add another person
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// declarations
// ---------------------------------------------------------------------------

const DECLARATION_QUESTIONS: { key: string; label: string }[] = [
  { key: "receivership", label: "Has the institution, or any director, ever been subject to receivership or a compromise with creditors?" },
  { key: "investigations", label: "Is the institution, or any director, currently under investigation by a regulator or law-enforcement body?" },
  { key: "litigation", label: "Is the institution currently involved in any material litigation?" },
  { key: "relatedParty", label: "Does the institution have business relationships with its officers or significant shareholders?" },
];

function DeclarationsDrawer({ answers, onSaveAnswers }: DrawerProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    DECLARATION_QUESTIONS.forEach((q) => {
      out[q.key] = typeof answers[q.key] === "string" ? (answers[q.key] as string) : "";
      out[`${q.key}Explanation`] = typeof answers[`${q.key}Explanation`] === "string" ? (answers[`${q.key}Explanation`] as string) : "";
    });
    return out;
  });

  function commit(next: Record<string, string>) {
    setValues(next);
    onSaveAnswers(next);
  }

  return (
    <div className="space-y-4">
      {DECLARATION_QUESTIONS.map((q) => (
        <div key={q.key} className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-sm">{q.label}</p>
          <div className="flex gap-2 mt-2">
            {["yes", "no"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`btn btn-sm ${values[q.key] === opt ? "btn-primary" : "btn-ghost"}`}
                onClick={() => commit({ ...values, [q.key]: opt })}
              >
                {opt === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
          {values[q.key] === "yes" && (
            <textarea
              className="input mt-2"
              rows={2}
              placeholder="Explain briefly"
              defaultValue={values[`${q.key}Explanation`]}
              onBlur={(e) => commit({ ...values, [`${q.key}Explanation`]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// official_form
// ---------------------------------------------------------------------------

function OfficialFormDrawer({ itemFiles, onUpload, onViewFile, template }: DrawerProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {template.source_url ? (
          <>
            This is the regulator&apos;s official form and must be completed and signed outside FITSPA Compliance Platform.{" "}
            <a
              href={template.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--color-primary)" }}
            >
              Open the official form ↗
            </a>
            , complete and sign it, then upload the final signed copy below.
          </>
        ) : (
          "This is the regulator's official form and must be completed and signed outside FITSPA Compliance Platform. Upload the final signed copy below."
        )}
      </p>
      <FileSlotRow
        label="Signed form"
        file={latestFileForSlot(itemFiles, "signed_form")}
        onUpload={(f) => onUpload("signed_form", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// "describe + attach document(s)" -- shared by product_desc, source_funds,
// lending_agreement, it_controls, generic_upload, data_protection and
// governance, since each of those is fundamentally the same shape (per the
// build spec). The "Application fee" items reuse this drawer too, with the
// description made optional and a fee banner shown instead.
// ---------------------------------------------------------------------------

function DescribeAndAttachDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile, feeAmount }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  const [slotCount, setSlotCount] = useState(() => Math.max(1, new Set(itemFiles.map((f) => f.slot)).size));
  const isFeeItem = feeAmount != null;

  function commitDescription(next: string) {
    onSaveAnswers({ ...answers, description: next });
  }

  const slots = Array.from({ length: slotCount }, (_, i) => `file-${i + 1}`);

  return (
    <div className="space-y-4">
      {isFeeItem && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "#e3f0e6", color: "var(--color-primary-dark)" }}>
          Application fee due: <strong>UGX {feeAmount.toLocaleString()}</strong>. Pay it via the prescribed channel,
          then attach your proof of payment below.
        </div>
      )}
      <div>
        <label className="label">{isFeeItem ? "Payment note (optional)" : "Description"}</label>
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => commitDescription(description)}
          placeholder={isFeeItem ? "Payment reference, date, method…" : "Describe what you're attaching below"}
        />
      </div>
      <div className="space-y-2">
        <label className="label">{slots.length > 1 ? "Attachments" : "Attachment"}</label>
        {slots.map((slot, i) => (
          <FileSlotRow
            key={slot}
            label={`Document ${i + 1}`}
            file={latestFileForSlot(itemFiles, slot)}
            onUpload={(f) => onUpload(slot, f)}
            onViewFile={onViewFile}
          />
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSlotCount((c) => c + 1)}>
          + Add another file
        </button>
      </div>
    </div>
  );
}
