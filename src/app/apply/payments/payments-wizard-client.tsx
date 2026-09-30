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

// Public, no-login Payments "Apply" wizard. The application it builds is
// anonymous by default (member_id stays null; RLS on
// member_licence_applications scopes an anonymous row to anyone who knows
// its own id) -- the visitor's browser is the only thing that remembers
// which application is theirs, via STORAGE_KEY. See
// strategy/beacon-template-redesign-plan.md §9.5 for the audited 58-item
// Payments schema this reads.
//
// Unlike Digital Lending's flat 2-route picker, Payments classification is a
// two-level, multi-select affair -- an applicant can hold combined licences
// (PSO + PSP + instrument issuer all at once), so the result is stored as a
// shape on the application's `facts` jsonb column rather than the single
// `class_key` column. See deriveChosenRoutes / deriveAssignedClasses below
// for the exact facts shape and how it drives template filtering.

const STORAGE_KEY = "beaconPaymentsApplicationId";
const BUCKET = "licence-application-files";

const PHASE_ORDER = ["company", "people", "business", "technology", "policies", "forms", "review"] as const;
type Phase = (typeof PHASE_ORDER)[number];
const PHASE_LABELS: Record<Phase, string> = {
  company: "Company",
  people: "People",
  business: "Business",
  technology: "Technology",
  policies: "Policies",
  forms: "Forms & Fees",
  review: "Review & Submit",
};
const PHASE_NOTES: Record<Phase, string> = {
  company: "The applicant entity, its structure and ownership, and its premises.",
  people: "The directors, senior managers, shareholders and other individuals behind the application.",
  business: "The products, business plan, capital and organisational structure.",
  technology: "The systems, controls and security behind how the service is delivered.",
  policies: "The AML/CFT, consumer-protection and commercial policies that govern the business.",
  forms: "The regulator's official forms, other licences held, and the application fee.",
  review: "Final checks before you submit, and what happens after approval.",
};

type ItemStatus = "not_started" | "in_progress" | "ready";
type Screen = "loading" | "classify" | "facts" | "wizard" | "submitted";

type Category = "pso" | "psp" | "instrument";
const CATEGORY_LABELS: Record<Category, string> = {
  pso: "Payment System Operator (PSO)",
  psp: "Payment Service Provider (PSP)",
  instrument: "Payment Instrument Issuer",
};

type AssignedClass = { category: Category; classKey: string };

type FactQuestion = { key: string; label: string };
const FACT_QUESTIONS: FactQuestion[] = [
  { key: "foreign_corporate_shareholder", label: "Does any corporate shareholder come from outside Uganda?" },
  {
    key: "foreign_resident_management",
    label: "Do any of your directors or senior managers hold foreign residency and need a work permit?",
  },
  { key: "established_business", label: "Has this business already been trading (not a new pre-trading entity)?" },
  {
    key: "electronic_platform",
    label: "Will customers access your service through an electronic platform (app, USSD, web, card)?",
  },
  { key: "outsourcing", label: "Will you outsource any part of your operations to a third party?" },
  {
    key: "payment_system_participation",
    label: "Will you participate in any other payment system operated by someone else?",
  },
  { key: "agents", label: "Will you use merchants or agents to deliver your service?" },
  { key: "existing_psp_pso_licence", label: "Do you already hold an existing PSP or PSO licence?" },
  { key: "foreign_licences", label: "Do you hold any payment-related licences in other countries?" },
];

// tin_tax (P07/P08... P07 specifically, plus B09) has two variants depending
// on which item it's attached to -- keyed by external_id.
const TIN_TAX_VARIANT: Record<string, "person" | "company"> = { P07: "person", B09: "company" };
// fee_proof (S03/L01) shows different expected-fee guidance depending on
// which item it's attached to -- keyed by external_id.
const FEE_TYPE_FOR_EXTERNAL_ID: Record<string, "application" | "licensing"> = { S03: "application", L01: "licensing" };
const FEE_TYPE_LABELS: Record<string, string> = { application: "Application fee", licensing: "Licensing fee", annual: "Annual fee" };

type PersonRow = { rowId: string; name: string; role: string; nationalId: string; address: string };
type CreditRow = { rowId: string; personName: string };
type TinTaxPersonRow = { rowId: string; personName: string; tin: string };
type ArrangementRow = { rowId: string; counterpartyName: string; description: string };
type MultiUploadRow = { rowId: string; country: string; licenceNumber: string };

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

