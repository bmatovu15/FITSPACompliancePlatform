"use client";

import { useMemo, useState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./insurance-workspace.module.css";
import type {
  LicenceApplicationDrawerType,
  LicenceApplicationFeeTier,
  LicenceApplicationTemplate,
  LicenceApplicationWizardClass,
  MemberLicenceApplication,
  MemberLicenceApplicationFile,
  MemberLicenceApplicationItemState,
} from "@/lib/types";

// Public, no-login Insurance "Apply" wizard. The application it builds is
// anonymous by default (member_id stays null; RLS on
// member_licence_applications scopes an anonymous row to anyone who knows
// its own id) -- the visitor's browser is the only thing that remembers
// which application is theirs, via STORAGE_KEY. The wizard screen itself
// (masthead + tabs + phase-nav + req-cards + right rail + slide-in drawer)
// is ported 1:1 from digital-lending-wizard-client.tsx -- same component
// shapes, same Supabase contracts, same status-computation pattern -- with
// just the classification step, phase set and drawer catalog swapped for
// Insurance's own 40-item, 4-route, 9-class IRA schema.
//
// Classification is a two-step affair, unlike Digital Lending's flat 2-route
// picker: IRA licenses 4 routes (Insurer/Reinsurer, Broker, Agent, HMO), and
// three of those four routes further split into wizard_classes "classes"
// (e.g. Insurer route -> Life / Non-Life / Reinsurer-Life / Reinsurer-Non-
// Life). The wizard_classes table itself carries no route column -- the
// route is derived from each class_key's own naming convention, via
// routeKeyForClass() below. HMO has exactly one class, so choosing that
// route skips the second step and creates the application immediately, the
// same way Digital Lending's single-step picker does.
//
// Unlike Payments' multi-select (an applicant can hold combined PSO + PSP +
// instrument licences at once, tracked in `facts`), an Insurance applicant
// holds exactly one class at a time, so -- like Digital Lending -- the
// chosen class is stored directly on member_licence_applications.class_key.

const STORAGE_KEY = "beaconInsuranceApplicationId";
const BUCKET = "licence-application-files";
const GENERAL_DOC_ID = "_general";

const PHASE_ORDER = ["company", "people", "business", "technology", "compliance", "forms", "review"] as const;
type Phase = (typeof PHASE_ORDER)[number];
// Exact 7 phase labels from the build spec, mapped 1:1 onto PHASE_ORDER.
const PHASE_LABELS: Record<Phase, string> = {
  company: "Company requirements",
  people: "Owners, Directors & Management",
  business: "Business & Financials",
  technology: "Risk, Technology & Operations",
  compliance: "Customers & Compliance",
  forms: "Forms & Submissions",
  review: "Regulator Reviews and Approval readiness",
};

type ItemStatus = "not_started" | "in_progress" | "ready";
// "landing" / "unlisted" / "expert" / "sandbox" / "result" are the
// pre-workspace "assessment" front door ported from the Beacon prototype's
// Payments module -- see payments-wizard-client.tsx's Screen type comment
// for the full rationale. Order: landing -> route -> (class, for the 3
// multi-class routes) -> (unlisted -> expert | sandbox, optional detour) ->
// result -> wizard. "sandbox" here is IRA's own equivalent, not BOU's NPS
// Regulatory Sandbox -- see SandboxScreen's copy below.
type Screen = "loading" | "landing" | "route" | "class" | "unlisted" | "expert" | "sandbox" | "result" | "wizard" | "submitted";

// The 4 IRA licence routes. wizard_classes carries no route column of its
// own -- route membership is derived from each class_key's naming prefix via
// routeKeyForClass() below, and licence_application_templates.route_key is
// seeded against these same 4 values (null meaning "every route").
type RouteKey = "insurer" | "broker" | "agent" | "hmo";
const ROUTE_ORDER: RouteKey[] = ["insurer", "broker", "agent", "hmo"];
const ROUTE_TITLES: Record<RouteKey, string> = {
  insurer: "Insurer / Reinsurer Licence",
  broker: "Insurance / Reinsurance Broker Licence",
  agent: "Insurance Agent Licence",
  hmo: "Health Membership Organisation (HMO) Licence",
};
const ROUTE_DESCRIPTIONS: Record<RouteKey, string> = {
  insurer: "Underwrite life or non-life insurance or reinsurance risk directly, as a primary insurer or a reinsurer.",
  broker: "Place insurance or reinsurance business with insurers or reinsurers on behalf of clients, for a fee or commission.",
  agent: "Represent one or more insurers under an agency agreement, as an individual agent or a corporate agency.",
  hmo: "Operate a prepaid, capitation-based health benefit scheme for members.",
};

function routeKeyForClass(classKey: string): RouteKey | null {
  if (classKey.startsWith("insurer_") || classKey.startsWith("reinsurer_")) return "insurer";
  if (classKey.startsWith("broker_")) return "broker";
  if (classKey.startsWith("agent_")) return "agent";
  if (classKey === "hmo") return "hmo";
  return null;
}

type PersonRow = { rowId: string; name: string; role: string; nationalId: string; address: string };
type ArrangementRow = { rowId: string; counterpartyName: string; description: string };
type MultiEntryRow = { rowId: string; name: string; detail: string };

type ApplicationReview = {
  status: string;
  type: "interim" | "final";
  requestedAt: string;
  requestedProgress: number;
};

// A drawer can host a requirement's own editing form ("item"), its guidance
// ("guide", the info-button popover -- built as a drawer rather than a
// floating popover, matching every other Beacon workspace on this site), or
// the Expert Support panel ("expert", optionally scoped to a requirement
// when opened via a requirement's own "Ask an expert" link).
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

function formatUGX(amount: number): string {
  return `UGX ${Number(amount).toLocaleString()}`;
}

function latestFileForSlot(itemFiles: MemberLicenceApplicationFile[], slot: string): MemberLicenceApplicationFile | null {
  const matches = itemFiles.filter((f) => f.slot === slot);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.version >= b.version ? a : b));
}

