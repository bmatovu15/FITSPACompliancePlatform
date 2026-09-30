"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

const STORAGE_KEY = "beaconDigitalLendingApplicationId";
const BUCKET = "licence-application-files";

const PHASE_ORDER = ["business", "people", "products", "technology", "policies", "finalise"] as const;
type Phase = (typeof PHASE_ORDER)[number];
const PHASE_LABELS: Record<Phase, string> = {
  business: "Business",
  people: "People",
  products: "Products",
  technology: "Technology",
  policies: "Policies",
  finalise: "Finalise",
};
const PHASE_NOTES: Record<Phase, string> = {
  business: "Who the applicant is, and where the business is based.",
  people: "The directors, board members and senior managers behind the application.",
  products: "The loan products on offer, how they are funded, and the customer agreement.",
  technology: "The systems and channels used to deliver digital credit.",
  policies: "The policies and frameworks that govern how the business is run.",
  finalise: "The application fee and the official, signed form.",
};

type ItemStatus = "not_started" | "in_progress" | "ready";
type Screen = "loading" | "route" | "wizard" | "submitted";

type PersonRow = { rowId: string; name: string; role: string; nationalId: string; address: string };

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
  const [reviewMode, setReviewMode] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creatingRoute, setCreatingRoute] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setScreen("route");
      return;
    }
    const { data, error } = await supabase.from("member_licence_applications").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setScreen("route");
      return;
    }
    await loadApplicationData(data as MemberLicenceApplication);
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

  async function chooseRoute(classKey: string) {
    setErrorMsg(null);
    setCreatingRoute(classKey);
    const { data, error } = await supabase
      .from("member_licence_applications")
      .insert({ member_id: null, application_key: applicationKey, class_key: classKey, status: "draft" })
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
    setReviewMode(false);
    setExpanded({});
    setActivePhase("business");
    setScreen("route");
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

  function toggleExpanded(externalId: string) {
    setExpanded((e) => ({ ...e, [externalId]: !e[externalId] }));
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
  const allReady = routeTemplates.length > 0 && readyCount === routeTemplates.length;

  // ---- Screens ----

  if (screen === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center" style={{ color: "var(--color-text-muted)" }}>
        Loading your application…
      </div>
    );
  }

  if (screen === "route") {
    return (
      <RoutePicker
        wizardClasses={wizardClasses}
        feeTiers={feeTiers}
        creatingRoute={creatingRoute}
        errorMsg={errorMsg}
        onChoose={chooseRoute}
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

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
            Digital Lending application
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {routeClass?.label ?? "Route"} · saved automatically in this browser · reference {application.id.slice(0, 8)}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={startOver} type="button">
          Start a different application
        </button>
      </div>

      {errorMsg && (
        <div className="badge badge-red mb-4" style={{ display: "block", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        <PhaseRail
          phaseGroups={phaseGroups}
          itemStates={itemStates}
          activePhase={activePhase}
          reviewMode={reviewMode}
          onSelectPhase={(p) => {
            setReviewMode(false);
            setActivePhase(p);
          }}
          onSelectReview={() => setReviewMode(true)}
          routeLabel={routeClass?.label ?? "—"}
          feeAmount={feeAmount}
          readyCount={readyCount}
          total={routeTemplates.length}
        />

        <main className="flex-1 min-w-0">
          {reviewMode ? (
            <ReviewPanel
              phaseGroups={phaseGroups}
              itemStates={itemStates}
              allReady={allReady}
              submitting={submitting}
              onSubmit={submitApplication}
              onJump={(t) => {
                setReviewMode(false);
                setActivePhase(t.phase as Phase);
                setExpanded((e) => ({ ...e, [t.external_id]: true }));
              }}
            />
          ) : (
            <>
              <h2 className="text-lg font-semibold">{PHASE_LABELS[activePhase]}</h2>
              <p className="text-sm mt-1 mb-4" style={{ color: "var(--color-text-muted)" }}>
                {PHASE_NOTES[activePhase]}
              </p>
              {(phaseGroups[activePhase] ?? []).map((t) => (
                <ChecklistItem
                  key={t.external_id}
                  template={t}
                  status={statusFor(t.external_id)}
                  answers={itemStates[t.external_id]?.answers ?? {}}
                  itemFiles={files[t.external_id] ?? []}
                  expanded={!!expanded[t.external_id]}
                  onToggle={() => toggleExpanded(t.external_id)}
                  onSaveAnswers={(a) => commitAnswers(t, a)}
                  onUpload={(slot, f) => handleUpload(t, slot, f)}
                  onViewFile={viewFile}
                  feeAmount={t.title === "Application fee" ? feeAmount : null}
                />
              ))}
            </>
          )}
        </main>
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
}: {
  wizardClasses: LicenceApplicationWizardClass[];
  feeTiers: LicenceApplicationFeeTier[];
  creatingRoute: string | null;
  errorMsg: string | null;
  onChoose: (classKey: string) => void;
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
                {creatingRoute === c.class_key ? "Starting…" : `Start as ${c.label} →`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs mt-8" style={{ color: "var(--color-text-muted)" }}>
        Not sure which route applies to you? Visit the{" "}
        <a href="/apply" className="underline" style={{ color: "var(--color-primary)" }}>
          Apply hub
        </a>{" "}
        and speak to an expert before you start.
      </p>
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
// Phase rail
// ---------------------------------------------------------------------------

function PhaseRail({
  phaseGroups,
  itemStates,
  activePhase,
  reviewMode,
  onSelectPhase,
  onSelectReview,
  routeLabel,
  feeAmount,
  readyCount,
  total,
}: {
  phaseGroups: Record<Phase, LicenceApplicationTemplate[]>;
  itemStates: Record<string, MemberLicenceApplicationItemState>;
  activePhase: Phase;
  reviewMode: boolean;
  onSelectPhase: (p: Phase) => void;
  onSelectReview: () => void;
  routeLabel: string;
  feeAmount: number | null;
  readyCount: number;
  total: number;
}) {
  return (
    <aside className="w-full md:w-64 shrink-0 space-y-3">
      <div className="card p-4">
        <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
          Route
        </div>
        <div className="font-medium mt-1">{routeLabel}</div>
        <div className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
          {readyCount} of {total} items ready
        </div>
        {feeAmount != null && (
          <div className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            Application fee: UGX {feeAmount.toLocaleString()}
          </div>
        )}
      </div>
      <nav className="card overflow-hidden">
        {PHASE_ORDER.map((p) => {
          const items = phaseGroups[p] ?? [];
          const ready = items.filter((t) => (itemStates[t.external_id]?.status ?? "not_started") === "ready").length;
          const active = !reviewMode && activePhase === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onSelectPhase(p)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm text-left border-b last:border-b-0"
              style={{
                borderColor: "var(--color-border)",
                background: active ? "#f1efe6" : "transparent",
                fontWeight: active ? 600 : 400,
              }}
            >
              <span>{PHASE_LABELS[p]}</span>
              <span style={{ color: "var(--color-text-muted)" }}>
                {ready} of {items.length}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onSelectReview}
          className="w-full px-4 py-3 text-sm text-left"
          style={{ background: reviewMode ? "#f1efe6" : "transparent", fontWeight: reviewMode ? 600 : 400 }}
        >
          Review &amp; submit
        </button>
      </nav>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Review & submit
// ---------------------------------------------------------------------------

function ReviewPanel({
  phaseGroups,
  itemStates,
  allReady,
  submitting,
  onSubmit,
  onJump,
}: {
  phaseGroups: Record<Phase, LicenceApplicationTemplate[]>;
  itemStates: Record<string, MemberLicenceApplicationItemState>;
  allReady: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onJump: (t: LicenceApplicationTemplate) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Review &amp; submit</h2>
      <p className="text-sm mt-1 mb-4" style={{ color: "var(--color-text-muted)" }}>
        Every item must be Ready before you can submit. Click an item to jump back and finish it.
      </p>
      {PHASE_ORDER.map((p) => {
        const items = phaseGroups[p] ?? [];
        if (items.length === 0) return null;
        return (
          <div key={p} className="mb-5">
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--color-text-muted)" }}>
              {PHASE_LABELS[p]}
            </div>
            <div className="card divide-y" style={{ borderColor: "var(--color-border)" }}>
              {items.map((t) => {
                const status = itemStates[t.external_id]?.status ?? "not_started";
                return (
                  <button
                    key={t.external_id}
                    type="button"
                    onClick={() => onJump(t)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <span>{t.title}</span>
                    <StatusBadge status={status} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="mt-6">
        <button className="btn btn-primary" type="button" disabled={!allReady || submitting} onClick={onSubmit}>
          {submitting ? "Submitting…" : "Submit application"}
        </button>
        {!allReady && (
          <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
            Finish every checklist item to unlock submission.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist item + guidance
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ItemStatus }) {
  const cls = status === "ready" ? "badge-green" : status === "in_progress" ? "badge-amber" : "badge-gray";
  const label = status === "ready" ? "Ready" : status === "in_progress" ? "In progress" : "Remaining";
  return <span className={`badge ${cls}`}>{label}</span>;
}

function GuidancePanel({ template }: { template: LicenceApplicationTemplate }) {
  if (!template.guide_what && !template.guide_do && !template.guide_evidence && !template.source_url) return null;
  return (
    <div className="rounded-lg p-3 text-sm space-y-1.5" style={{ background: "#f1efe6" }}>
      {template.guide_what && (
        <p>
          <span className="font-semibold">What this is: </span>
          {template.guide_what}
        </p>
      )}
      {template.guide_do && (
        <p>
          <span className="font-semibold">What to do: </span>
          {template.guide_do}
        </p>
      )}
      {template.guide_evidence && (
        <p>
          <span className="font-semibold">Evidence needed: </span>
          {template.guide_evidence}
        </p>
      )}
      {template.source_url && (
        <p>
          <a
            href={template.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "var(--color-primary)" }}
          >
            Source{template.source_label ? `: ${template.source_label}` : ""} ↗
          </a>
        </p>
      )}
    </div>
  );
}

function ChecklistItem({
  template,
  status,
  answers,
  itemFiles,
  expanded,
  onToggle,
  onSaveAnswers,
  onUpload,
  onViewFile,
  feeAmount,
}: {
  template: LicenceApplicationTemplate;
  status: ItemStatus;
  answers: Record<string, unknown>;
  itemFiles: MemberLicenceApplicationFile[];
  expanded: boolean;
  onToggle: () => void;
  onSaveAnswers: (a: Record<string, unknown>) => void;
  onUpload: (slot: string, file: File) => Promise<boolean>;
  onViewFile: (f: MemberLicenceApplicationFile) => void;
  feeAmount: number | null;
}) {
  return (
    <div className="card mb-3 overflow-hidden">
      <button type="button" className="w-full flex items-center justify-between gap-3 p-4 text-left" onClick={onToggle}>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            {template.external_id}
          </div>
          <div className="font-medium">{template.title}</div>
          {template.copy && (
            <div className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              {template.copy}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={status} />
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t p-4 space-y-4" style={{ borderColor: "var(--color-border)" }}>
          <GuidancePanel template={template} />
          <DrawerInput
            template={template}
            answers={answers}
            itemFiles={itemFiles}
            onSaveAnswers={onSaveAnswers}
            onUpload={onUpload}
            onViewFile={onViewFile}
            feeAmount={feeAmount}
          />
        </div>
      )}
    </div>
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
// Drawer dispatch
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