function factKeyOf(template: LicenceApplicationTemplate): string | null {
  const fk = template.applicability?.fact_key;
  return typeof fk === "string" ? fk : null;
}

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
    case "official_form":
      return !!latestFileForSlot(itemFiles, "signed_form");
    case "product_desc":
    case "source_funds":
    case "it_controls":
    case "generic_upload":
    case "data_protection":
      return isFilled(answers.description) && itemFiles.length > 0;

    // ---- Payments-only ----
    case "ownership":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "ownership_chart");
    case "emi_structure":
      return (
        isFilled(answers.legalEntityName) &&
        isFilled(answers.structureDescription) &&
        !!latestFileForSlot(itemFiles, "structure_doc")
      );
    case "credit": {
      const rows = Array.isArray(answers.rows) ? (answers.rows as CreditRow[]) : [];
      return rows.length > 0 && rows.every((r) => isFilled(r.personName) && !!latestFileForSlot(itemFiles, `credit-report-${r.rowId}`));
    }
    case "tin_tax": {
      const variant = TIN_TAX_VARIANT[externalId] ?? "person";
      if (variant === "company") {
        return isFilled(answers.tin) && !!latestFileForSlot(itemFiles, "tax_clearance");
      }
      const rows = Array.isArray(answers.rows) ? (answers.rows as TinTaxPersonRow[]) : [];
      return (
        rows.length > 0 &&
        rows.every((r) => isFilled(r.personName) && isFilled(r.tin) && !!latestFileForSlot(itemFiles, `tin-${r.rowId}`))
      );
    }
    case "financials":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "financials_doc");
    case "pentest":
      return isFilled(answers.testerName) && isFilled(answers.testDate) && !!latestFileForSlot(itemFiles, "pentest_report");
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
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "rules_pack");
    case "customer_terms":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "terms_doc");
    case "pricing":
      return isFilled(answers.description) && !!latestFileForSlot(itemFiles, "pricing_doc");
    case "multi_upload": {
      const rows = Array.isArray(answers.rows) ? (answers.rows as MultiUploadRow[]) : [];
      return (
        rows.length > 0 &&
        rows.every((r) => isFilled(r.country) && isFilled(r.licenceNumber) && !!latestFileForSlot(itemFiles, `licence-${r.rowId}`))
      );
    }
    case "fee_proof":
      return isFilled(answers.amountPaid) && isFilled(answers.paymentReference) && !!latestFileForSlot(itemFiles, "proof_of_payment");
    case "data_centre":
      return isFilled(answers.location) && isFilled(answers.description) && !!latestFileForSlot(itemFiles, "data_centre_evidence");

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Facts helpers -- derive typed values out of the application's `facts` jsonb
// ---------------------------------------------------------------------------

function readCategories(facts: Record<string, unknown>): Category[] {
  const raw = Array.isArray(facts.categories) ? (facts.categories as unknown[]) : [];
  return raw.filter((c): c is Category => c === "pso" || c === "psp" || c === "instrument");
}

function readStringFact(facts: Record<string, unknown>, key: string): string | null {
  const v = facts[key];
  return typeof v === "string" ? v : null;
}

function readBoolFact(facts: Record<string, unknown>, key: string): boolean | null {
  const v = facts[key];
  return typeof v === "boolean" ? v : null;
}

function deriveAssignedClasses(facts: Record<string, unknown>): AssignedClass[] {
  const categories = readCategories(facts);
  const out: AssignedClass[] = [];
  if (categories.includes("pso")) {
    const key = readStringFact(facts, "psoClassKey");
    if (key) out.push({ category: "pso", classKey: key });
  }
  if (categories.includes("psp")) {
    const key = readStringFact(facts, "pspClassKey");
    if (key) out.push({ category: "psp", classKey: key });
  }
  if (categories.includes("instrument")) {
    out.push({ category: "instrument", classKey: "instrument" });
  }
  return out;
}