// ---------------------------------------------------------------------------
// Declarations -- 3 distinct declarations items share drawer_type
// "declarations" (fit-and-proper at P4, CEO certification at F5, completeness
// confirmation at R1), each needing its own question set rather than one
// generic set repeated three times. Keyed by external_id, the same
// "variant map" idiom Payments already uses for tin_tax (TIN_TAX_VARIANT)
// and fee_proof (FEE_TYPE_FOR_EXTERNAL_ID).
// ---------------------------------------------------------------------------

type DeclarationQuestion = { key: string; label: string; flagOnYes?: boolean };

const DECLARATION_VARIANTS: Record<string, DeclarationQuestion[]> = {
  "INS-P4": [
    { key: "receivership", label: "Has the institution, or any director, ever been subject to receivership or a compromise with creditors?" },
    { key: "investigations", label: "Is the institution, or any director, currently under investigation by a regulator or law-enforcement body?" },
    { key: "litigation", label: "Is the institution currently involved in any material litigation?" },
    { key: "relatedParty", label: "Does the institution have business relationships with its officers or significant shareholders?" },
  ],
  "INS-F5": [
    { key: "accuracy", label: "I certify that the information and documents submitted in this application are true, complete and accurate.", flagOnYes: false },
    { key: "noOmission", label: "I confirm that no material fact relevant to this application has been omitted.", flagOnYes: false },
    { key: "authority", label: "I confirm that I am authorised to make this declaration on behalf of the applicant.", flagOnYes: false },
  ],
  "INS-R1": [
    { key: "complete", label: "I confirm that all requirements for this application have been completed and the supporting documents attached are ready for submission.", flagOnYes: false },
  ],
};
const DEFAULT_DECLARATION_VARIANT = DECLARATION_VARIANTS["INS-P4"];

function declarationQuestionsFor(externalId: string): DeclarationQuestion[] {
  return DECLARATION_VARIANTS[externalId] ?? DEFAULT_DECLARATION_VARIANT;
}

// tin_tax (C05) is a company-level TIN on this schema -- no person-level
// variant is seeded for Insurance, unlike Payments' per-item split.
// fee_proof (C04 registration/application fee, F3 licensing fee) needs to
// know which fee_type to look up, keyed by external_id the same way
// Payments' FEE_TYPE_FOR_EXTERNAL_ID works.
const FEE_TYPE_FOR_EXTERNAL_ID: Record<string, "application" | "licensing"> = { "INS-C4": "application", "INS-F3": "licensing" };

function computeStatus(
  drawerType: LicenceApplicationDrawerType,
  externalId: string,
  answers: Record<string, unknown>,
  itemFiles: MemberLicenceApplicationFile[]
): ItemStatus {
  const ready = computeReady(drawerType, externalId, answers, itemFiles);
  if (ready) return "ready";
  const hasAnyAnswer = Object.values(answers).some((v) => (Array.isArray(v) ? v.length > 0 : isFilled(v)));
  const hasAnyFile = itemFiles.length > 0;
  return hasAnyAnswer || hasAnyFile ? "in_progress" : "not_started";
}

function computeReady(
  drawerType: LicenceApplicationDrawerType,
  externalId: string,
  answers: Record<string, unknown>,
  itemFiles: MemberLicenceApplicationFile[]
): boolean {
  switch (drawerType) {
    // ---- reused verbatim from Digital Lending ----
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
      const questions = declarationQuestionsFor(externalId);
      return questions.every((q) => {
        const v = answers[q.key];
        if (v !== "yes" && v !== "no") return false;
        if (v === "yes" && q.flagOnYes !== false) return isFilled(answers[`${q.key}Explanation`]);
        return true;
      });
    }
    case "official_form":
      return !!latestFileForSlot(itemFiles, "signed_form");
    case "product_desc":
    case "it_controls":
    case "generic_upload":
    case "data_protection":
    case "governance":
      return isFilled(answers.description) && itemFiles.length > 0;

    // ---- reused verbatim from Payments ----
    case "ownership":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "ownership_chart");
    case "financials":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "financials_doc");
    case "tin_tax":
      return isFilled(answers.tin) && !!latestFileForSlot(itemFiles, "tax_clearance");
    case "repeat_arrangement": {
      const rows = Array.isArray(answers.rows) ? (answers.rows as ArrangementRow[]) : [];
      return (
        rows.length > 0 &&
        rows.every(
          (r) => isFilled(r.counterpartyName) && isFilled(r.description) && !!latestFileForSlot(itemFiles, `arrangement-${r.rowId}`)
        )
      );
    }
    case "docpack":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "doc_pack");
    case "customer_terms":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "terms_doc");
    case "pricing":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "pricing_doc");
    case "multi_upload": {
      const rows = Array.isArray(answers.rows) ? (answers.rows as MultiEntryRow[]) : [];
      return rows.length > 0 && rows.every((r) => isFilled(r.name) && !!latestFileForSlot(itemFiles, `entry-${r.rowId}`));
    }
    case "fee_proof":
      return isFilled(answers.amountPaid) && isFilled(answers.paymentReference) && !!latestFileForSlot(itemFiles, "proof_of_payment");

    default:
      return false;
  }
}

// A short "N added" caption under a requirement's title on the req-card,
// mirroring Digital Lending's progressText().
function progressTextFor(
  template: LicenceApplicationTemplate,
  answers: Record<string, unknown>,
  itemFiles: MemberLicenceApplicationFile[]
): string {
  if (template.drawer_type === "people") {
    const people = Array.isArray(answers.people) ? (answers.people as PersonRow[]) : [];
    return people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} added` : "";
  }
  if (template.drawer_type === "repeat_arrangement" || template.drawer_type === "multi_upload") {
    const rows = Array.isArray(answers.rows) ? (answers.rows as unknown[]) : [];
    return rows.length ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"} added` : "";
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

// Applicability -- route_key is the primary filter (null = every route;
// otherwise one of ROUTE_ORDER), exactly the mechanism Digital Lending uses
// (route_key === chosen route). Insurance additionally seeds a handful of
// templates with an applicability.note of "life business" / "non-life
// business" (INS-T1 Appointed actuary; INS-CP4 Pre-insurance risk survey
// procedures), both scoped route_key:"insurer" -- that route alone isn't
// fine-grained enough to tell a Life insurer/reinsurer from a Non-Life one,
// so these notes are read as an additional sub-class filter on top of the
// route check. (INS-B9's note, "required for brokers and HMOs", is seeded
// as copy only -- its route_key is null, i.e. it's deliberately shown to
// every route -- so it is left as guidance text, not a hide/show filter.)
function templateAppliesToClass(template: LicenceApplicationTemplate, classKey: string): boolean {
  const route = routeKeyForClass(classKey);
  if (template.route_key !== null && template.route_key !== route) return false;
  const note = typeof template.applicability?.note === "string" ? (template.applicability.note as string).toLowerCase() : "";
  if (note.includes("non-life")) return classKey === "insurer_nonlife" || classKey === "reinsurer_nonlife";
  if (note.includes("life")) return classKey === "insurer_life" || classKey === "reinsurer_life";
  return true;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function InsuranceWizardClient({
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
  const [selectedRoute, setSelectedRoute] = useState<RouteKey | null>(null);
  const [application, setApplication] = useState<MemberLicenceApplication | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, MemberLicenceApplicationItemState>>({});
  const [files, setFiles] = useState<Record<string, MemberLicenceApplicationFile[]>>({});
  const [activePhase, setActivePhase] = useState<Phase>("company");
  const [activeTab, setActiveTab] = useState<"application" | "documents" | "review">("application");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [creatingClass, setCreatingClass] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Explicit "Save" button in each requirement drawer. Keyed by requirement so
  // a status shown for one drawer never leaks into the next one that opens.
  const [saveStatus, setSaveStatus] = useState<{ id: string; state: "saving" | "saved" | "error" } | null>(null);
  const itemStatesRef = useRef(itemStates);
  const filesRef = useRef(files);
  useEffect(() => {
    itemStatesRef.current = itemStates;
    filesRef.current = files;
  }, [itemStates, files]);
  const [submitting, setSubmitting] = useState(false);
  // Class chosen (either directly from a single-class route like HMO, or
  // from the class picker) but not yet committed -- the new "result"
  // confirmation screen sits between picking a class and actually creating
  // the application. Mirrors Digital Lending's pendingRouteKey.
  const [pendingClassKey, setPendingClassKey] = useState<string | null>(null);

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

  // Step 1 of classification: pick a route. HMO has exactly one class, so
  // picking it goes straight to the result-confirmation screen (skipping
  // step 2); every other route has 2-4 classes, so it moves to the "class"
  // screen. Neither path creates the application yet -- that only happens
  // once the visitor confirms on the "result" screen (confirmClass below).
  function chooseRoute(routeKey: RouteKey) {
    setErrorMsg(null);
    const classesForRoute = wizardClasses.filter((c) => routeKeyForClass(c.class_key) === routeKey);
    if (classesForRoute.length === 1) {
      setPendingClassKey(classesForRoute[0].class_key);
      setScreen("result");
      return;
    }
    setSelectedRoute(routeKey);
    setScreen("class");
  }

  function backToRoutes() {
    setSelectedRoute(null);
    setScreen("route");
  }

  // Step 2 of classification (or the only step, for HMO): holds the chosen
  // class and shows the result-confirmation screen.
  function selectClass(classKey: string) {
    setPendingClassKey(classKey);
    setScreen("result");
  }

  // Actually creates the member_licence_applications row with the chosen
  // class_key -- same insert shape as Digital Lending's confirmRoute, now
  // triggered from the "result" screen's "Build my checklist" button.
  async function confirmClass() {
    if (!pendingClassKey) return;
    setErrorMsg(null);
    setCreatingClass(pendingClassKey);
    const { data, error } = await supabase
      .from("member_licence_applications")
      .insert({ member_id: null, application_key: applicationKey, class_key: pendingClassKey, status: "draft" })
      .select("*")
      .single();
    setCreatingClass(null);
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
    setActivePhase("company");
    setSelectedRoute(null);
    setPendingClassKey(null);
    setScreen("landing");
  }

  async function saveItem(externalId: string, patch: { answers: Record<string, unknown>; status: ItemStatus }): Promise<boolean> {
    if (!application) return false;
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
      return false;
    }
    if (data) setItemStates((s) => ({ ...s, [externalId]: data as MemberLicenceApplicationItemState }));
    return true;
  }

  async function commitAnswers(template: LicenceApplicationTemplate, nextAnswers: Record<string, unknown>) {
    const itemFiles = files[template.external_id] ?? [];
    const status = computeStatus(template.drawer_type, template.external_id, nextAnswers, itemFiles);
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
    const status = computeStatus(template.drawer_type, template.external_id, answers, nextFilesForItem);
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

  // Explicit Save for a requirement drawer. Inputs already autosave as they
  // change; this flushes whatever is currently focused (a text field that has
  // not blurred yet), re-reads the latest state and writes it, and only
  // reports "Saved" once the database confirms it.
  async function saveRequirement(template: LicenceApplicationTemplate) {
    const id = template.external_id;
    setSaveStatus({ id, state: "saving" });
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await new Promise((r) => setTimeout(r, 120));
    const answers = itemStatesRef.current[id]?.answers ?? {};
    const itemFiles = filesRef.current[id] ?? [];
    const status = computeStatus(template.drawer_type, template.external_id, answers, itemFiles);
    const ok = await saveItem(id, { answers, status });
    setSaveStatus({ id, state: ok ? "saved" : "error" });
    if (ok) setTimeout(() => setSaveStatus((s) => (s && s.id === id && s.state === "saved" ? null : s)), 3000);
  }

  // Documents-tab upload: a file that is not tied to any one requirement.
  // Stored under the reserved external_id "_general" in the same table and
  // bucket as requirement files, so it shows up in the Documents table.
  async function handleGeneralUpload(list: FileList | null) {
    if (!application || !list || list.length === 0) return;
    setErrorMsg(null);
    for (const file of Array.from(list)) {
      const existing = (filesRef.current[GENERAL_DOC_ID] ?? []).filter((f) => f.file_name === file.name);
      const nextVersion = existing.length ? Math.max(...existing.map((f) => f.version)) + 1 : 1;
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
      const path = `${application.id}/${GENERAL_DOC_ID}/${Date.now()}-v${nextVersion}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadError) {
        console.error("Failed to upload file", uploadError);
        setErrorMsg(`"${file.name}" couldn't be uploaded. Please try again.`);
        continue;
      }
      const { data, error } = await supabase
        .from("member_licence_application_files")
        .insert({
          application_id: application.id,
          external_id: GENERAL_DOC_ID,
          slot: "Additional document",
          file_name: file.name,
          storage_path: path,
          version: nextVersion,
        })
        .select("*")
        .single();
      if (error || !data) {
        console.error("Failed to record uploaded file", error);
        setErrorMsg(`"${file.name}" uploaded, but we couldn't record it. Please try again.`);
        continue;
      }
      const row = data as MemberLicenceApplicationFile;
      filesRef.current = { ...filesRef.current, [GENERAL_DOC_ID]: [...(filesRef.current[GENERAL_DOC_ID] ?? []), row] };
      setFiles((s) => ({ ...s, [GENERAL_DOC_ID]: [...(s[GENERAL_DOC_ID] ?? []), row] }));
    }
  }

  const chosenClassKey = application?.class_key ?? null;
  const routeClass = useMemo(
    () => wizardClasses.find((c) => c.class_key === chosenClassKey) ?? null,
    [wizardClasses, chosenClassKey]
  );
  const applicationFeeTier = useMemo(
    () => feeTiers.find((f) => f.class_key === chosenClassKey && f.fee_type === "application") ?? null,
    [feeTiers, chosenClassKey]
  );
  const licensingFeeTier = useMemo(
    () => feeTiers.find((f) => f.class_key === chosenClassKey && f.fee_type === "licensing") ?? null,
    [feeTiers, chosenClassKey]
  );

  const routeTemplates = useMemo(() => {
    if (!chosenClassKey) return [];
    return templates.filter((t) => templateAppliesToClass(t, chosenClassKey));
  }, [templates, chosenClassKey]);

  const phaseGroups = useMemo(() => {
    const map: Record<Phase, LicenceApplicationTemplate[]> = {
      company: [],
      people: [],
      business: [],
      technology: [],
      compliance: [],
      forms: [],
      review: [],
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
  const feeItemTemplates = useMemo(() => routeTemplates.filter((t) => t.drawer_type === "fee_proof"), [routeTemplates]);
  const officialFormTemplates = useMemo(() => routeTemplates.filter((t) => t.drawer_type === "official_form"), [routeTemplates]);

  const documentRows = useMemo(() => {
    const rows: { file: MemberLicenceApplicationFile; title: string; externalId: string }[] = [];
    Object.entries(files).forEach(([externalId, list]) => {
      const t = routeTemplates.find((tt) => tt.external_id === externalId);
      (list ?? []).forEach((f) =>
        rows.push({ file: f, title: externalId === GENERAL_DOC_ID ? "General document" : t?.title ?? externalId, externalId })
      );
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
  // used by Digital Lending and Payments -- application.facts is jsonb, so
  // recording a review request needs no schema change.
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
        creatingClass={creatingClass}
        errorMsg={errorMsg}
        onChoose={chooseRoute}
        onUnlisted={() => setScreen("unlisted")}
      />
    );
  }

  if (screen === "class" && selectedRoute) {
    return (
      <ClassPicker
        routeKey={selectedRoute}
        wizardClasses={wizardClasses.filter((c) => routeKeyForClass(c.class_key) === selectedRoute)}
        feeTiers={feeTiers}
        creatingClass={creatingClass}
        errorMsg={errorMsg}
        onChoose={selectClass}
        onBack={backToRoutes}
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
        contextKey="insurance-application"
        onBack={() => setScreen("unlisted")}
        onReturn={() => setScreen("route")}
      />
    );
  }

  if (screen === "sandbox") {
    return <SandboxScreen onBack={() => setScreen("unlisted")} onExpert={() => setScreen("expert")} />;
  }

  if (screen === "result") {
    const cls = wizardClasses.find((c) => c.class_key === pendingClassKey) ?? null;
    const appFee = feeTiers.find((f) => f.class_key === pendingClassKey && f.fee_type === "application") ?? null;
    const licFee = feeTiers.find((f) => f.class_key === pendingClassKey && f.fee_type === "licensing") ?? null;
    return (
      <ResultScreen
        classLabel={cls?.label ?? pendingClassKey ?? ""}
        classDescription={cls?.description ?? null}
        minCapital={cls?.min_capital != null ? Number(cls.min_capital) : null}
        applicationFee={appFee ? Number(appFee.amount) : null}
        licensingFee={licFee ? Number(licFee.amount) : null}
        creating={creatingClass !== null}
        onChangeSelections={() => {
          setPendingClassKey(null);
          setSelectedRoute(null);
          setScreen("route");
        }}
        onContinue={confirmClass}
      />
    );
  }

  if (screen === "submitted" && application) {
    return (
      <SubmittedScreen
        application={application}
        routeLabel={routeClass?.label ?? "Insurance"}
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
  const drawerSaveState = drawerTemplate && saveStatus && saveStatus.id === drawerTemplate.external_id ? saveStatus.state : null;
  const drawerHasRequirementContext = (drawer?.kind === "item" || drawer?.kind === "guide") && !!drawerTemplate;

  if (drawer?.kind === "item" && drawerTemplate) {
    drawerEyebrow = PHASE_LABELS[drawerTemplate.phase as Phase] ?? "Requirement";
    drawerTitle = drawerTemplate.title;
    const feeType = FEE_TYPE_FOR_EXTERNAL_ID[drawerTemplate.external_id];
    const feeTierForItem = feeType === "licensing" ? licensingFeeTier : feeType === "application" ? applicationFeeTier : null;
    drawerBody = (
      <DrawerInput
        template={drawerTemplate}
        answers={itemStates[drawerTemplate.external_id]?.answers ?? {}}
        itemFiles={files[drawerTemplate.external_id] ?? []}
        onSaveAnswers={(a) => commitAnswers(drawerTemplate, a)}
        onUpload={(slot, f) => handleUpload(drawerTemplate, slot, f)}
        onViewFile={viewFile}
        classLabel={routeClass?.label ?? "Insurance"}
        feeTier={feeTierForItem}
        feeTypeLabel={feeType === "licensing" ? "Licence fee" : "Registration/application fee"}
      />
    );
  } else if (drawer?.kind === "guide" && drawerTemplate) {
    drawerEyebrow = "Requirement guidance";
    drawerTitle = drawerTemplate.title;
    drawerBody = <GuidanceDrawerBody template={drawerTemplate} />;
  } else if (drawer?.kind === "expert") {
    drawerEyebrow = "Support";
    drawerTitle = "Expert Support";
    const contextLabel = drawerTemplate ? drawerTemplate.title : `${routeClass?.label ?? "Insurance"} application`;
    drawerBody = <ExpertSupportBody contextLabel={contextLabel} onRequestReview={() => requestReview("interim")} />;
  }

  return (
    <div className={styles.iwRoot}>
      <header className={styles["workspace-head"]}>
        <div className={styles["workspace-head-left"]}>
          <button type="button" className={styles["back-btn"]} onClick={startOver}>
            ← Licence route
          </button>
          <span className={styles["workspace-title"]}>Insurance Licence Application</span>
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
              Prepare the {routeClass?.label ?? "Insurance"} application requirement by requirement. FITSPA
              Compliance Platform only shows work that belongs to this licence class.
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
              {officialFormTemplates.map((t) => {
                const ready = statusFor(t.external_id) === "ready";
                return (
                  <div key={t.external_id} className={styles["readiness-row"]}>
                    <span>{t.title}</span>
                    <span className={ready ? styles.ok : styles.notok}>{ready ? "Ready" : "Not ready"}</span>
                  </div>
                );
              })}
              {feeItemTemplates.map((t) => {
                const ready = statusFor(t.external_id) === "ready";
                return (
                  <div key={t.external_id} className={styles["readiness-row"]}>
                    <span>{t.title}</span>
                    <span className={ready ? styles.ok : styles.notok}>{ready ? "Ready" : "Not ready"}</span>
                  </div>
                );
              })}
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
              <p className={styles["workspace-intro"]}>
                Files added while preparing the application appear here automatically. You can also upload any supporting
                document here, even if it isn&apos;t tied to a specific requirement.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                <label className={styles["save-btn"]} style={{ cursor: "pointer", display: "inline-block" }}>
                  Upload documents
                  <input
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const input = e.currentTarget;
                      await handleGeneralUpload(input.files);
                      input.value = "";
                    }}
                  />
                </label>
                <span style={{ fontSize: 11, color: "#777" }}>
                  {documentRows.length} document{documentRows.length === 1 ? "" : "s"} uploaded
                </span>
              </div>
              {errorMsg ? <p style={{ fontSize: 11.5, color: "#a32020", margin: "10px 0 0" }}>{errorMsg}</p> : null}
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
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className={styles["open-req"]} onClick={() => viewFile(r.file)}>
                          View
                        </button>
                        {r.externalId !== GENERAL_DOC_ID ? (
                          <button
                            type="button"
                            className={styles["open-req"]}
                            style={{ marginLeft: 12 }}
                            onClick={() => {
                              setActiveTab("application");
                              setDrawer({ kind: "item", externalId: r.externalId });
                            }}
                          >
                            Open requirement
                          </button>
                        ) : null}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {drawer?.kind === "item" && drawerTemplate ? (
              <>
                <span
                  role="status"
                  style={{
                    fontSize: 10.5,
                    color:
                      drawerSaveState === "error" ? "#a32020" : drawerSaveState === "saved" ? "#1f6b3a" : "#777",
                    fontWeight: drawerSaveState === "saved" || drawerSaveState === "error" ? 700 : 400,
                  }}
                >
                  {drawerSaveState === "saving"
                    ? "Saving…"
                    : drawerSaveState === "saved"
                      ? "✓ Saved"
                      : drawerSaveState === "error"
                        ? "Couldn't save — please try again"
                        : ""}
                </span>
                <button type="button" className={styles["subtle-btn"]} onClick={() => setDrawer(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className={styles["save-btn"]}
                  disabled={drawerSaveState === "saving"}
                  onClick={() => saveRequirement(drawerTemplate)}
                >
                  Save
                </button>
              </>
            ) : (
              <button type="button" className={styles["subtle-btn"]} onClick={() => setDrawer(null)}>
                Close
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing (front door of the assessment)
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
        IRA · Insurance
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
            My business may fit one of the listed insurance routes, but I need help identifying the right one.
          </span>
        </button>
        <button type="button" className="card p-5 text-left w-full" onClick={onSandbox}>
          <span className="block font-semibold">None of these routes describe my business</span>
          <span className="block text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            My insurance product or model appears different from the listed routes.
          </span>
        </button>
      </div>
    </div>
  );
}

// Identical component to the one in payments-wizard-client.tsx and
// digital-lending-wizard-client.tsx -- posts a real row to
// expert_support_requests (request_type: "consultation_booking") via
// /api/expert-support.
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

// IRA has no published regulatory-sandbox framework the way BOU's NPS
// Regulatory Sandbox is a specific, named legal instrument (see
// payments-wizard-client.tsx's SandboxScreen) -- per your confirmed choice,
// this is framed honestly as a bespoke-review pathway rather than inventing
// a named IRA program that doesn't exist.
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
        If your insurance product or business model doesn&apos;t fit the listed routes, FITSPA can review your
        specific case directly with IRA rather than fitting you into a standard checklist.
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
  classLabel,
  classDescription,
  minCapital,
  applicationFee,
  licensingFee,
  creating,
  onChangeSelections,
  onContinue,
}: {
  classLabel: string;
  classDescription: string | null;
  minCapital: number | null;
  applicationFee: number | null;
  licensingFee: number | null;
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
        This is the class that applies to the activity you selected.
      </p>

      <div className="card p-5 mt-6">
        <div className="font-semibold">{classLabel}</div>
        {classDescription && (
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {classDescription}
          </p>
        )}
        {minCapital !== null && (
          <div className="flex justify-between text-sm mt-3">
            <span style={{ color: "var(--color-text-muted)" }}>Minimum paid-up capital</span>
            <span className="font-medium">{formatUGX(minCapital)}</span>
          </div>
        )}
        {applicationFee !== null && (
          <div className="flex justify-between text-sm mt-2">
            <span style={{ color: "var(--color-text-muted)" }}>Application fee</span>
            <span className="font-medium">{formatUGX(applicationFee)}</span>
          </div>
        )}
        {licensingFee !== null && (
          <div className="flex justify-between text-sm mt-2">
            <span style={{ color: "var(--color-text-muted)" }}>Licensing fee</span>
            <span className="font-medium">{formatUGX(licensingFee)}</span>
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
// Route picker (classification step 1 of 2 -- or the only step for HMO)
// ---------------------------------------------------------------------------

function RoutePicker({
  creatingClass,
  errorMsg,
  onChoose,
  onUnlisted,
}: {
  creatingClass: string | null;
  errorMsg: string | null;
  onChoose: (routeKey: RouteKey) => void;
  onUnlisted: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        IRA · Insurance
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        Which licence are you applying for?
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
        {ROUTE_ORDER.map((routeKey) => (
          <div key={routeKey} className="card p-5 flex flex-col">
            <h2 className="text-lg font-semibold">{ROUTE_TITLES[routeKey]}</h2>
            <p className="text-sm mt-2 flex-1" style={{ color: "var(--color-text-muted)" }}>
              {ROUTE_DESCRIPTIONS[routeKey]}
            </p>
            <button
              className="btn btn-primary mt-4"
              type="button"
              disabled={creatingClass !== null}
              onClick={() => onChoose(routeKey)}
            >
              {creatingClass !== null ? "Starting…" : `Continue as ${ROUTE_TITLES[routeKey]} →`}
            </button>
          </div>
        ))}
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
// Class picker (classification step 2 of 2 -- Life/Non-Life, Insurer/
// Reinsurer, Insurance/Reinsurance Broker, or Individual/Corporate Agent)
// ---------------------------------------------------------------------------

function ClassPicker({
  routeKey,
  wizardClasses,
  feeTiers,
  creatingClass,
  errorMsg,
  onChoose,
  onBack,
}: {
  routeKey: RouteKey;
  wizardClasses: LicenceApplicationWizardClass[];
  feeTiers: LicenceApplicationFeeTier[];
  creatingClass: string | null;
  errorMsg: string | null;
  onChoose: (classKey: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <button type="button" className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }} onClick={onBack}>
        ← Back to licence routes
      </button>
      <div className="text-xs font-semibold uppercase tracking-wide mt-4" style={{ color: "var(--color-text-muted)" }}>
        IRA · {ROUTE_TITLES[routeKey]}
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        Which class applies to you?
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        FITSPA Compliance Platform will only show you the requirements for the class you select below.
      </p>

      {errorMsg && (
        <div className="badge badge-red mt-4" style={{ display: "block", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>
          {errorMsg}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-8">
        {wizardClasses.map((c) => {
          const appFee = feeTiers.find((f) => f.class_key === c.class_key && f.fee_type === "application");
          const licFee = feeTiers.find((f) => f.class_key === c.class_key && f.fee_type === "licensing");
          return (
            <div key={c.class_key} className="card p-5 flex flex-col">
              <h2 className="text-lg font-semibold">{c.label}</h2>
              {c.description && (
                <p className="text-sm mt-2 flex-1" style={{ color: "var(--color-text-muted)" }}>
                  {c.description}
                </p>
              )}
              {c.min_capital != null && (
                <p className="text-sm mt-3" style={{ color: "var(--color-text-muted)" }}>
                  Minimum paid-up capital: {formatUGX(Number(c.min_capital))}
                </p>
              )}
              {appFee && (
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Application fee: {formatUGX(Number(appFee.amount))}
                </p>
              )}
              {licFee && (
                <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                  Licensing fee: {formatUGX(Number(licFee.amount))}
                </p>
              )}
              <button
                className="btn btn-primary mt-4"
                type="button"
                disabled={creatingClass !== null}
                onClick={() => onChoose(c.class_key)}
              >
                See my licence →
              </button>
            </div>
          );
        })}
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
// Expert Support drawer body -- same direct-buttons pattern as Digital
// Lending's rail (Ask a question / Request application review), rather
// than Payments' collapsing expert-menu screen: the 4-route classification
// doesn't change what Expert Support needs to offer, so there's no reason
// to add a menu hop in front of it here.
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
          contextKey: "insurance-application",
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
// Drawer dispatch (the per-requirement editing forms)
// ---------------------------------------------------------------------------

type DrawerProps = {
  template: LicenceApplicationTemplate;
  answers: Record<string, unknown>;
  itemFiles: MemberLicenceApplicationFile[];
  onSaveAnswers: (a: Record<string, unknown>) => void;
  onUpload: (slot: string, file: File) => Promise<boolean>;
  onViewFile: (f: MemberLicenceApplicationFile) => void;
  classLabel: string;
  feeTier: LicenceApplicationFeeTier | null;
  feeTypeLabel: string;
};

function DrawerInput(props: DrawerProps) {
  switch (props.template.drawer_type) {
    // ---- reused verbatim from Digital Lending ----
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
    case "it_controls":
    case "generic_upload":
    case "data_protection":
    case "governance":
      return <DescribeAndAttachDrawer {...props} />;

    // ---- reused verbatim from Payments ----
    case "ownership":
      return <OwnershipDrawer {...props} />;
    case "financials":
      return <FinancialsDrawer {...props} />;
    case "tin_tax":
      return <TinTaxDrawer {...props} />;
    case "repeat_arrangement":
      return <RepeatArrangementDrawer {...props} />;
    case "docpack":
      return <DocpackDrawer {...props} />;
    case "customer_terms":
      return <CustomerTermsDrawer {...props} />;
    case "pricing":
      return <PricingDrawer {...props} />;
    case "multi_upload":
      return <MultiUploadDrawer {...props} />;
    case "fee_proof":
      return <FeeProofDrawer {...props} />;

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
        <label className="label">Head office / registered address</label>
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
        <label className="label">Branch office addresses</label>
        <input
          className="input"
          value={operatingArea}
          onChange={(e) => setOperatingArea(e.target.value)}
          onBlur={() => commit({ operatingArea })}
          placeholder="e.g. Kampala, Mbarara and Gulu branches, or 'None'"
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
        <label className="label">Structure & reporting lines</label>
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSaveAnswers({ description })}
          placeholder="Describe how this function is organised, staffed and reports within the institution"
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
        <label className="label">Authorized share capital (UGX)</label>
        <input
          className="input"
          type="number"
          value={authorizedCapital}
          onChange={(e) => setAuthorizedCapital(e.target.value)}
          onBlur={() => commit({ authorizedCapital })}
        />
      </div>
      <div>
        <label className="label">Paid-up share capital (UGX)</label>
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
                placeholder="e.g. Director, Company Secretary, Appointed Actuary"
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
            label="Identity document / CV"
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
// declarations -- variant-driven by external_id (see DECLARATION_VARIANTS)
// ---------------------------------------------------------------------------

function DeclarationsDrawer({ template, answers, onSaveAnswers }: DrawerProps) {
  const questions = declarationQuestionsFor(template.external_id);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    questions.forEach((q) => {
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
      {questions.map((q) => (
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
          {q.flagOnYes !== false && values[q.key] === "yes" && (
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
            This is the Authority&apos;s official form and must be completed and signed outside FITSPA Compliance
            Platform.{" "}
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
          "This is the Authority's official form and must be completed and signed outside FITSPA Compliance Platform. Upload the final signed copy below."
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
// "describe + attach document" -- shared by product_desc, it_controls,
// generic_upload, data_protection and governance, since each of those is
// fundamentally the same shape -- the same grouping Digital Lending uses.
// ---------------------------------------------------------------------------

function DescribeAndAttachDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  const [slotCount, setSlotCount] = useState(() => Math.max(1, new Set(itemFiles.map((f) => f.slot)).size));

  function commitDescription(next: string) {
    onSaveAnswers({ ...answers, description: next });
  }

  const slots = Array.from({ length: slotCount }, (_, i) => `file-${i + 1}`);

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => commitDescription(description)}
          placeholder="Describe what you're attaching below"
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

// ---------------------------------------------------------------------------
// ownership (P02 shareholders & beneficial-ownership structure)
// ---------------------------------------------------------------------------

function OwnershipDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Ownership / beneficial-ownership structure</label>
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSaveAnswers({ description })}
          placeholder="Describe the shareholding chain down to the ultimate beneficial owner(s)"
        />
      </div>
      <FileSlotRow
        label="Ownership chart"
        file={latestFileForSlot(itemFiles, "ownership_chart")}
        onUpload={(f) => onUpload("ownership_chart", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// financials (B02 security deposit, B03 Government-securities deposit,
// B04 net worth)
// ---------------------------------------------------------------------------

function FinancialsDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSaveAnswers({ description })}
          placeholder="Summarise the financial evidence being attached"
        />
      </div>
      <FileSlotRow
        label="Financial document"
        file={latestFileForSlot(itemFiles, "financials_doc")}
        onUpload={(f) => onUpload("financials_doc", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// tin_tax -- company-level only on this schema (INS-C5); no person-level
// variant is seeded for Insurance, unlike Payments' TIN_TAX_VARIANT split.
// ---------------------------------------------------------------------------

function TinTaxDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [tin, setTin] = useState(String(answers.tin ?? ""));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Company TIN</label>
        <input className="input" value={tin} onChange={(e) => setTin(e.target.value)} onBlur={() => onSaveAnswers({ tin })} />
      </div>
      <FileSlotRow
        label="Tax-clearance certificate"
        file={latestFileForSlot(itemFiles, "tax_clearance")}
        onUpload={(f) => onUpload("tax_clearance", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// repeat_arrangement (B05 reinsurance/retrocession arrangements, T03
// outsourcing & affiliate arrangements)
// ---------------------------------------------------------------------------

function RepeatArrangementDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [rows, setRows] = useState<ArrangementRow[]>(() => {
    const existing = Array.isArray(answers.rows) ? (answers.rows as ArrangementRow[]) : [];
    return existing.length ? existing : [{ rowId: newRowId(), counterpartyName: "", description: "" }];
  });

  function commit(next: ArrangementRow[]) {
    setRows(next);
    onSaveAnswers({ rows: next });
  }

  function updateRow(rowId: string, patch: Partial<ArrangementRow>) {
    commit(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    commit([...rows, { rowId: newRowId(), counterpartyName: "", description: "" }]);
  }

  function removeRow(rowId: string) {
    const next = rows.filter((r) => r.rowId !== rowId);
    commit(next.length ? next : [{ rowId: newRowId(), counterpartyName: "", description: "" }]);
  }

  return (
    <div className="space-y-4">
      {rows.map((r, idx) => (
        <div key={r.rowId} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
              Arrangement {idx + 1}
            </span>
            {rows.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(r.rowId)}>
                Remove
              </button>
            )}
          </div>
          <div>
            <label className="label">Counterparty name</label>
            <input
              className="input"
              defaultValue={r.counterpartyName}
              onBlur={(e) => updateRow(r.rowId, { counterpartyName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              defaultValue={r.description}
              onBlur={(e) => updateRow(r.rowId, { description: e.target.value })}
            />
          </div>
          <FileSlotRow
            label="Arrangement document"
            file={latestFileForSlot(itemFiles, `arrangement-${r.rowId}`)}
            onUpload={(f) => onUpload(`arrangement-${r.rowId}`, f)}
            onViewFile={onViewFile}
          />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
        + Add another arrangement
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// docpack (B06 business plan & feasibility study, CP3 policy/contract
// specimens & rating scales)
// ---------------------------------------------------------------------------

function DocpackDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSaveAnswers({ description })}
          placeholder="Summarise the document pack being attached"
        />
      </div>
      <FileSlotRow
        label="Document pack"
        file={latestFileForSlot(itemFiles, "doc_pack")}
        onUpload={(f) => onUpload("doc_pack", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// customer_terms (CP2 dispute-resolution clause in contracts)
// ---------------------------------------------------------------------------

function CustomerTermsDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSaveAnswers({ description })}
          placeholder="Summarise the dispute-resolution clause being attached"
        />
      </div>
      <FileSlotRow
        label="Contract clause / specimen"
        file={latestFileForSlot(itemFiles, "terms_doc")}
        onUpload={(f) => onUpload("terms_doc", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// pricing (CP5 member benefit packages & premiums, HMO only)
// ---------------------------------------------------------------------------

function PricingDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [description, setDescription] = useState(String(answers.description ?? ""));
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSaveAnswers({ description })}
          placeholder="Summarise the benefit packages and premium schedule being attached"
        />
      </div>
      <FileSlotRow
        label="Benefit packages / premium schedule"
        file={latestFileForSlot(itemFiles, "pricing_doc")}
        onUpload={(f) => onUpload("pricing_doc", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// multi_upload (B08 bankers & auditors, T04 agents & distribution network,
// F04 personal questionnaire forms) -- repeatable rows, one file per row.
// Generalised name/detail fields rather than Payments' country/licenceNumber
// shape, since none of Insurance's 3 uses are cross-border licences.
// ---------------------------------------------------------------------------

function MultiUploadDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [rows, setRows] = useState<MultiEntryRow[]>(() => {
    const existing = Array.isArray(answers.rows) ? (answers.rows as MultiEntryRow[]) : [];
    return existing.length ? existing : [{ rowId: newRowId(), name: "", detail: "" }];
  });

  function commit(next: MultiEntryRow[]) {
    setRows(next);
    onSaveAnswers({ rows: next });
  }

  function updateRow(rowId: string, patch: Partial<MultiEntryRow>) {
    commit(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    commit([...rows, { rowId: newRowId(), name: "", detail: "" }]);
  }

  function removeRow(rowId: string) {
    const next = rows.filter((r) => r.rowId !== rowId);
    commit(next.length ? next : [{ rowId: newRowId(), name: "", detail: "" }]);
  }

  return (
    <div className="space-y-4">
      {rows.map((r, idx) => (
        <div key={r.rowId} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
              Entry {idx + 1}
            </span>
            {rows.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(r.rowId)}>
                Remove
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                defaultValue={r.name}
                placeholder="e.g. Standard Chartered Bank, or a named agent"
                onBlur={(e) => updateRow(r.rowId, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Detail / role</label>
              <input
                className="input"
                defaultValue={r.detail}
                placeholder="e.g. Primary banker, external auditor, agent region"
                onBlur={(e) => updateRow(r.rowId, { detail: e.target.value })}
              />
            </div>
          </div>
          <FileSlotRow
            label="Supporting document"
            file={latestFileForSlot(itemFiles, `entry-${r.rowId}`)}
            onUpload={(f) => onUpload(`entry-${r.rowId}`, f)}
            onViewFile={onViewFile}
          />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
        + Add another entry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// fee_proof (C04 registration/application fee, F03 licensing fee) --
// single-class version of Payments' FeeProofDrawer: Insurance tracks one
// class_key per application rather than an array of assigned classes, so
// the "per class, not summed" banner collapses to the one fee tier for the
// chosen class_key, looked up by the caller and passed in as feeTier.
// ---------------------------------------------------------------------------

function FeeProofDrawer({ itemFiles, onSaveAnswers, onUpload, onViewFile, answers, feeTier, feeTypeLabel }: DrawerProps) {
  const [amountPaid, setAmountPaid] = useState(String(answers.amountPaid ?? ""));
  const [paymentReference, setPaymentReference] = useState(String(answers.paymentReference ?? ""));
  const [paymentDate, setPaymentDate] = useState(String(answers.paymentDate ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({ amountPaid, paymentReference, paymentDate, ...patch });
  }

  return (
    <div className="space-y-4">
      {feeTier && (
        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: "#e3f0e6", color: "var(--color-primary-dark)" }}>
          <div className="font-semibold">{feeTypeLabel} due:</div>
          <div className="flex items-center justify-between">
            <span>{formatUGX(Number(feeTier.amount))}</span>
          </div>
          {feeTier.note && <div style={{ color: "var(--color-primary-dark)" }}>{feeTier.note}</div>}
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Amount paid (UGX)</label>
          <input
            className="input"
            type="number"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            onBlur={() => commit({ amountPaid })}
          />
        </div>
        <div>
          <label className="label">Payment reference</label>
          <input
            className="input"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            onBlur={() => commit({ paymentReference })}
          />
        </div>
        <div>
          <label className="label">Payment date</label>
          <input
            className="input"
            type="date"
            value={paymentDate}
            onChange={(e) => {
              setPaymentDate(e.target.value);
              commit({ paymentDate: e.target.value });
            }}
          />
        </div>
      </div>
      <FileSlotRow
        label="Proof of payment"
        file={latestFileForSlot(itemFiles, "proof_of_payment")}
        onUpload={(f) => onUpload("proof_of_payment", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}