function deriveChosenRoutes(facts: Record<string, unknown>): Set<string> {
  const categories = readCategories(facts);
  const routes = new Set<string>();
  if (categories.includes("pso")) routes.add("pso");
  if (categories.includes("instrument")) routes.add("instrument");
  if (categories.includes("psp") && readBoolFact(facts, "pspIsEmiIssuer") === true) routes.add("emi");
  return routes;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function PaymentsWizardClient({
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
  const [activePhase, setActivePhase] = useState<Phase>("company");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [creatingApplication, setCreatingApplication] = useState(false);
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
    if (appRow.status === "submitted") {
      setScreen("submitted");
    } else if (readCategories(appRow.facts).length > 0) {
      setScreen("wizard");
    } else {
      setScreen("classify");
    }
  }

  async function resume() {
    let id: string | null = null;
    try {
      id = localStorage.getItem(STORAGE_KEY);
    } catch {
      id = null;
    }
    if (!id) {
      setScreen("classify");
      return;
    }
    const { data, error } = await supabase.from("member_licence_applications").select("*").eq("id", id).maybeSingle();
    if (error || !data) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setScreen("classify");
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

  // Classify screen "Continue" -- either creates the application (first
  // time) or updates its facts (if the visitor came back to reclassify).
  async function handleClassifyContinue(draftFacts: Record<string, unknown>) {
    setErrorMsg(null);
    if (!application) {
      setCreatingApplication(true);
      const { data, error } = await supabase
        .from("member_licence_applications")
        .insert({ member_id: null, application_key: applicationKey, class_key: null, facts: draftFacts, status: "draft" })
        .select("*")
        .single();
      setCreatingApplication(false);
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
      setApplication(data as MemberLicenceApplication);
      setItemStates({});
      setFiles({});
      setScreen("facts");
      return;
    }
    await persistFacts(draftFacts, application);
    setScreen("facts");
  }

  async function persistFacts(patch: Record<string, unknown>, appOverride?: MemberLicenceApplication) {
    const app = appOverride ?? application;
    if (!app) return;
    const nextFacts = { ...app.facts, ...patch };
    setApplication((a) => (a ? { ...a, facts: nextFacts } : a));
    const { error } = await supabase.from("member_licence_applications").update({ facts: nextFacts }).eq("id", app.id);
    if (error) {
      console.error("Failed to save your answers", error);
      setErrorMsg("We couldn't save that answer. Please try again.");
    }
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
    setExpanded({});
    setActivePhase("company");
    setScreen("classify");
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

  const facts = useMemo(() => application?.facts ?? {}, [application]);
  const categories = useMemo(() => readCategories(facts), [facts]);
  const assignedClasses = useMemo(() => deriveAssignedClasses(facts), [facts]);
  const chosenRoutes = useMemo(() => deriveChosenRoutes(facts), [facts]);
  const factAnswers = useMemo(() => {
    const out: Record<string, boolean | undefined> = {};
    FACT_QUESTIONS.forEach((q) => {
      out[q.key] = readBoolFact(facts, q.key) ?? undefined;
    });
    return out;
  }, [facts]);

  const visibleTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (t.route_key !== null && !chosenRoutes.has(t.route_key)) return false;
      const fk = factKeyOf(t);
      if (fk) return factAnswers[fk] === true;
      return true;
    });
  }, [templates, chosenRoutes, factAnswers]);

  const phaseGroups = useMemo(() => {
    const map: Record<Phase, LicenceApplicationTemplate[]> = {
      company: [],
      people: [],
      business: [],
      technology: [],
      policies: [],
      forms: [],
      review: [],
    };
    visibleTemplates.forEach((t) => {
      const p = t.phase as Phase;
      if (map[p]) map[p].push(t);
    });
    (Object.keys(map) as Phase[]).forEach((p) => map[p].sort((a, b) => a.seq - b.seq));
    return map;
  }, [visibleTemplates]);

  const wizardClassesByKey = useMemo(() => {
    const out: Record<string, LicenceApplicationWizardClass> = {};
    wizardClasses.forEach((c) => {
      out[c.class_key] = c;
    });
    return out;
  }, [wizardClasses]);

  function statusFor(externalId: string): ItemStatus {
    return itemStates[externalId]?.status ?? "not_started";
  }

  const readyCount = visibleTemplates.filter((t) => statusFor(t.external_id) === "ready").length;
  const allReady = visibleTemplates.length > 0 && readyCount === visibleTemplates.length;
  const allFactsAnswered = FACT_QUESTIONS.every((q) => typeof factAnswers[q.key] === "boolean");

  // ---- Screens ----

  if (screen === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center" style={{ color: "var(--color-text-muted)" }}>
        Loading your application…
      </div>
    );
  }

  if (screen === "classify") {
    return (
      <ClassifyScreen
        wizardClasses={wizardClasses}
        initialFacts={facts}
        creating={creatingApplication}
        errorMsg={errorMsg}
        onContinue={handleClassifyContinue}
      />
    );
  }

  if (screen === "facts") {
    return (
      <FactsScreen
        factAnswers={factAnswers}
        allAnswered={allFactsAnswered}
        errorMsg={errorMsg}
        onToggle={(key, value) => persistFacts({ [key]: value })}
        onBack={() => setScreen("classify")}
        onContinue={() => setScreen("wizard")}
      />
    );
  }

  if (screen === "submitted" && application) {
    const classLabels = assignedClasses
      .map((ac) => wizardClassesByKey[ac.classKey]?.label ?? ac.classKey)
      .join(", ");
    return (
      <SubmittedScreen
        application={application}
        classLabel={classLabels || "Payments"}
        readyCount={readyCount}
        total={visibleTemplates.length}
        onStartOver={startOver}
      />
    );
  }

  if (!application) return null;

  const classLabels = assignedClasses.map((ac) => wizardClassesByKey[ac.classKey]?.label ?? ac.classKey).join(", ");

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
            Payments application
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {classLabels || "Payments"} · saved automatically in this browser · reference {application.id.slice(0, 8)}
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
        <Sidebar
          phaseGroups={phaseGroups}
          itemStates={itemStates}
          activePhase={activePhase}
          onSelectPhase={setActivePhase}
          categories={categories}
          assignedClasses={assignedClasses}
          wizardClassesByKey={wizardClassesByKey}
          feeTiers={feeTiers}
          readyCount={readyCount}
          total={visibleTemplates.length}
        />

        <main className="flex-1 min-w-0">
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
              assignedClasses={assignedClasses}
              wizardClassesByKey={wizardClassesByKey}
              feeTiers={feeTiers}
            />
          ))}
          {activePhase === "review" && (
            <div className="card p-4 mt-6">
              <h3 className="text-base font-semibold">Submit application</h3>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                {readyCount} of {visibleTemplates.length} checklist items are ready. Every applicable item must be
                Ready before you can submit.
              </p>
              <button className="btn btn-primary mt-3" type="button" disabled={!allReady || submitting} onClick={submitApplication}>
                {submitting ? "Submitting…" : "Submit application"}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classify screen (step 1: category multi-select, step 2: per-category refinement)
// ---------------------------------------------------------------------------

function ClassifyScreen({
  wizardClasses,
  initialFacts,
  creating,
  errorMsg,
  onContinue,
}: {
  wizardClasses: LicenceApplicationWizardClass[];
  initialFacts: Record<string, unknown>;
  creating: boolean;
  errorMsg: string | null;
  onContinue: (facts: Record<string, unknown>) => void;
}) {
  const [categories, setCategories] = useState<Set<Category>>(() => new Set(readCategories(initialFacts)));
  const [psoClassKey, setPsoClassKey] = useState<string | null>(readStringFact(initialFacts, "psoClassKey"));
  const [pspIsEmiIssuer, setPspIsEmiIssuer] = useState<boolean | null>(readBoolFact(initialFacts, "pspIsEmiIssuer"));
  const [pspClassKey, setPspClassKey] = useState<string | null>(readStringFact(initialFacts, "pspClassKey"));

  const psoClasses = useMemo(
    () => wizardClasses.filter((c) => c.fee_class_label === "PSO" && c.class_key.startsWith("pso_")),
    [wizardClasses]
  );
  const pspEmiClasses = useMemo(() => wizardClasses.filter((c) => c.class_key.startsWith("psp_emi_")), [wizardClasses]);
  const pspOtherClass = useMemo(() => wizardClasses.find((c) => c.class_key === "psp_other") ?? null, [wizardClasses]);
  const instrumentClass = useMemo(() => wizardClasses.find((c) => c.class_key === "instrument") ?? null, [wizardClasses]);

  function toggleCategory(cat: Category) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
        if (cat === "pso") setPsoClassKey(null);
        if (cat === "psp") {
          setPspIsEmiIssuer(null);
          setPspClassKey(null);
        }
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  const psoOk = !categories.has("pso") || !!psoClassKey;
  const pspOk =
    !categories.has("psp") || pspIsEmiIssuer === false || (pspIsEmiIssuer === true && !!pspClassKey);
  const canContinue = categories.size > 0 && psoOk && pspOk;

  function handleContinue() {
    if (!canContinue) return;
    const finalPspClassKey = categories.has("psp") ? (pspIsEmiIssuer ? pspClassKey : "psp_other") : null;
    onContinue({
      categories: Array.from(categories),
      psoClassKey: categories.has("pso") ? psoClassKey : null,
      pspIsEmiIssuer: categories.has("psp") ? pspIsEmiIssuer : null,
      pspClassKey: finalPspClassKey,
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        Bank of Uganda · Payments
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        What kind of Payments licence(s) are you applying for?
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        No account is needed to start. Your progress is saved in this browser as you go, so you can close this tab
        and come back to it later on the same device. You can select more than one category if you&apos;re applying
        for combined licences.
      </p>

      {errorMsg && (
        <div className="badge badge-red mt-4" style={{ display: "block", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>
          {errorMsg}
        </div>
      )}

      <div className="space-y-4 mt-8">
        {(["pso", "psp", "instrument"] as Category[]).map((cat) => (
          <div key={cat} className="card p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={categories.has(cat)}
                onChange={() => toggleCategory(cat)}
              />
              <span className="font-semibold">{CATEGORY_LABELS[cat]}</span>
            </label>

            {cat === "pso" && categories.has("pso") && (
              <div className="mt-4 pl-7 space-y-2">
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Which PSO class describes your system?
                </p>
                {psoClasses.map((c) => (
                  <label key={c.class_key} className="flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer" style={{ borderColor: "var(--color-border)" }}>
                    <input
                      type="radio"
                      name="psoClass"
                      className="mt-1"
                      checked={psoClassKey === c.class_key}
                      onChange={() => setPsoClassKey(c.class_key)}
                    />
                    <span>
                      <span className="block font-medium text-sm">{c.label}</span>
                      {c.description && (
                        <span className="block text-sm" style={{ color: "var(--color-text-muted)" }}>
                          {c.description}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {cat === "psp" && categories.has("psp") && (
              <div className="mt-4 pl-7 space-y-3">
                <p className="text-sm">Will this business issue electronic money (e-money)?</p>
                <div className="flex gap-2">
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      className={`btn btn-sm ${pspIsEmiIssuer === opt.value ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => {
                        setPspIsEmiIssuer(opt.value);
                        setPspClassKey(opt.value ? null : "psp_other");
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {pspIsEmiIssuer === true && (
                  <div className="space-y-2">
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      Which trust-account value band applies?
                    </p>
                    {pspEmiClasses.map((c) => (
                      <label key={c.class_key} className="flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer" style={{ borderColor: "var(--color-border)" }}>
                        <input
                          type="radio"
                          name="pspEmiClass"
                          className="mt-1"
                          checked={pspClassKey === c.class_key}
                          onChange={() => setPspClassKey(c.class_key)}
                        />
                        <span>
                          <span className="block font-medium text-sm">{c.label}</span>
                          {c.description && (
                            <span className="block text-sm" style={{ color: "var(--color-text-muted)" }}>
                              {c.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {pspIsEmiIssuer === false && pspOtherClass && (
                  <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--color-border)" }}>
                    <span className="block font-medium text-sm">{pspOtherClass.label}</span>
                    {pspOtherClass.description && (
                      <span className="block text-sm" style={{ color: "var(--color-text-muted)" }}>
                        {pspOtherClass.description}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {cat === "instrument" && categories.has("instrument") && instrumentClass && (
              <div className="mt-4 pl-7">
                <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--color-border)" }}>
                  <span className="block font-medium text-sm">{instrumentClass.label}</span>
                  {instrumentClass.description && (
                    <span className="block text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {instrumentClass.description}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="btn btn-primary mt-6" type="button" disabled={!canContinue || creating} onClick={handleContinue}>
        {creating ? "Starting…" : "Continue →"}
      </button>

      <p className="text-xs mt-8" style={{ color: "var(--color-text-muted)" }}>
        Not sure which category applies to you? Visit the{" "}
        <a href="/apply" className="underline" style={{ color: "var(--color-primary)" }}>
          Apply hub
        </a>{" "}
        and speak to an expert before you start.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facts screen (step 3: ~9 yes/no gating questions)
// ---------------------------------------------------------------------------

function FactsScreen({
  factAnswers,
  allAnswered,
  errorMsg,
  onToggle,
  onBack,
  onContinue,
}: {
  factAnswers: Record<string, boolean | undefined>;
  allAnswered: boolean;
  errorMsg: string | null;
  onToggle: (key: string, value: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        ← Change classification
      </button>
      <div className="text-xs font-semibold uppercase tracking-wide mt-4" style={{ color: "var(--color-text-muted)" }}>
        Bank of Uganda · Payments
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        About your business
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        A few quick questions decide which extra requirements apply to you. Answer every question to continue.
      </p>

      {errorMsg && (
        <div className="badge badge-red mt-4" style={{ display: "block", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>
          {errorMsg}
        </div>
      )}

      <div className="space-y-3 mt-6">
        {FACT_QUESTIONS.map((q) => (
          <div key={q.key} className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm">{q.label}</p>
            <div className="flex gap-2 mt-2">
              {[
                { label: "Yes", value: true },
                { label: "No", value: false },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={`btn btn-sm ${factAnswers[q.key] === opt.value ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => onToggle(q.key, opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-primary mt-6" type="button" disabled={!allAnswered} onClick={onContinue}>
        Continue to checklist →
      </button>
      {!allAnswered && (
        <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
          Answer every question above to continue.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submitted confirmation
// ---------------------------------------------------------------------------

function SubmittedScreen({
  application,
  classLabel,
  readyCount,
  total,
  onStartOver,
}: {
  application: MemberLicenceApplication;
  classLabel: string;
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
        Your {classLabel} application has been submitted.
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
// Sidebar: phase nav + per-category fee summary
// ---------------------------------------------------------------------------

function Sidebar({
  phaseGroups,
  itemStates,
  activePhase,
  onSelectPhase,
  categories,
  assignedClasses,
  wizardClassesByKey,
  feeTiers,
  readyCount,
  total,
}: {
  phaseGroups: Record<Phase, LicenceApplicationTemplate[]>;
  itemStates: Record<string, MemberLicenceApplicationItemState>;
  activePhase: Phase;
  onSelectPhase: (p: Phase) => void;
  categories: Category[];
  assignedClasses: AssignedClass[];
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>;
  feeTiers: LicenceApplicationFeeTier[];
  readyCount: number;
  total: number;
}) {
  return (
    <aside className="w-full md:w-72 shrink-0 space-y-3">
      <div className="card p-4">
        <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
          Categories
        </div>
        <div className="font-medium mt-1 text-sm">{categories.map((c) => CATEGORY_LABELS[c]).join(", ") || "—"}</div>
        <div className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
          {readyCount} of {total} items ready
        </div>
      </div>
      <nav className="card overflow-hidden">
        {PHASE_ORDER.map((p) => {
          const items = phaseGroups[p] ?? [];
          const ready = items.filter((t) => (itemStates[t.external_id]?.status ?? "not_started") === "ready").length;
          const active = activePhase === p;
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
      </nav>
      <FeeSummaryPanel assignedClasses={assignedClasses} wizardClassesByKey={wizardClassesByKey} feeTiers={feeTiers} />
    </aside>
  );
}

// Per-category fee display -- never summed across categories, since each
// assigned class is a separate licence with its own fee schedule.
function FeeSummaryPanel({
  assignedClasses,
  wizardClassesByKey,
  feeTiers,
}: {
  assignedClasses: AssignedClass[];
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>;
  feeTiers: LicenceApplicationFeeTier[];
}) {
  if (assignedClasses.length === 0) return null;
  return (
    <div className="space-y-3">
      {assignedClasses.map((ac) => {
        const cls = wizardClassesByKey[ac.classKey];
        const rows = feeTiers.filter((f) => f.class_key === ac.classKey);
        return (
          <div key={`${ac.category}-${ac.classKey}`} className="card p-4">
            <div className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
              {cls?.fee_class_label ?? ac.category.toUpperCase()} fees
            </div>
            <div className="font-medium mt-1 text-sm">{cls?.label ?? ac.classKey}</div>
            {cls?.description && (
              <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                {cls.description}
              </div>
            )}
            <div className="mt-2 space-y-1">
              {rows.length === 0 && (
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  No fee schedule on file for this class.
                </div>
              )}
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span>{FEE_TYPE_LABELS[r.fee_type] ?? r.fee_type}</span>
                  <span className="font-medium">{formatUGX(Number(r.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
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
  assignedClasses,
  wizardClassesByKey,
  feeTiers,
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
  assignedClasses: AssignedClass[];
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>;
  feeTiers: LicenceApplicationFeeTier[];
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
            assignedClasses={assignedClasses}
            wizardClassesByKey={wizardClassesByKey}
            feeTiers={feeTiers}
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
  assignedClasses: AssignedClass[];
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>;
  feeTiers: LicenceApplicationFeeTier[];
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
    case "official_form":
      return <OfficialFormDrawer {...props} />;
    case "product_desc":
    case "source_funds":
    case "it_controls":
    case "generic_upload":
    case "data_protection":
      return <DescribeAndAttachDrawer {...props} />;

    // ---- Payments-only ----
    case "ownership":
      return <OwnershipDrawer {...props} />;
    case "emi_structure":
      return <EmiStructureDrawer {...props} />;
    case "credit":
      return <CreditDrawer {...props} />;
    case "tin_tax":
      return <TinTaxDrawer {...props} />;
    case "financials":
      return <FinancialsDrawer {...props} />;
    case "pentest":
      return <PentestDrawer {...props} />;
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
    case "data_centre":
      return <DataCentreDrawer {...props} />;

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
// people (repeatable rows, one supporting-document slot per person). Reused
// verbatim across P02/P03/P04/P05/P08/P10/F04 -- the file label is kept
// generic since the specific document expected (CV, ID, certificate of good
// conduct, recommendation letter, work permit, Form B...) is explained by
// each item's own title/copy/guidance rather than the drawer chrome.
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
            label="Supporting document"
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
// official_form
// ---------------------------------------------------------------------------

function OfficialFormDrawer({ itemFiles, onUpload, onViewFile, template }: DrawerProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {template.source_url ? (
          <>
            This is the regulator&apos;s official form and must be completed and signed outside Beacon.{" "}
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
          "This is the regulator's official form and must be completed and signed outside Beacon. Upload the final signed copy below."
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
// it_controls, generic_upload and data_protection, since each of those is
// fundamentally the same shape (per the build spec).
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
// ownership (C04, C06, P01)
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
          placeholder="Describe the ownership chain down to the ultimate beneficial owner(s)"
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
// emi_structure (G03)
// ---------------------------------------------------------------------------

function EmiStructureDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [legalEntityName, setLegalEntityName] = useState(String(answers.legalEntityName ?? ""));
  const [structureDescription, setStructureDescription] = useState(String(answers.structureDescription ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({ legalEntityName, structureDescription, ...patch });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Legal entity name</label>
        <input
          className="input"
          value={legalEntityName}
          onChange={(e) => setLegalEntityName(e.target.value)}
          onBlur={() => commit({ legalEntityName })}
        />
      </div>
      <div>
        <label className="label">Structure description</label>
        <textarea
          className="input"
          rows={4}
          value={structureDescription}
          onChange={(e) => setStructureDescription(e.target.value)}
          onBlur={() => commit({ structureDescription })}
          placeholder="Describe how the EMI legal entity is established and how it relates to any parent or group"
        />
      </div>
      <FileSlotRow
        label="Structure document"
        file={latestFileForSlot(itemFiles, "structure_doc")}
        onUpload={(f) => onUpload("structure_doc", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// credit (P06) -- repeatable rows, one credit-report file per person
// ---------------------------------------------------------------------------

function CreditDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [rows, setRows] = useState<CreditRow[]>(() => {
    const existing = Array.isArray(answers.rows) ? (answers.rows as CreditRow[]) : [];
    return existing.length ? existing : [{ rowId: newRowId(), personName: "" }];
  });

  function commit(next: CreditRow[]) {
    setRows(next);
    onSaveAnswers({ rows: next });
  }

  function updateRow(rowId: string, patch: Partial<CreditRow>) {
    commit(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    commit([...rows, { rowId: newRowId(), personName: "" }]);
  }

  function removeRow(rowId: string) {
    const next = rows.filter((r) => r.rowId !== rowId);
    commit(next.length ? next : [{ rowId: newRowId(), personName: "" }]);
  }

  return (
    <div className="space-y-4">
      {rows.map((r, idx) => (
        <div key={r.rowId} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
              Person {idx + 1}
            </span>
            {rows.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(r.rowId)}>
                Remove
              </button>
            )}
          </div>
          <div>
            <label className="label">Full name</label>
            <input
              className="input"
              defaultValue={r.personName}
              onBlur={(e) => updateRow(r.rowId, { personName: e.target.value })}
            />
          </div>
          <FileSlotRow
            label="Credit-reference report"
            file={latestFileForSlot(itemFiles, `credit-report-${r.rowId}`)}
            onUpload={(f) => onUpload(`credit-report-${r.rowId}`, f)}
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
// tin_tax (P07 person variant / B09 company variant)
// ---------------------------------------------------------------------------

function TinTaxDrawer({ template, answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const variant = TIN_TAX_VARIANT[template.external_id] ?? "person";

  if (variant === "company") {
    return <TinTaxCompanyDrawer answers={answers} itemFiles={itemFiles} onSaveAnswers={onSaveAnswers} onUpload={onUpload} onViewFile={onViewFile} />;
  }
  return <TinTaxPersonDrawer answers={answers} itemFiles={itemFiles} onSaveAnswers={onSaveAnswers} onUpload={onUpload} onViewFile={onViewFile} />;
}

function TinTaxCompanyDrawer({
  answers,
  itemFiles,
  onSaveAnswers,
  onUpload,
  onViewFile,
}: Pick<DrawerProps, "answers" | "itemFiles" | "onSaveAnswers" | "onUpload" | "onViewFile">) {
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

function TinTaxPersonDrawer({
  answers,
  itemFiles,
  onSaveAnswers,
  onUpload,
  onViewFile,
}: Pick<DrawerProps, "answers" | "itemFiles" | "onSaveAnswers" | "onUpload" | "onViewFile">) {
  const [rows, setRows] = useState<TinTaxPersonRow[]>(() => {
    const existing = Array.isArray(answers.rows) ? (answers.rows as TinTaxPersonRow[]) : [];
    return existing.length ? existing : [{ rowId: newRowId(), personName: "", tin: "" }];
  });

  function commit(next: TinTaxPersonRow[]) {
    setRows(next);
    onSaveAnswers({ rows: next });
  }

  function updateRow(rowId: string, patch: Partial<TinTaxPersonRow>) {
    commit(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    commit([...rows, { rowId: newRowId(), personName: "", tin: "" }]);
  }

  function removeRow(rowId: string) {
    const next = rows.filter((r) => r.rowId !== rowId);
    commit(next.length ? next : [{ rowId: newRowId(), personName: "", tin: "" }]);
  }

  return (
    <div className="space-y-4">
      {rows.map((r, idx) => (
        <div key={r.rowId} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
              Person {idx + 1}
            </span>
            {rows.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(r.rowId)}>
                Remove
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                defaultValue={r.personName}
                onBlur={(e) => updateRow(r.rowId, { personName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Personal TIN</label>
              <input className="input" defaultValue={r.tin} onBlur={(e) => updateRow(r.rowId, { tin: e.target.value })} />
            </div>
          </div>
          <FileSlotRow
            label="Tax-clearance evidence"
            file={latestFileForSlot(itemFiles, `tin-${r.rowId}`)}
            onUpload={(f) => onUpload(`tin-${r.rowId}`, f)}
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
// financials (B03, B06)
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
          placeholder="Summarise the business plan and financial projections, or the historical financials, being attached"
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
// pentest (T07)
// ---------------------------------------------------------------------------

function PentestDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [testerName, setTesterName] = useState(String(answers.testerName ?? ""));
  const [testDate, setTestDate] = useState(String(answers.testDate ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({ testerName, testDate, ...patch });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div>
        <label className="label">Tester / firm name</label>
        <input
          className="input"
          value={testerName}
          onChange={(e) => setTesterName(e.target.value)}
          onBlur={() => commit({ testerName })}
        />
      </div>
      <div>
        <label className="label">Test date</label>
        <input
          className="input"
          type="date"
          value={testDate}
          onChange={(e) => {
            setTestDate(e.target.value);
            commit({ testDate: e.target.value });
          }}
        />
      </div>
      <div className="sm:col-span-2">
        <FileSlotRow
          label="Penetration-test report"
          file={latestFileForSlot(itemFiles, "pentest_report")}
          onUpload={(f) => onUpload("pentest_report", f)}
          onViewFile={onViewFile}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// repeat_arrangement (T09, T10, A06) -- repeatable rows, one file per row
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
// docpack (T11)
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
          placeholder="Summarise the payment-system rules being attached"
        />
      </div>
      <FileSlotRow
        label="Payment-system rules pack"
        file={latestFileForSlot(itemFiles, "rules_pack")}
        onUpload={(f) => onUpload("rules_pack", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// customer_terms (A04)
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
          placeholder="Summarise the customer terms or service agreement being attached"
        />
      </div>
      <FileSlotRow
        label="Customer terms / service agreement"
        file={latestFileForSlot(itemFiles, "terms_doc")}
        onUpload={(f) => onUpload("terms_doc", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// pricing (A05)
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
          placeholder="Summarise the pricing and fee disclosure being attached"
        />
      </div>
      <FileSlotRow
        label="Pricing / fee disclosure"
        file={latestFileForSlot(itemFiles, "pricing_doc")}
        onUpload={(f) => onUpload("pricing_doc", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// multi_upload (S02) -- repeatable rows, one licence file per row
// ---------------------------------------------------------------------------

function MultiUploadDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [rows, setRows] = useState<MultiUploadRow[]>(() => {
    const existing = Array.isArray(answers.rows) ? (answers.rows as MultiUploadRow[]) : [];
    return existing.length ? existing : [{ rowId: newRowId(), country: "", licenceNumber: "" }];
  });

  function commit(next: MultiUploadRow[]) {
    setRows(next);
    onSaveAnswers({ rows: next });
  }

  function updateRow(rowId: string, patch: Partial<MultiUploadRow>) {
    commit(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function addRow() {
    commit([...rows, { rowId: newRowId(), country: "", licenceNumber: "" }]);
  }

  function removeRow(rowId: string) {
    const next = rows.filter((r) => r.rowId !== rowId);
    commit(next.length ? next : [{ rowId: newRowId(), country: "", licenceNumber: "" }]);
  }

  return (
    <div className="space-y-4">
      {rows.map((r, idx) => (
        <div key={r.rowId} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase" style={{ color: "var(--color-text-muted)" }}>
              Licence {idx + 1}
            </span>
            {rows.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(r.rowId)}>
                Remove
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Country</label>
              <input
                className="input"
                defaultValue={r.country}
                onBlur={(e) => updateRow(r.rowId, { country: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Licence number</label>
              <input
                className="input"
                defaultValue={r.licenceNumber}
                onBlur={(e) => updateRow(r.rowId, { licenceNumber: e.target.value })}
              />
            </div>
          </div>
          <FileSlotRow
            label="Licence document"
            file={latestFileForSlot(itemFiles, `licence-${r.rowId}`)}
            onUpload={(f) => onUpload(`licence-${r.rowId}`, f)}
            onViewFile={onViewFile}
          />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>
        + Add another licence
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// fee_proof (S03 application fee, L01 licensing fee)
// ---------------------------------------------------------------------------

function FeeProofDrawer({ template, answers, itemFiles, onSaveAnswers, onUpload, onViewFile, assignedClasses, wizardClassesByKey, feeTiers }: DrawerProps) {
  const [amountPaid, setAmountPaid] = useState(String(answers.amountPaid ?? ""));
  const [paymentReference, setPaymentReference] = useState(String(answers.paymentReference ?? ""));
  const [paymentDate, setPaymentDate] = useState(String(answers.paymentDate ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({ amountPaid, paymentReference, paymentDate, ...patch });
  }

  const feeType = FEE_TYPE_FOR_EXTERNAL_ID[template.external_id] ?? "application";
  const expectedRows = assignedClasses
    .map((ac) => ({
      ac,
      cls: wizardClassesByKey[ac.classKey],
      fee: feeTiers.find((f) => f.class_key === ac.classKey && f.fee_type === feeType),
    }))
    .filter((r) => r.fee);

  return (
    <div className="space-y-4">
      {expectedRows.length > 0 && (
        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: "#e3f0e6", color: "var(--color-primary-dark)" }}>
          <div className="font-semibold">
            {feeType === "licensing" ? "Licence fee due" : "Application fee due"} (per class, not summed):
          </div>
          {expectedRows.map((r) => (
            <div key={r.ac.classKey} className="flex items-center justify-between">
              <span>{r.cls?.label ?? r.ac.classKey}</span>
              <span className="font-medium">{formatUGX(Number(r.fee?.amount ?? 0))}</span>
            </div>
          ))}
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

// ---------------------------------------------------------------------------
// data_centre (L07)
// ---------------------------------------------------------------------------

function DataCentreDrawer({ answers, itemFiles, onSaveAnswers, onUpload, onViewFile }: DrawerProps) {
  const [location, setLocation] = useState(String(answers.location ?? ""));
  const [description, setDescription] = useState(String(answers.description ?? ""));

  function commit(patch: Record<string, unknown>) {
    onSaveAnswers({ location, description, ...patch });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Data-centre location</label>
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} onBlur={() => commit({ location })} />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => commit({ description })}
          placeholder="Describe how the primary data centre is established in Uganda"
        />
      </div>
      <FileSlotRow
        label="Evidence"
        file={latestFileForSlot(itemFiles, "data_centre_evidence")}
        onUpload={(f) => onUpload("data_centre_evidence", f)}
        onViewFile={onViewFile}
      />
    </div>
  );
}
