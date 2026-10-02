"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./payments-workspace.module.css";
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
// Exact category names + order from the Beacon prototype's PHASES array for
// this selection of licence classes (Funds Transfer System / Small Funds
// Transfer System / Settlement System / Electronic Money Issuer / Small
// Electronic Money Issuer). These map 1:1 onto PHASE_ORDER.
const PHASE_LABELS: Record<Phase, string> = {
  company: "Company setup",
  people: "Owners, directors & management",
  business: "Business & financials",
  technology: "Risk, technology & operations",
  policies: "Customers & compliance",
  forms: "Forms & submission",
  review: "BoU review & approval readiness",
};

type ItemStatus = "not_started" | "in_progress" | "ready";
// "landing" / "unlisted" / "expert" / "sandbox" / "result" are the
// pre-workspace "assessment" front door from the Beacon prototype
// (screen-landing / screen-unlisted / screen-expert / screen-sandbox /
// screen-result) that the earlier Beacon-migration rounds never carried
// over -- they jumped straight from the Apply hub into "classify". See
// strategy/deployment-status.md's "Assessment front door" round for the
// full audit. Order: landing -> classify -> (unlisted -> expert | sandbox,
// optional detour) -> result -> facts -> wizard -> submitted.
type Screen = "loading" | "landing" | "classify" | "unlisted" | "expert" | "sandbox" | "result" | "facts" | "wizard" | "submitted";
type WorkspaceTab = "checklist" | "documents" | "review";
type StatusFilter = "all" | "remaining" | "done";
// The single slide-in workspace drawer serves three purposes, matching the
// prototype's one #workspace-drawer reused by openWorkDrawer / openGuidance /
// openExpertSupport / openExpertInquiry.
type DrawerState =
  | { kind: "requirement"; externalId: string }
  | { kind: "guidance"; externalId: string }
  | { kind: "expert-menu" }
  | { kind: "expert-ask" }
  | { kind: "expert-sent" }
  | null;

type ApplicationReview = {
  status: "requested";
  type: "interim" | "final";
  requestedAt: string;
  requestedProgress: number;
};

function readApplicationReview(facts: Record<string, unknown>): ApplicationReview | null {
  const v = facts.applicationReview;
  if (v && typeof v === "object") return v as ApplicationReview;
  return null;
}

type Category = "pso" | "psp" | "instrument";

type AssignedClass = { category: Category; classKey: string };

// ---------------------------------------------------------------------------
// Classification data model -- exact port of the Beacon prototype's
// CLASS_OPTIONS / renderSubQuestions / classificationLabel / classificationDetail
// / selectedFeeRows / resultFeeClassLabel / renderLicenceResult logic (prototype
// lines ~2046-2286). Payments classification is a flat, fully multi-select list
// of 10 independent business activities -- not the 2-level PSO/PSP category +
// single-radio-class model this screen used before. Any combination of
// activities may be selected simultaneously; two of them (funds_transfer, emi)
// trigger an inline follow-up value-band question that determines a specific
// class_key/fee row. Multiple activities can collapse onto the same underlying
// licence class (psp_tokens + psp_other both resolve to "psp_other"; all three
// instrument activities resolve to "instrument") -- deriveAssignedClasses below
// dedupes on class_key exactly like the prototype's selectedFeeRows pushUnique.
// ---------------------------------------------------------------------------

type ActivityKey =
  | "funds_transfer"
  | "clearing"
  | "settlement"
  | "third_party"
  | "emi"
  | "psp_tokens"
  | "psp_other"
  | "payment_cards"
  | "electronic_devices"
  | "paper_instruments";

type ActivityDef = {
  key: ActivityKey;
  category: Category;
  categoryLabel: string;
  title: string;
  activity: string;
  info: string;
};

// Verbatim copy (title/activity/info text) from the prototype's CLASS_OPTIONS array.
const ACTIVITY_OPTIONS: ActivityDef[] = [
  {
    key: "funds_transfer",
    category: "pso",
    categoryLabel: "Payment System Operator",
    title: "Funds Transfer System",
    activity: "P2P · P2B · B2B · B2G · Card processors",
    info: "A funds transfer system enables monetary value or payment orders to be transferred between parties. This includes P2P, P2B, B2B and B2G payment systems, as well as card processors operating common rules and standardised arrangements for transferring payment orders.",
  },
  {
    key: "clearing",
    category: "pso",
    categoryLabel: "Payment System Operator",
    title: "Clearing System / Switch",
    activity: "Clearing · Switching",
    info: "Clearing is the process of transmitting, reconciling and confirming transfer orders before settlement and establishing the final positions to be settled. A clearing system provides the rules and procedures through which participants exchange payment information and may calculate their mutual positions before settlement.",
  },
  {
    key: "settlement",
    category: "pso",
    categoryLabel: "Payment System Operator",
    title: "Settlement System",
    activity: "RTGS · Deferred settlement · Central securities depository systems",
    info: "A settlement system facilitates the settlement of payment obligations between participants. It includes real-time gross settlement systems, deferred settlement systems and central securities depository systems used to facilitate settlement of funds.",
  },
  {
    key: "third_party",
    category: "pso",
    categoryLabel: "Payment System Operator",
    title: "Third-Party System",
    activity: "Aggregator · Integrator · Gateway",
    info: "A third-party system includes an aggregator, integrator or gateway that facilitates the receipt of electronic payments from a customer without first setting up a merchant account.",
  },
  {
    key: "emi",
    category: "psp",
    categoryLabel: "Payment Service Provider",
    title: "Electronic Money Issuer",
    activity: "Issuance of electronic money",
    info: "Electronic money is monetary value represented by a claim on the issuer that is stored electronically, issued upon receipt of funds of at least the same value, accepted as a means of payment by persons other than the issuer, and prepaid or redeemable in cash.",
  },
  {
    key: "psp_tokens",
    category: "psp",
    categoryLabel: "Payment Service Provider",
    title: "Payment Services including Tokens",
    activity: "Payment services · Tokens",
    info: "Payment services include services enabling cash deposits or withdrawals, execution of payment transactions, issuance and acquisition of payment instruments, and other services incidental to the transfer of funds. This licence class includes payment services involving tokens.",
  },
  {
    key: "psp_other",
    category: "psp",
    categoryLabel: "Payment Service Provider",
    title: "Any other Payment Service Provider",
    activity: "Payment services that do not create electronic money",
    info: "A payment service provider offering payment services but not creating electronic money.",
  },
  {
    key: "payment_cards",
    category: "instrument",
    categoryLabel: "Issuer of a Payment Instrument",
    title: "Payment Cards",
    activity: "Payment cards",
    info: "A payment card is a card that may be used to pay for goods and services or to withdraw or deposit cash.",
  },
  {
    key: "electronic_devices",
    category: "instrument",
    categoryLabel: "Issuer of a Payment Instrument",
    title: "Electronic Devices",
    activity: "Electronic devices used as payment instruments",
    info: "A payment instrument may be an electronic device through which a payment instruction is issued for making a payment or transferring money. An electronic device includes a computer, card or mobile handset.",
  },
  {
    key: "paper_instruments",
    category: "instrument",
    categoryLabel: "Issuer of a Payment Instrument",
    title: "Paper-Based Instruments",
    activity: "Paper-based payment instruments",
    info: "A payment instrument is a device or set of procedures through which a payment instruction is issued. Paper-based instruments can include cheques, bills of exchange and promissory notes.",
  },
];

type TierOption = { value: string; label: string };

// Verbatim copy of the prototype's q-funds-tier <select> options.
const FUNDS_TRANSFER_TIER_OPTIONS: TierOption[] = [
  { value: "", label: "Select a range…" },
  { value: "small", label: "Up to UGX 1 billion per month" },
  { value: "medium", label: "More than UGX 1 billion up to UGX 100 billion per month" },
  { value: "large", label: "More than UGX 100 billion per month" },
];

// Verbatim copy of the prototype's q-emi-tier <select> options.
const EMI_TIER_OPTIONS: TierOption[] = [
  { value: "", label: "Select a range…" },
  { value: "small2", label: "Up to UGX 250 million" },
  { value: "small1", label: "More than UGX 250 million up to UGX 500 million" },
  { value: "medium3", label: "More than UGX 500 million up to UGX 5 billion" },
  { value: "medium2", label: "More than UGX 5 billion up to UGX 50 billion" },
  { value: "medium1", label: "More than UGX 50 billion up to UGX 100 billion" },
  { value: "large", label: "More than UGX 100 billion" },
];

// Tier value -> Supabase class_key, confirmed against
// licence_application_wizard_classes.description for application_key =
// 'payments_nps' (each tier maps 1:1 onto a distinct class_key / fee row).
const FUNDS_TRANSFER_CLASS_KEY: Record<string, string> = {
  small: "pso_funds_transfer_small",
  medium: "pso_funds_transfer_medium",
  large: "pso_funds_transfer_large",
};
const EMI_CLASS_KEY: Record<string, string> = {
  small2: "psp_emi_small_250m",
  small1: "psp_emi_small_500m",
  medium3: "psp_emi_medium_5bn",
  medium2: "psp_emi_medium_50bn",
  medium1: "psp_emi_medium_100bn",
  large: "psp_emi_large",
};

// Verbatim copy of the prototype's classificationLabel()/classificationDetail().
const FUNDS_TRANSFER_LABEL: Record<string, string> = {
  small: "Small Funds Transfer System",
  medium: "Medium Funds Transfer System",
  large: "Large Funds Transfer System",
};
const FUNDS_TRANSFER_DETAIL: Record<string, string> = {
  small: "Monthly transaction value ≤ UGX 1bn",
  medium: "Monthly transaction value > UGX 1bn and ≤ UGX 100bn",
  large: "Monthly transaction value > UGX 100bn",
};
const EMI_LABEL: Record<string, string> = {
  small2: "Small Electronic Money Issuer",
  small1: "Small Electronic Money Issuer",
  medium3: "Medium Electronic Money Issuer",
  medium2: "Medium Electronic Money Issuer",
  medium1: "Medium Electronic Money Issuer",
  large: "Large Electronic Money Issuer",
};
const EMI_DETAIL: Record<string, string> = {
  small2: "Trust account value ≤ UGX 250m",
  small1: "Trust account value > UGX 250m and ≤ UGX 500m",
  medium3: "Trust account value > UGX 500m and ≤ UGX 5bn",
  medium2: "Trust account value > UGX 5bn and ≤ UGX 50bn",
  medium1: "Trust account value > UGX 50bn and ≤ UGX 100bn",
  large: "Trust account value > UGX 100bn",
};

function classificationLabel(key: "funds_transfer" | "emi", fundsTransferTier: string, emiTier: string): string {
  if (key === "funds_transfer") return FUNDS_TRANSFER_LABEL[fundsTransferTier] ?? "";
  if (key === "emi") return EMI_LABEL[emiTier] ?? "";
  return "";
}

function classificationDetail(key: "funds_transfer" | "emi", fundsTransferTier: string, emiTier: string): string {
  if (key === "funds_transfer") return FUNDS_TRANSFER_DETAIL[fundsTransferTier] ?? "";
  if (key === "emi") return EMI_DETAIL[emiTier] ?? "";
  return "";
}

// Fallback copy of licence_application_wizard_classes for application_key =
// 'payments_nps', confirmed byte-for-byte against Supabase (label,
// description, fee_class_label, min_capital for all 14 class_key rows). The
// live DB fetch on the server component has been observed intermittently
// returning 0 rows in production even though the table holds all 14 and
// answers correctly over a direct REST call -- when that happens, the
// min_capital figures (and a few label fallbacks) would otherwise silently
// show as UGX 0 / raw class_key strings. wizardClassesByKey below merges
// this in underneath whatever the live fetch actually returned, so the
// numbers the applicant sees are always correct regardless of that fetch's
// health. This is reference data, not applicant data -- safe to keep in
// sync by hand alongside the migration that seeds the table.
const WIZARD_CLASS_SEED: Record<string, { label: string; description: string; fee_class_label: string; min_capital: number }> = {
  pso_funds_transfer_large: { label: "PSO — Funds transfer system", description: "Large: monthly transaction value > UGX 100bn", fee_class_label: "PSO", min_capital: 1000000000 },
  pso_funds_transfer_medium: { label: "PSO — Funds transfer system", description: "Medium: > UGX 1bn and <= UGX 100bn per month", fee_class_label: "PSO", min_capital: 500000000 },
  pso_funds_transfer_small: { label: "PSO — Funds transfer system", description: "Small: <= UGX 1bn per month", fee_class_label: "PSO", min_capital: 100000000 },
  pso_clearing_switch: { label: "PSO — Clearing system or switch", description: "No transaction-value band", fee_class_label: "PSO", min_capital: 500000000 },
  pso_settlement: { label: "PSO — Settlement system", description: "No transaction-value band", fee_class_label: "PSO", min_capital: 250000000 },
  pso_third_party: { label: "PSO — Third-party system", description: "Aggregator, integrator or gateway", fee_class_label: "PSO", min_capital: 100000000 },
  psp_emi_large: { label: "PSP — Electronic-money issuer", description: "Large: total trust-account value > UGX 100bn", fee_class_label: "PSP", min_capital: 10000000000 },
  psp_emi_medium_100bn: { label: "PSP — Electronic-money issuer", description: "Medium: > UGX 50bn and <= UGX 100bn", fee_class_label: "PSP", min_capital: 5000000000 },
  psp_emi_medium_50bn: { label: "PSP — Electronic-money issuer", description: "Medium: > UGX 5bn and <= UGX 50bn", fee_class_label: "PSP", min_capital: 2000000000 },
  psp_emi_medium_5bn: { label: "PSP — Electronic-money issuer", description: "Medium: > UGX 500m and <= UGX 5bn", fee_class_label: "PSP", min_capital: 1000000000 },
  psp_emi_small_500m: { label: "PSP — Electronic-money issuer", description: "Small: > UGX 250m and <= UGX 500m", fee_class_label: "PSP", min_capital: 250000000 },
  psp_emi_small_250m: { label: "PSP — Electronic-money issuer", description: "Small: <= UGX 250m", fee_class_label: "PSP", min_capital: 100000000 },
  psp_other: { label: "PSP — Any other PSP", description: "Includes payment services that do not issue electronic money", fee_class_label: "PSP", min_capital: 100000000 },
  instrument: { label: "Payment instrument issuer — Payment cards, electronic devices or paper instruments", description: "All classes in amended schedules", fee_class_label: "Payment instrument issuer", min_capital: 0 },
};

// hasFormA()/hasInstrument() -- exact port of the prototype's own helpers
// (lines 2289-2291), rewritten against the saved `activities` list instead of
// the live wizard checkbox state.
function hasFormAActivities(activities: ActivityKey[]): boolean {
  return activities.some((a) => {
    const cat = ACTIVITY_OPTIONS.find((d) => d.key === a)?.category;
    return cat === "pso" || cat === "psp";
  });
}
function hasInstrumentActivities(activities: ActivityKey[]): boolean {
  return activities.some((a) => ACTIVITY_OPTIONS.find((d) => d.key === a)?.category === "instrument");
}

type FactQuestion = {
  key: string;
  label: string;
  show: (activities: ActivityKey[], factAnswers: Record<string, boolean | undefined>) => boolean;
};

// Verbatim port of the prototype's FACT_QUESTIONS (lines 2293-2304) -- 10
// questions, not the live app's prior flat 9-question set, with exact wording
// and conditional show() gating: the two payment-instrument-only questions
// only appear when an instrument activity was selected, and
// existing_psp_pso_licence further depends on the fi_mdi answer.
const FACT_QUESTIONS: FactQuestion[] = [
  {
    key: "fi_mdi",
    label: "Is the payment-instrument applicant a financial institution or microfinance deposit-taking institution?",
    show: (activities) => hasInstrumentActivities(activities),
  },
  {
    key: "existing_psp_pso_licence",
    label: "Does the payment-instrument applicant already hold a PSP or Payment System Operator licence?",
    show: (activities, factAnswers) => hasInstrumentActivities(activities) && factAnswers.fi_mdi === false,
  },
  {
    key: "foreign_corporate_shareholder",
    label: "Does the applicant have a foreign corporate shareholder?",
    show: (activities) => hasFormAActivities(activities),
  },
  {
    key: "foreign_resident_management",
    label: "Are any directors or senior managers foreign nationals resident and working in Uganda?",
    show: (activities) => hasFormAActivities(activities),
  },
  {
    key: "established_business",
    label: "Is the applicant an established business with at least two years of financial history?",
    show: (activities) => hasFormAActivities(activities),
  },
  {
    key: "electronic_platform",
    label: "Will the payment system or service operate on an electronic system or platform?",
    show: (activities) => hasFormAActivities(activities),
  },
  {
    key: "outsourcing",
    label: "Will any material activity be outsourced to a third party?",
    show: (activities) => hasFormAActivities(activities),
  },
  {
    key: "payment_system_participation",
    label: "Will the applicant participate in another domestic or foreign payment system?",
    show: (activities) => hasFormAActivities(activities),
  },
  {
    key: "agents",
    label: "Will the business model use agents?",
    show: (activities) => hasFormAActivities(activities) || hasInstrumentActivities(activities),
  },
  {
    key: "foreign_licences",
    label: "Does the applicant hold a similar licence in another country?",
    show: (activities) => hasFormAActivities(activities),
  },
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

function readStringFact(facts: Record<string, unknown>, key: string): string | null {
  const v = facts[key];
  return typeof v === "string" ? v : null;
}

function readBoolFact(facts: Record<string, unknown>, key: string): boolean | null {
  const v = facts[key];
  return typeof v === "boolean" ? v : null;
}

function readActivities(facts: Record<string, unknown>): ActivityKey[] {
  const raw = Array.isArray(facts.activities) ? (facts.activities as unknown[]) : [];
  const valid = new Set<string>(ACTIVITY_OPTIONS.map((a) => a.key));
  return raw.filter((a): a is ActivityKey => typeof a === "string" && valid.has(a));
}

// Verbatim port of the prototype's selectedFeeRows() activity -> class_key
// mapping (prototype lines 2166-2187), expressed against our DB's class_key
// values instead of its in-memory FEES rows.
function classKeyForActivity(key: ActivityKey, fundsTransferTier: string, emiTier: string): string | null {
  switch (key) {
    case "funds_transfer":
      return fundsTransferTier ? FUNDS_TRANSFER_CLASS_KEY[fundsTransferTier] ?? null : null;
    case "clearing":
      return "pso_clearing_switch";
    case "settlement":
      return "pso_settlement";
    case "third_party":
      return "pso_third_party";
    case "emi":
      return emiTier ? EMI_CLASS_KEY[emiTier] ?? null : null;
    case "psp_tokens":
    case "psp_other":
      return "psp_other";
    case "payment_cards":
    case "electronic_devices":
    case "paper_instruments":
      return "instrument";
    default:
      return null;
  }
}

// Dedupes on class_key exactly like the prototype's selectedFeeRows()
// pushUnique -- e.g. psp_tokens + psp_other both selected still yields a
// single "psp_other" assigned class, and any combination of the three
// instrument activities yields a single "instrument" assigned class.
function deriveAssignedClasses(facts: Record<string, unknown>): AssignedClass[] {
  const activities = readActivities(facts);
  const fundsTransferTier = readStringFact(facts, "fundsTransferTier") ?? "";
  const emiTier = readStringFact(facts, "emiTier") ?? "";
  const out: AssignedClass[] = [];
  const seen = new Set<string>();
  activities.forEach((key) => {
    const def = ACTIVITY_OPTIONS.find((a) => a.key === key);
    if (!def) return;
    const classKey = classKeyForActivity(key, fundsTransferTier, emiTier);
    if (!classKey || seen.has(classKey)) return;
    seen.add(classKey);
    out.push({ category: def.category, classKey });
  });
  return out;
}

function deriveChosenRoutes(facts: Record<string, unknown>): Set<string> {
  const activities = readActivities(facts);
  const routes = new Set<string>();
  const hasCategory = (cat: Category) => activities.some((a) => ACTIVITY_OPTIONS.find((d) => d.key === a)?.category === cat);
  if (hasCategory("pso")) routes.add("pso");
  if (hasCategory("instrument")) routes.add("instrument");
  if (activities.includes("emi")) routes.add("emi");
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
  const [creatingApplication, setCreatingApplication] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ---- workspace UI state (Application/Documents/Review tabs, phase rail,
  // search/filter, and the single slide-in workspace drawer that hosts
  // requirement editors, guidance and expert support -- mirrors the
  // prototype's one #workspace-drawer reused for all three) ----
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("checklist");
  const [phaseFilter, setPhaseFilter] = useState<Phase | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeDrawer, setActiveDrawer] = useState<DrawerState>(null);
  const [expertMessage, setExpertMessage] = useState("");
  const [expertSending, setExpertSending] = useState(false);

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
    } else {
      // Always land on the landing screen first -- matches the prototype's
      // own behaviour (screen-landing is always shown; a "Resume my
      // checklist" button appears on it only once a pathway is fully set,
      // i.e. categories chosen AND every fact answered). A partially-started
      // visitor re-enters at "Start the assessment", pre-filled from their
      // saved facts.
      setScreen("landing");
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
      setScreen("result");
      return;
    }
    await persistFacts(draftFacts, application);
    setScreen("result");
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
    setActiveTab("checklist");
    setPhaseFilter(null);
    setStatusFilter("all");
    setSearchTerm("");
    setActiveDrawer(null);
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
  const activities = useMemo(() => readActivities(facts), [facts]);
  const assignedClasses = useMemo(() => deriveAssignedClasses(facts), [facts]);
  const chosenRoutes = useMemo(() => deriveChosenRoutes(facts), [facts]);
  const factAnswers = useMemo(() => {
    const out: Record<string, boolean | undefined> = {};
    FACT_QUESTIONS.forEach((q) => {
      out[q.key] = readBoolFact(facts, q.key) ?? undefined;
    });
    return out;
  }, [facts]);
  // Only the questions whose show() currently evaluates true need an answer
  // to proceed -- mirrors the prototype's unresolvedQuestions() (lines
  // 2306-2308), which only ever checks FACT_QUESTIONS.filter(q => q.show()).
  const visibleFactQuestions = useMemo(
    () => FACT_QUESTIONS.filter((q) => q.show(activities, factAnswers)),
    [activities, factAnswers]
  );

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

  // Seeded from WIZARD_CLASS_SEED first, then overwritten by whatever the
  // live DB fetch actually returned -- so a live row always wins when
  // present, and a class_key the live fetch is missing (see that constant's
  // comment) still resolves to correct reference data instead of undefined.
  const wizardClassesByKey = useMemo(() => {
    const out: Record<string, LicenceApplicationWizardClass> = {};
    Object.entries(WIZARD_CLASS_SEED).forEach(([classKey, seed]) => {
      out[classKey] = {
        id: classKey,
        application_key: applicationKey,
        class_key: classKey,
        label: seed.label,
        description: seed.description,
        sort_order: 0,
        fee_class_label: seed.fee_class_label,
        min_capital: seed.min_capital,
        leads_to: {},
        created_at: "",
      };
    });
    wizardClasses.forEach((c) => {
      out[c.class_key] = c;
    });
    return out;
  }, [wizardClasses, applicationKey]);

  function statusFor(externalId: string): ItemStatus {
    return itemStates[externalId]?.status ?? "not_started";
  }

  const readyCount = visibleTemplates.filter((t) => statusFor(t.external_id) === "ready").length;
  const allReady = visibleTemplates.length > 0 && readyCount === visibleTemplates.length;
  const allFactsAnswered = visibleFactQuestions.every((q) => typeof factAnswers[q.key] === "boolean");

  const templatesById = useMemo(() => {
    const out: Record<string, LicenceApplicationTemplate> = {};
    visibleTemplates.forEach((t) => {
      out[t.external_id] = t;
    });
    return out;
  }, [visibleTemplates]);

  const summary = useMemo(() => {
    const total = visibleTemplates.length;
    const ready = visibleTemplates.filter((t) => statusFor(t.external_id) === "ready").length;
    const inProgress = visibleTemplates.filter((t) => statusFor(t.external_id) === "in_progress").length;
    const remaining = Math.max(0, total - ready - inProgress);
    const pct = total ? Math.round((100 * ready) / total) : 0;
    return { total, ready, inProgress, remaining, pct, complete: total > 0 && ready === total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTemplates, itemStates]);

  const nextTemplate = useMemo(() => {
    for (const p of PHASE_ORDER) {
      const t = (phaseGroups[p] ?? []).find((x) => statusFor(x.external_id) !== "ready");
      if (t) return t;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseGroups, itemStates]);

  const allFileRows = useMemo(() => {
    const rows: (MemberLicenceApplicationFile & { title: string })[] = [];
    Object.keys(files).forEach((externalId) => {
      (files[externalId] ?? []).forEach((f) => {
        rows.push({ ...f, title: templatesById[externalId]?.title ?? externalId });
      });
    });
    return rows.sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""));
  }, [files, templatesById]);

  const applicationReview = readApplicationReview(facts);

  function closeDrawer() {
    setActiveDrawer(null);
  }

  function openGuidanceDrawer(externalId: string) {
    setActiveDrawer({ kind: "guidance", externalId });
  }

  function openRequirementDrawer(externalId: string) {
    setActiveDrawer({ kind: "requirement", externalId });
  }

  // Scrolls the requirement into view in the Application tab, then opens its
  // drawer -- mirrors openRequirementFromRail's scroll + setTimeout(180).
  function openRequirementFromRail(externalId: string) {
    setPhaseFilter(null);
    setStatusFilter("all");
    setSearchTerm("");
    setActiveTab("checklist");
    setTimeout(() => {
      document.getElementById(`requirement-${externalId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveDrawer({ kind: "requirement", externalId });
    }, 180);
  }

  function openExpertMenu() {
    setActiveDrawer({ kind: "expert-menu" });
  }

  function openExpertAsk() {
    setExpertMessage("");
    setActiveDrawer({ kind: "expert-ask" });
  }

  async function sendExpertInquiry() {
    if (!expertMessage.trim()) return;
    setExpertSending(true);
    try {
      const res = await fetch("/api/expert-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceModule: "apply",
          contextKey: "payments-application",
          message: expertMessage,
        }),
      });
      if (res.ok) {
        setExpertMessage("");
        setActiveDrawer({ kind: "expert-sent" });
      } else {
        setErrorMsg("We couldn't send that question. Please try again.");
      }
    } catch (err) {
      console.error("Failed to send expert inquiry", err);
      setErrorMsg("We couldn't send that question. Please try again.");
    } finally {
      setExpertSending(false);
    }
  }

  async function requestApplicationReview() {
    await persistFacts({
      applicationReview: {
        status: "requested",
        type: summary.complete ? "final" : "interim",
        requestedAt: new Date().toISOString(),
        requestedProgress: summary.pct,
      },
    });
    setActiveDrawer(null);
    setActiveTab("review");
  }

  function cancelApplicationReview() {
    persistFacts({ applicationReview: null });
    setActiveTab("checklist");
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
    const canResume = application !== null && readActivities(facts).length > 0 && allFactsAnswered;
    return (
      <LandingScreen
        canResume={canResume}
        onStart={() => setScreen("classify")}
        onResume={() => setScreen("wizard")}
      />
    );
  }

  if (screen === "classify") {
    return (
      <ClassifyScreen
        initialFacts={facts}
        creating={creatingApplication}
        errorMsg={errorMsg}
        onContinue={handleClassifyContinue}
        onUnlisted={() => setScreen("unlisted")}
      />
    );
  }

  if (screen === "unlisted") {
    return (
      <UnlistedScreen
        onBack={() => setScreen("classify")}
        onExpert={() => setScreen("expert")}
        onSandbox={() => setScreen("sandbox")}
      />
    );
  }

  if (screen === "expert") {
    return (
      <ExpertBookingScreen
        sourceModule="apply"
        contextKey="payments-application"
        onBack={() => setScreen("unlisted")}
        onReturn={() => setScreen("classify")}
      />
    );
  }

  if (screen === "sandbox") {
    return <SandboxScreen onBack={() => setScreen("unlisted")} onExpert={() => setScreen("expert")} />;
  }

  if (screen === "result") {
    return (
      <ResultScreen
        activities={readActivities(facts)}
        fundsTransferTier={readStringFact(facts, "fundsTransferTier") ?? ""}
        emiTier={readStringFact(facts, "emiTier") ?? ""}
        wizardClassesByKey={wizardClassesByKey}
        feeTiers={feeTiers}
        onChangeSelections={() => setScreen("classify")}
        onContinue={() => setScreen(allFactsAnswered ? "wizard" : "facts")}
      />
    );
  }

  if (screen === "facts") {
    return (
      <FactsScreen
        activities={activities}
        factAnswers={factAnswers}
        allAnswered={allFactsAnswered}
        errorMsg={errorMsg}
        onToggle={(key, value) => persistFacts({ [key]: value })}
        onBack={() => setScreen("result")}
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

  // Filtered/grouped checklist for the Application tab -- mirrors
  // renderChecklist: phase filter (if any) -> status filter -> search, then
  // grouped back out by phase for the heading + progress bar per group.
  const term = searchTerm.trim().toLowerCase();
  const visiblePhaseGroups = PHASE_ORDER.map((phase) => {
    if (phaseFilter && phaseFilter !== phase) return null;
    let items = phaseGroups[phase] ?? [];
    if (statusFilter === "remaining") items = items.filter((t) => statusFor(t.external_id) !== "ready");
    else if (statusFilter === "done") items = items.filter((t) => statusFor(t.external_id) === "ready");
    if (term) {
      items = items.filter((t) => {
        const haystack = `${t.title} ${t.copy ?? ""} ${t.guide_what ?? ""} ${t.guide_evidence ?? ""}`.toLowerCase();
        return haystack.includes(term);
      });
    }
    if (!items.length) return null;
    const ready = items.filter((t) => statusFor(t.external_id) === "ready").length;
    return { phase, items, ready };
  }).filter((g): g is { phase: Phase; items: LicenceApplicationTemplate[]; ready: number } => g !== null);

  // The submit-application action stays attached to the "BoU review &
  // approval readiness" phase group (simplest option -- preserves the
  // existing submission logic exactly where it already lived) and is shown
  // whenever that phase is in view, independent of the search/status filter
  // so it's never hidden by a filter that happens to hide the review item.
  const showSubmitCard = phaseFilter === null || phaseFilter === "review";

  return (
    <div className={styles.pwRoot}>
      <header className={styles.pwSubhead}>
        <div>
          <div className={styles.pwTitle}>Payments application</div>
          <div className={styles.pwSubtitle}>
            {classLabels || "Payments"} · saved automatically in this browser · reference {application.id.slice(0, 8)}
          </div>
        </div>
        <div className={styles.pwSubheadRight}>
          <button type="button" className={styles.linkBtn} onClick={() => setScreen("classify")}>
            Change selections
          </button>
          <button type="button" className={styles.linkBtn} onClick={startOver}>
            Restart
          </button>
        </div>
      </header>

      {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}

      <div className={styles.appTabs}>
        <button
          type="button"
          className={`${styles.appTab} ${activeTab === "checklist" ? styles.active : ""}`}
          onClick={() => setActiveTab("checklist")}
        >
          Application
        </button>
        <button
          type="button"
          className={`${styles.appTab} ${activeTab === "documents" ? styles.active : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          Documents
        </button>
        {applicationReview && (
          <button
            type="button"
            className={`${styles.appTab} ${activeTab === "review" ? styles.active : ""}`}
            onClick={() => setActiveTab("review")}
          >
            Review
          </button>
        )}
      </div>

      {activeTab === "checklist" && (
        <div className={styles.tabChecklist}>
          <PhaseRail
            phaseGroups={phaseGroups}
            statusFor={statusFor}
            phaseFilter={phaseFilter}
            onSelectPhase={setPhaseFilter}
            readyCount={readyCount}
            total={visibleTemplates.length}
            assignedClasses={assignedClasses}
            wizardClassesByKey={wizardClassesByKey}
            feeTiers={feeTiers}
          />

          <main className={styles.checklistMain}>
            <div className={styles.checklistToolbar}>
              <input
                type="search"
                className={styles.searchBox}
                placeholder="Search requirements…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className={styles.filterGroup}>
                {([
                  { key: "all", label: "All" },
                  { key: "remaining", label: "Remaining" },
                  { key: "done", label: "Ready" },
                ] as { key: StatusFilter; label: string }[]).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`${styles.filterChip} ${statusFilter === f.key ? styles.active : ""}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {visiblePhaseGroups.length === 0 ? (
              <div className={styles.emptyState}>No requirements match this view.</div>
            ) : (
              visiblePhaseGroups.map(({ phase, items, ready }) => (
                <div key={phase}>
                  <div className={styles.phaseHeadingRow}>
                    <div>
                      <h3>{PHASE_LABELS[phase]}</h3>
                      <p>
                        {ready} of {items.length} ready
                      </p>
                    </div>
                  </div>
                  <div className={styles.phaseProgressBar}>
                    <div
                      className={styles.phaseProgressFill}
                      style={{ width: `${items.length ? Math.round((100 * ready) / items.length) : 0}%` }}
                    />
                  </div>
                  {items.map((t) => (
                    <WorkCard
                      key={t.external_id}
                      template={t}
                      status={statusFor(t.external_id)}
                      answers={itemStates[t.external_id]?.answers ?? {}}
                      itemFiles={files[t.external_id] ?? []}
                      onOpenGuidance={openGuidanceDrawer}
                      onOpenRequirement={openRequirementDrawer}
                    />
                  ))}
                </div>
              ))
            )}

            {showSubmitCard && (
              <div className={styles.workCard}>
                <div className={styles.workCardTop}>
                  <p className={styles.workCardTitle}>Submit application</p>
                </div>
                <p className={styles.workCardNote}>
                  {readyCount} of {visibleTemplates.length} checklist items are ready. Every applicable item must be
                  Ready before you can submit.
                </p>
                <div className={styles.workCardActions}>
                  <button
                    type="button"
                    className={`${styles.workBtn} ${styles.primary}`}
                    disabled={!allReady || submitting}
                    onClick={submitApplication}
                  >
                    {submitting ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </div>
            )}
          </main>

          <ApplicationRail
            summary={summary}
            fileCount={allFileRows.length}
            nextTemplate={nextTemplate}
            review={applicationReview}
            onOpenDocuments={() => setActiveTab("documents")}
            onOpenNext={() => nextTemplate && openRequirementFromRail(nextTemplate.external_id)}
            onOpenExpertSupport={openExpertMenu}
          />
        </div>
      )}

      {activeTab === "documents" && (
        <DocumentsTab rows={allFileRows} onOpenRequirement={openRequirementFromRail} />
      )}

      {activeTab === "review" && applicationReview && (
        <ReviewTab
          review={applicationReview}
          ready={summary.ready}
          total={summary.total}
          fileCount={allFileRows.length}
          pct={summary.pct}
          onCancel={cancelApplicationReview}
        />
      )}

      {activeDrawer && (
        <WorkspaceDrawer
          drawerState={activeDrawer}
          onClose={closeDrawer}
          templatesById={templatesById}
          itemStates={itemStates}
          files={files}
          onSaveAnswers={commitAnswers}
          onUpload={handleUpload}
          onViewFile={viewFile}
          assignedClasses={assignedClasses}
          wizardClassesByKey={wizardClassesByKey}
          feeTiers={feeTiers}
          summary={summary}
          review={applicationReview}
          onAskQuestion={openExpertAsk}
          onRequestReview={requestApplicationReview}
          onOpenReviewTab={() => {
            closeDrawer();
            setActiveTab("review");
          }}
          expertMessage={expertMessage}
          onExpertMessageChange={setExpertMessage}
          expertSending={expertSending}
          onSendExpertInquiry={sendExpertInquiry}
          onBackToExpertMenu={openExpertMenu}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assessment front door (screen-landing / screen-unlisted / screen-expert /
// screen-sandbox / screen-result in the Beacon prototype). These five
// screens sit in front of the classification + checklist workspace below --
// see the Screen type's comment for the full flow order. ExpertBookingScreen
// is written so Digital Lending and Insurance can reuse the exact same
// component (just passing their own sourceModule/contextKey); the other four
// are specific to this file but follow an identical pattern so the Digital
// Lending and Insurance wizard clients can mirror them 1:1.
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
        Bank of Uganda · Payments
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
  sandboxLabel = "None of these activities describe my product",
  sandboxCopy = "My product or service appears different from the listed licence classes.",
}: {
  onBack: () => void;
  onExpert: () => void;
  onSandbox: () => void;
  sandboxLabel?: string;
  sandboxCopy?: string;
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
            My business may fit one of the listed licence classes, but I need help identifying the right one.
          </span>
        </button>
        <button type="button" className="card p-5 text-left w-full" onClick={onSandbox}>
          <span className="block font-semibold">{sandboxLabel}</span>
          <span className="block text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            {sandboxCopy}
          </span>
        </button>
      </div>
    </div>
  );
}

// Reused as-is by Digital Lending and Insurance -- only sourceModule/
// contextKey change. Posts a real row to expert_support_requests
// (request_type: "consultation_booking") via /api/expert-support; the
// prototype's own screen-expert only ever wrote to localStorage with a
// comment saying "In the live product, the request would be sent to the
// expert team" -- this is that real send.
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
        If you&apos;re unsure which licence class applies to your business, request a short session to review your
        product and regulatory pathway.
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

function SandboxScreen({ onBack, onExpert }: { onBack: () => void; onExpert: () => void }) {
  const [showNote, setShowNote] = useState(false);
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        ← Back
      </button>
      <h1 className="text-3xl font-semibold mt-4" style={{ fontFamily: "var(--font-serif)" }}>
        Explore the Regulatory Sandbox
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        If your product does not fit the listed licence classes, the Bank of Uganda&apos;s NPS Regulatory Sandbox may
        be a pathway to explore. It provides a controlled environment for eligible innovative payment products,
        services, business models or delivery mechanisms to be tested under regulatory oversight.
      </p>
      <div className="mt-8 flex items-center gap-3 flex-wrap">
        <button className="btn btn-primary" type="button" onClick={() => setShowNote(true)}>
          Build my sandbox checklist →
        </button>
        <button className="btn btn-ghost" type="button" onClick={onExpert}>
          Speak to an expert
        </button>
      </div>
      {showNote && (
        <p className="text-xs mt-4" style={{ color: "var(--color-text-muted)" }}>
          The sandbox checklist is the next module to be built.
        </p>
      )}
    </div>
  );
}

// Per-class_key display label for the itemized fee breakdown table -- exact
// port of the prototype's resultFeeClassLabel() (lines 2233-2259), rewritten
// against class_key instead of the in-memory FEES row's category/class text.
function resultFeeClassLabel(
  classKey: string,
  activities: ActivityKey[],
  fundsTransferTier: string,
  emiTier: string,
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>
): string {
  if (classKey === "pso_clearing_switch") return "Clearing System / Switch";
  if (classKey === "pso_settlement") return "Settlement System";
  if (classKey === "pso_third_party") return "Third-Party System";
  if (classKey.startsWith("pso_funds_transfer_")) {
    return classificationLabel("funds_transfer", fundsTransferTier, emiTier) || "Funds Transfer System";
  }
  if (classKey.startsWith("psp_emi_")) {
    const name = classificationLabel("emi", fundsTransferTier, emiTier) || "Electronic Money Issuer";
    const band = (wizardClassesByKey[classKey]?.description ?? "").replace(/^(Large|Medium|Small):\s*/, "");
    return band ? `${name} · ${band}` : name;
  }
  if (classKey === "psp_other") {
    const psp: string[] = [];
    if (activities.includes("psp_tokens")) psp.push("Payment Services including Tokens");
    if (activities.includes("psp_other")) psp.push("Any other Payment Service Provider");
    return psp.length ? psp.join(" · ") : "Payment Service Provider";
  }
  if (classKey === "instrument") {
    const instruments: string[] = [];
    if (activities.includes("payment_cards")) instruments.push("Payment Cards");
    if (activities.includes("electronic_devices")) instruments.push("Electronic Devices");
    if (activities.includes("paper_instruments")) instruments.push("Paper-Based Instruments");
    return instruments.length ? instruments.join(" · ") : "Issuer of a Payment Instrument";
  }
  return wizardClassesByKey[classKey]?.label ?? classKey;
}

const RESULT_GROUPS: { key: Category; title: string }[] = [
  { key: "pso", title: "Payment System Operator" },
  { key: "psp", title: "Payment Service Provider" },
  { key: "instrument", title: "Issuer of a Payment Instrument" },
];

// Exact port of the prototype's renderLicenceResult() + renderResultCosts()
// (lines 2200-2286): groups selected activities by category in pso -> psp ->
// instrument order, shows "Licence N" headers only when more than one
// category is active, "Class:"/"Classes:" singular/plural per group, then a
// 4-stat fee summary (application/licensing/annual summed, minimum capital is
// the MAX across selected classes -- never summed) with an itemized
// per-class breakdown table shown only when more than one class is selected.
function ResultScreen({
  activities,
  fundsTransferTier,
  emiTier,
  wizardClassesByKey,
  feeTiers,
  onChangeSelections,
  onContinue,
}: {
  activities: ActivityKey[];
  fundsTransferTier: string;
  emiTier: string;
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>;
  feeTiers: LicenceApplicationFeeTier[];
  onChangeSelections: () => void;
  onContinue: () => void;
}) {
  const selectedDefs = ACTIVITY_OPTIONS.filter((def) => activities.includes(def.key));

  const assignedClasses: AssignedClass[] = [];
  const seen = new Set<string>();
  activities.forEach((key) => {
    const def = ACTIVITY_OPTIONS.find((d) => d.key === key);
    if (!def) return;
    const classKey = classKeyForActivity(key, fundsTransferTier, emiTier);
    if (!classKey || seen.has(classKey)) return;
    seen.add(classKey);
    assignedClasses.push({ category: def.category, classKey });
  });

  function feeAmount(classKey: string, feeType: "application" | "licensing" | "annual"): number {
    return Number(feeTiers.find((f) => f.class_key === classKey && f.fee_type === feeType)?.amount ?? 0);
  }

  const applicationFee = assignedClasses.reduce((sum, ac) => sum + feeAmount(ac.classKey, "application"), 0);
  const licensingFee = assignedClasses.reduce((sum, ac) => sum + feeAmount(ac.classKey, "licensing"), 0);
  const annualFee = assignedClasses.reduce((sum, ac) => sum + feeAmount(ac.classKey, "annual"), 0);
  const minCapital = assignedClasses.length
    ? Math.max(...assignedClasses.map((ac) => Number(wizardClassesByKey[ac.classKey]?.min_capital ?? 0)))
    : 0;
  const showBreakdown = assignedClasses.length > 1;

  const activeGroups = RESULT_GROUPS.filter((group) => selectedDefs.some((d) => d.category === group.key));
  const showLicenceNumbers = activeGroups.length > 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onChangeSelections}>
        ← Change selections
      </button>
      <div className="text-xs font-semibold uppercase tracking-wide mt-4" style={{ color: "var(--color-text-muted)" }}>
        Based on your selections
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        Your licence application
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
        These are the licence categories and classes that apply to the activities you selected.
      </p>

      <div className="space-y-6 mt-6">
        {activeGroups.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No licence class selected yet.
          </p>
        )}
        {activeGroups.map((group, index) => {
          const defs = selectedDefs.filter((d) => d.category === group.key);
          const classLabel = defs.length > 1 ? "Classes:" : "Class:";
          return (
            <div key={group.key} className="card p-5">
              {showLicenceNumbers && (
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
                  Licence {index + 1}
                </div>
              )}
              <div className="font-semibold mt-1" style={{ fontFamily: "var(--font-serif)" }}>
                {group.title}
              </div>
              <div className="mt-3 text-sm flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold" style={{ color: "var(--color-text-muted)" }}>
                  {classLabel}
                </span>
                {defs.map((def, i) => {
                  const label = classificationLabel(def.key as "funds_transfer" | "emi", fundsTransferTier, emiTier) || def.title;
                  const detail =
                    def.key === "funds_transfer" || def.key === "emi"
                      ? classificationDetail(def.key, fundsTransferTier, emiTier)
                      : "";
                  return (
                    <span key={def.key}>
                      {i > 0 && <span style={{ color: "var(--color-border)" }}>·</span>}{" "}
                      <span>{label}</span>
                      {detail && (
                        <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>
                          ({detail})
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {assignedClasses.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
            Fees and minimum capital
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Based on the licence classes and applicable classifications or value bands you selected.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {(
              [
                { label: "Application fee", value: applicationFee, note: "Non-refundable" },
                { label: "Licence fee", value: licensingFee, note: "Payable if licence is granted" },
                { label: "Annual fee", value: annualFee, note: "Recurring licence cost" },
                { label: "Minimum capital", value: minCapital, note: "Highest applicable threshold" },
              ] as { label: string; value: number; note: string }[]
            ).map((stat) => (
              <div key={stat.label} className="card p-3">
                <div className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
                  {stat.label}
                </div>
                <div className="text-base font-semibold mt-1">{formatUGX(stat.value)}</div>
                <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                  {stat.note}
                </div>
              </div>
            ))}
          </div>

          {showBreakdown && (
            <div className="mt-4" style={{ overflowX: "auto" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Application</th>
                    <th>Licence</th>
                    <th>Annual</th>
                    <th>Minimum capital</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedClasses.map((ac) => (
                    <tr key={ac.classKey}>
                      <td>
                        <strong>{resultFeeClassLabel(ac.classKey, activities, fundsTransferTier, emiTier, wizardClassesByKey)}</strong>
                      </td>
                      <td>{formatUGX(feeAmount(ac.classKey, "application"))}</td>
                      <td>{formatUGX(feeAmount(ac.classKey, "licensing"))}</td>
                      <td>{formatUGX(feeAmount(ac.classKey, "annual"))}</td>
                      <td>{formatUGX(Number(wizardClassesByKey[ac.classKey]?.min_capital ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center gap-3">
        <button className="btn btn-primary" type="button" onClick={onContinue}>
          Build my checklist →
        </button>
        <button className="btn btn-ghost" type="button" onClick={onChangeSelections}>
          Change selections
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classify screen -- exact port of the prototype's screen-wizard (lines
// 1129-1169 for markup, 2065-2150 for behaviour): a flat, fully multi-select
// grid of 10 business activities (CLASS_OPTIONS/ACTIVITY_OPTIONS), each with
// a click-to-toggle info popover, with two activities (Funds Transfer System,
// Electronic Money Issuer) triggering an inline follow-up value-band question
// rendered between the "activity isn't listed" card and the continue button
// -- same order as the prototype's #sub-questions placement. "See my licence"
// stays disabled until every triggered sub-question is answered, matching
// validateWizard().
// ---------------------------------------------------------------------------

function ClassifyScreen({
  initialFacts,
  creating,
  errorMsg,
  onContinue,
  onUnlisted,
}: {
  initialFacts: Record<string, unknown>;
  creating: boolean;
  errorMsg: string | null;
  onContinue: (facts: Record<string, unknown>) => void;
  onUnlisted: () => void;
}) {
  const [activities, setActivities] = useState<Set<ActivityKey>>(() => new Set(readActivities(initialFacts)));
  const [fundsTransferTier, setFundsTransferTier] = useState<string>(readStringFact(initialFacts, "fundsTransferTier") ?? "");
  const [emiTier, setEmiTier] = useState<string>(readStringFact(initialFacts, "emiTier") ?? "");
  const [openInfoKey, setOpenInfoKey] = useState<ActivityKey | null>(null);

  function toggleActivity(key: ActivityKey) {
    setActivities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (key === "funds_transfer") setFundsTransferTier("");
        if (key === "emi") setEmiTier("");
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const canContinue =
    activities.size > 0 &&
    (!activities.has("funds_transfer") || !!fundsTransferTier) &&
    (!activities.has("emi") || !!emiTier);

  function handleContinue() {
    if (!canContinue) return;
    onContinue({
      activities: Array.from(activities),
      fundsTransferTier: activities.has("funds_transfer") ? fundsTransferTier : null,
      emiTier: activities.has("emi") ? emiTier : null,
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        Bank of Uganda · Payments
      </div>
      <h1 className="text-3xl font-semibold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
        What does your business do?
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Select all that apply.
      </p>

      {errorMsg && (
        <div className="badge badge-red mt-4" style={{ display: "block", padding: "0.5rem 0.75rem", borderRadius: "0.5rem" }}>
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {ACTIVITY_OPTIONS.map((def) => {
          const checked = activities.has(def.key);
          return (
            <div
              key={def.key}
              className="card p-4 relative cursor-pointer"
              style={checked ? { borderColor: "var(--color-primary)", background: "#f4f8f5" } : undefined}
              onClick={() => toggleActivity(def.key)}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  aria-label={def.title}
                  onChange={() => toggleActivity(def.key)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1">
                  <div className="font-semibold text-sm">{def.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {def.activity}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 20,
                    height: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-muted)",
                  }}
                  aria-label={`About ${def.title}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenInfoKey((k) => (k === def.key ? null : def.key));
                  }}
                >
                  i
                </button>
              </div>
              {openInfoKey === def.key && (
                <div
                  className="mt-3 text-xs rounded-lg p-3"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <strong className="block mb-1" style={{ color: "var(--color-text)" }}>
                    {def.title}
                  </strong>
                  {def.info}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 card p-4">
        <p className="text-sm font-medium">My activity isn&apos;t listed / I&apos;m not sure</p>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Get help identifying the right pathway.
        </p>
        <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={onUnlisted}>
          Get help →
        </button>
      </div>

      {(activities.has("funds_transfer") || activities.has("emi")) && (
        <div className="space-y-4 mt-6">
          {activities.has("funds_transfer") && (
            <div className="card p-4">
              <h5 className="text-sm font-semibold">
                What monthly transaction value do you expect for your Funds Transfer System?
              </h5>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                We&apos;ll use this to determine the applicable Funds Transfer System classification.
              </p>
              <select
                className="input mt-3"
                value={fundsTransferTier}
                onChange={(e) => setFundsTransferTier(e.target.value)}
              >
                {FUNDS_TRANSFER_TIER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {activities.has("emi") && (
            <div className="card p-4">
              <h5 className="text-sm font-semibold">What total value do you expect to hold in your trust account?</h5>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                We&apos;ll use this to determine the applicable Electronic Money Issuer classification and value band.
              </p>
              <select className="input mt-3" value={emiTier} onChange={(e) => setEmiTier(e.target.value)}>
                {EMI_TIER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <button className="btn btn-primary mt-6" type="button" disabled={!canContinue || creating} onClick={handleContinue}>
        {creating ? "Starting…" : "See my licence →"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facts screen (step 3: ~9 yes/no gating questions)
// ---------------------------------------------------------------------------

function FactsScreen({
  activities,
  factAnswers,
  allAnswered,
  errorMsg,
  onToggle,
  onBack,
  onContinue,
}: {
  activities: ActivityKey[];
  factAnswers: Record<string, boolean | undefined>;
  allAnswered: boolean;
  errorMsg: string | null;
  onToggle: (key: string, value: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  // Re-evaluated on every render against the live activities/answers, so
  // existing_psp_pso_licence appears or disappears the moment fi_mdi is
  // answered -- same conditional behaviour as the prototype's show() checks.
  const visibleQuestions = FACT_QUESTIONS.filter((q) => q.show(activities, factAnswers));

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
        {visibleQuestions.map((q) => (
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
// Phase rail (left): "All requirements X/Y" + one row per phase, with the
// existing per-category fee summary folded in underneath -- the prototype's
// rail has no fee content (fees live on the old Fees tab it doesn't need
// here), so this is the one place in the workspace that isn't a straight
// port; keeping it in the left rail (rather than the right application rail,
// which is reserved for progress/files/next/expert-support exactly as
// specced) keeps it next to "what applies to you" rather than "how you're
// progressing".
// ---------------------------------------------------------------------------

function PhaseRail({
  phaseGroups,
  statusFor,
  phaseFilter,
  onSelectPhase,
  readyCount,
  total,
  assignedClasses,
  wizardClassesByKey,
  feeTiers,
}: {
  phaseGroups: Record<Phase, LicenceApplicationTemplate[]>;
  statusFor: (externalId: string) => ItemStatus;
  phaseFilter: Phase | null;
  onSelectPhase: (p: Phase | null) => void;
  readyCount: number;
  total: number;
  assignedClasses: AssignedClass[];
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>;
  feeTiers: LicenceApplicationFeeTier[];
}) {
  return (
    <nav className={styles.phaseRail} aria-label="Application phases">
      <button
        type="button"
        className={`${styles.phaseLink} ${phaseFilter === null ? styles.active : ""}`}
        onClick={() => onSelectPhase(null)}
      >
        All requirements
        <span className={styles.plCount}>
          {readyCount}/{total}
        </span>
      </button>
      {PHASE_ORDER.map((p) => {
        const items = phaseGroups[p] ?? [];
        if (!items.length) return null;
        const ready = items.filter((t) => statusFor(t.external_id) === "ready").length;
        return (
          <button
            key={p}
            type="button"
            className={`${styles.phaseLink} ${phaseFilter === p ? styles.active : ""}`}
            onClick={() => onSelectPhase(p)}
          >
            {PHASE_LABELS[p]}
            <span className={styles.plCount}>
              {ready}/{items.length}
            </span>
          </button>
        );
      })}
      <FeeSummaryPanel assignedClasses={assignedClasses} wizardClassesByKey={wizardClassesByKey} feeTiers={feeTiers} />
    </nav>
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
    <div className={styles.railFees}>
      <div className={styles.railFeesLabel}>Fees</div>
      {assignedClasses.map((ac) => {
        const cls = wizardClassesByKey[ac.classKey];
        const rows = feeTiers.filter((f) => f.class_key === ac.classKey);
        return (
          <div key={`${ac.category}-${ac.classKey}`} style={{ padding: "0 10px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{cls?.label ?? ac.classKey}</div>
            <div style={{ marginTop: 4 }}>
              {rows.length === 0 && (
                <div style={{ fontSize: 11.5, color: "var(--pw-slate-light, #767676)" }}>No fee schedule on file.</div>
              )}
              {rows.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 2 }}>
                  <span>{FEE_TYPE_LABELS[r.fee_type] ?? r.fee_type}</span>
                  <span style={{ fontWeight: 600 }}>{formatUGX(Number(r.amount))}</span>
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
// Work card (center list) -- title, info button, status pill, note,
// action button, ready-state summary. Mirrors renderReqCard/cardSummary.
// ---------------------------------------------------------------------------

function statusLabel(status: ItemStatus): string {
  return status === "ready" ? "Ready" : status === "in_progress" ? "In progress" : "Not started";
}

// Adapted from the prototype's cfg.type-keyed cardSummary(): our app doesn't
// carry that generic per-item-type config, so this keys off drawer_type
// (people gets a person count, single/multi-file items get a filename or a
// document count) with a "Complete" fallback for every other drawer type.
function cardSummaryFor(
  template: LicenceApplicationTemplate,
  status: ItemStatus,
  answers: Record<string, unknown>,
  itemFiles: MemberLicenceApplicationFile[]
): string {
  if (status === "in_progress") return "Work saved";
  if (status !== "ready") return "";
  if (template.drawer_type === "people") {
    const people = Array.isArray(answers.people) ? answers.people : [];
    return `${people.length} ${people.length === 1 ? "person" : "people"} complete`;
  }
  if (itemFiles.length === 1) return `${itemFiles[0].file_name} · v${itemFiles[0].version}`;
  if (itemFiles.length > 1) return `${itemFiles.length} documents added`;
  return "Complete";
}

function WorkCard({
  template,
  status,
  answers,
  itemFiles,
  onOpenGuidance,
  onOpenRequirement,
}: {
  template: LicenceApplicationTemplate;
  status: ItemStatus;
  answers: Record<string, unknown>;
  itemFiles: MemberLicenceApplicationFile[];
  onOpenGuidance: (externalId: string) => void;
  onOpenRequirement: (externalId: string) => void;
}) {
  const statusStateClass = status === "ready" ? styles.isReady : status === "in_progress" ? styles.isProgress : "";
  const pillClass = status === "ready" ? styles.ready : status === "in_progress" ? styles.progress : styles.notStarted;
  const note = template.copy || template.guide_evidence || "Complete this requirement.";
  const summary = cardSummaryFor(template, status, answers, itemFiles);
  return (
    <div id={`requirement-${template.external_id}`} className={`${styles.workCard} ${statusStateClass}`}>
      <div className={styles.workCardTop}>
        <div className={styles.workCardHeading}>
          <p className={styles.workCardTitle}>{template.title}</p>
          <button
            type="button"
            className={styles.workInfoBtn}
            aria-label={`Guidance for ${template.title}`}
            onClick={() => onOpenGuidance(template.external_id)}
          >
            i
          </button>
        </div>
        <span className={`${styles.workStatus} ${pillClass}`}>{statusLabel(status)}</span>
      </div>
      <p className={styles.workCardNote}>{note}</p>
      <div className={styles.workCardActions}>
        <button
          type="button"
          className={`${styles.workBtn} ${status === "ready" ? styles.subtle : styles.primary}`}
          onClick={() => onOpenRequirement(template.external_id)}
        >
          {template.cta_label || "Open"}
        </button>
        {summary && <span className={styles.workSummary}>{summary}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Application rail (right): Progress / Files / Next / Expert support.
// This is the panel the prototype screenshots showed on the extreme right
// that the previous build was missing entirely. Mirrors renderApplicationRail.
// ---------------------------------------------------------------------------

function ApplicationRail({
  summary,
  fileCount,
  nextTemplate,
  review,
  onOpenDocuments,
  onOpenNext,
  onOpenExpertSupport,
}: {
  summary: { total: number; ready: number; inProgress: number; remaining: number; pct: number; complete: boolean };
  fileCount: number;
  nextTemplate: LicenceApplicationTemplate | null;
  review: ApplicationReview | null;
  onOpenDocuments: () => void;
  onOpenNext: () => void;
  onOpenExpertSupport: () => void;
}) {
  return (
    <aside className={styles.applicationRail} aria-label="Application progress">
      <section className={styles.railCard}>
        <div className={styles.railLabel}>Progress</div>
        <div className={styles.railNumber}>{summary.pct}%</div>
        <div className={styles.railProgress}>
          <span style={{ width: `${summary.pct}%` }} />
        </div>
        <div className={styles.railStat}>
          <span>Ready</span>
          <strong>{summary.ready}</strong>
        </div>
        <div className={styles.railStat}>
          <span>In progress</span>
          <strong>{summary.inProgress}</strong>
        </div>
        <div className={styles.railStat}>
          <span>Remaining</span>
          <strong>{summary.remaining}</strong>
        </div>
      </section>

      <section className={styles.railCard}>
        <div className={styles.railLabel}>Files</div>
        <div className={styles.railFileCount}>{fileCount}</div>
        <button type="button" className={styles.railBtn} onClick={onOpenDocuments}>
          Open documents
        </button>
      </section>

      <section className={styles.railCard}>
        <div className={styles.railLabel}>Next</div>
        {summary.complete ? (
          <>
            <p className={styles.railNextTitle}>Your application requirements are complete.</p>
            <button type="button" className={styles.railBtn} onClick={onOpenDocuments}>
              Review application pack
            </button>
          </>
        ) : nextTemplate ? (
          <>
            <p className={styles.railNextTitle}>Continue with {nextTemplate.title}.</p>
            <button type="button" className={styles.railBtn} onClick={onOpenNext}>
              Open requirement
            </button>
          </>
        ) : (
          <p className={styles.railNextTitle}>Continue preparing your application.</p>
        )}
      </section>

      <section className={styles.railCard}>
        <div className={styles.railLabel}>Expert support</div>
        {review ? (
          <>
            <div className={styles.railReviewState}>Review requested</div>
            <p className={styles.railCopy}>Ask a question or return to your review.</p>
          </>
        ) : (
          <p className={styles.railCopy}>Ask a question or request an application review at any stage.</p>
        )}
        <button
          type="button"
          className={`${styles.railBtn} ${summary.complete && !review ? styles.primary : ""}`}
          onClick={onOpenExpertSupport}
        >
          Get expert help
        </button>
      </section>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Guidance content (the info-button popover, rendered inside the workspace
// drawer). Mirrors openGuidance: source line, guidance paragraph, "what you
// need to provide" deliverable.
// ---------------------------------------------------------------------------

function GuidanceContent({ template }: { template: LicenceApplicationTemplate }) {
  const deliverable = template.guide_evidence || template.guide_do;
  const hasAnyGuidance = template.guide_what || deliverable || template.source_url;
  return (
    <div>
      {template.source_label && (
        <p className={styles.sourceLine}>
          {template.source_url ? (
            <a href={template.source_url} target="_blank" rel="noopener noreferrer">
              {template.source_label} ↗
            </a>
          ) : (
            template.source_label
          )}
        </p>
      )}
      {template.guide_what && <p className={styles.guidanceCopy}>{template.guide_what}</p>}
      {deliverable && (
        <div className={styles.guidanceDeliverable}>
          <strong>What you need to provide</strong>
          <p>{deliverable}</p>
        </div>
      )}
      {!hasAnyGuidance && <p className={styles.guidanceCopy}>No additional guidance is available for this requirement yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expert support -- the two-option menu (ask a question / request review)
// and the question sub-panel. Mirrors openExpertSupport / openExpertInquiry.
// ---------------------------------------------------------------------------

function ExpertMenu({
  complete,
  review,
  onAskQuestion,
  onRequestReview,
  onOpenReviewTab,
}: {
  complete: boolean;
  review: ApplicationReview | null;
  onAskQuestion: () => void;
  onRequestReview: () => void;
  onOpenReviewTab: () => void;
}) {
  const reviewTitle = complete ? "Request final application review" : "Request application review";
  const reviewCopy = complete
    ? "Your required application items are complete. An expert can review the full application before submission."
    : "An expert can review the application as it currently stands and flag issues in the information and documents already prepared.";
  return (
    <div className={styles.supportOptions}>
      <div className={styles.supportOption}>
        <h3>Ask a question</h3>
        <p>Get help with a requirement, document or application issue.</p>
        <button type="button" className={`${styles.workBtn} ${styles.subtle}`} onClick={onAskQuestion}>
          Ask a question
        </button>
      </div>
      <div className={styles.supportOption}>
        {review ? (
          <>
            <h3>{review.type === "final" ? "Final application review" : "Application review"}</h3>
            <p>Your review request has already been submitted.</p>
            <button type="button" className={`${styles.workBtn} ${styles.subtle}`} onClick={onOpenReviewTab}>
              Open review
            </button>
          </>
        ) : (
          <>
            <h3>{reviewTitle}</h3>
            <p>{reviewCopy}</p>
            <button type="button" className={`${styles.workBtn} ${styles.primary}`} onClick={onRequestReview}>
              {complete ? "Request final review" : "Request review"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ExpertAsk({
  value,
  onChange,
  onSend,
  onBack,
  sending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onBack: () => void;
  sending: boolean;
}) {
  return (
    <div>
      <label className={styles.supportFieldLabel} htmlFor="expert-inquiry-text">
        What do you need help with?
      </label>
      <textarea
        id="expert-inquiry-text"
        className={styles.supportTextarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ask about a requirement, document, regulatory issue or part of your application."
      />
      <div className={styles.workCardActions} style={{ marginTop: 14 }}>
        <button type="button" className={`${styles.workBtn} ${styles.primary}`} disabled={sending || !value.trim()} onClick={onSend}>
          {sending ? "Sending…" : "Send inquiry"}
        </button>
        <button type="button" className={`${styles.workBtn} ${styles.subtle}`} onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace drawer -- the single slide-in overlay panel that hosts the
// requirement editor, guidance, and expert support, exactly like the
// prototype's one #workspace-drawer reused across openWorkDrawer /
// openGuidance / openExpertSupport / openExpertInquiry.
// ---------------------------------------------------------------------------

function WorkspaceDrawer({
  drawerState,
  onClose,
  templatesById,
  itemStates,
  files,
  onSaveAnswers,
  onUpload,
  onViewFile,
  assignedClasses,
  wizardClassesByKey,
  feeTiers,
  summary,
  review,
  onAskQuestion,
  onRequestReview,
  onOpenReviewTab,
  expertMessage,
  onExpertMessageChange,
  expertSending,
  onSendExpertInquiry,
  onBackToExpertMenu,
}: {
  drawerState: Exclude<DrawerState, null>;
  onClose: () => void;
  templatesById: Record<string, LicenceApplicationTemplate>;
  itemStates: Record<string, MemberLicenceApplicationItemState>;
  files: Record<string, MemberLicenceApplicationFile[]>;
  onSaveAnswers: (template: LicenceApplicationTemplate, answers: Record<string, unknown>) => void;
  onUpload: (template: LicenceApplicationTemplate, slot: string, file: File) => Promise<boolean>;
  onViewFile: (f: MemberLicenceApplicationFile) => void;
  assignedClasses: AssignedClass[];
  wizardClassesByKey: Record<string, LicenceApplicationWizardClass>;
  feeTiers: LicenceApplicationFeeTier[];
  summary: { complete: boolean };
  review: ApplicationReview | null;
  onAskQuestion: () => void;
  onRequestReview: () => void;
  onOpenReviewTab: () => void;
  expertMessage: string;
  onExpertMessageChange: (v: string) => void;
  expertSending: boolean;
  onSendExpertInquiry: () => void;
  onBackToExpertMenu: () => void;
}) {
  let eyebrow = "";
  let title = "";
  let body: ReactNode = null;

  if (drawerState.kind === "requirement" || drawerState.kind === "guidance") {
    const template = templatesById[drawerState.externalId];
    if (!template) {
      body = <div className={styles.drawerEmpty}>This requirement is no longer part of your application.</div>;
    } else if (drawerState.kind === "guidance") {
      eyebrow = "Guidance";
      title = template.title;
      body = <GuidanceContent template={template} />;
    } else {
      eyebrow = "Requirement";
      title = template.title;
      body = (
        <DrawerInput
          template={template}
          answers={itemStates[template.external_id]?.answers ?? {}}
          itemFiles={files[template.external_id] ?? []}
          onSaveAnswers={(a) => onSaveAnswers(template, a)}
          onUpload={(slot, f) => onUpload(template, slot, f)}
          onViewFile={onViewFile}
          assignedClasses={assignedClasses}
          wizardClassesByKey={wizardClassesByKey}
          feeTiers={feeTiers}
        />
      );
    }
  } else if (drawerState.kind === "expert-menu") {
    eyebrow = "Help & review";
    title = "Expert support";
    body = (
      <ExpertMenu
        complete={summary.complete}
        review={review}
        onAskQuestion={onAskQuestion}
        onRequestReview={onRequestReview}
        onOpenReviewTab={onOpenReviewTab}
      />
    );
  } else if (drawerState.kind === "expert-ask") {
    eyebrow = "Expert support";
    title = "Ask an expert";
    body = (
      <ExpertAsk
        value={expertMessage}
        onChange={onExpertMessageChange}
        onSend={onSendExpertInquiry}
        onBack={onBackToExpertMenu}
        sending={expertSending}
      />
    );
  } else if (drawerState.kind === "expert-sent") {
    eyebrow = "Expert support";
    title = "Inquiry sent";
    body = (
      <div className={styles.supportConfirmation}>
        <strong>Your inquiry has been captured.</strong>
        An expert can respond using the application context available at this stage.
      </div>
    );
  }

  return (
    <>
      <div className={styles.workspaceOverlay} onClick={onClose} />
      <aside className={styles.workspaceDrawer} aria-label="Requirement details">
        <div className={styles.drawerHead}>
          <div>
            <div className={styles.drawerEyebrow}>{eyebrow}</div>
            <h2>{title}</h2>
          </div>
          <button type="button" className={styles.drawerClose} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.drawerBody}>{body}</div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Documents tab -- every uploaded file across every item, derived from the
// existing `files` state. Mirrors allFileRows/renderDocuments (minus the
// "final application pack" builder, which has no backend equivalent here).
// ---------------------------------------------------------------------------

function DocumentsTab({
  rows,
  onOpenRequirement,
}: {
  rows: (MemberLicenceApplicationFile & { title: string })[];
  onOpenRequirement: (externalId: string) => void;
}) {
  return (
    <div className={styles.workspaceWide}>
      <h2>Documents</h2>
      <p className={styles.workspaceIntro}>
        Your uploaded application documents appear here automatically. Replacing a file creates a new version.
      </p>
      {rows.length === 0 ? (
        <div className={styles.emptyState}>No documents uploaded yet.</div>
      ) : (
        <table className={styles.docsTable}>
          <thead>
            <tr>
              <th>Document</th>
              <th>Requirement</th>
              <th>Version</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className={styles.docName}>{r.file_name}</div>
                  <div className={styles.docSub}>{r.slot}</div>
                </td>
                <td>
                  <button type="button" className={styles.railLink} onClick={() => onOpenRequirement(r.external_id)}>
                    {r.title}
                  </button>
                </td>
                <td>v{r.version}</td>
                <td>{(r.uploaded_at ?? "").slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review tab -- reachable only once an application review has been
// requested (tab is hidden until then). Mirrors renderReview's summary.
// ---------------------------------------------------------------------------

function ReviewTab({
  review,
  ready,
  total,
  fileCount,
  pct,
  onCancel,
}: {
  review: ApplicationReview;
  ready: number;
  total: number;
  fileCount: number;
  pct: number;
  onCancel: () => void;
}) {
  return (
    <div className={styles.workspaceWide}>
      <h2>Review</h2>
      <p className={styles.workspaceIntro}>
        Your review request has been captured. An expert can review the application as prepared at request time and
        as it stands now.
      </p>
      <div className={styles.reviewOverview}>
        <div className={styles.reviewOverviewTop}>
          <div>
            <h3>{review.type === "final" ? "Final application review" : "Application review"}</h3>
            <p className={styles.reviewNoteBlock} style={{ margin: 0 }}>
              Requested {new Date(review.requestedAt).toLocaleString()}
            </p>
          </div>
          <span className={`${styles.reviewState} ${styles.requested}`}>Requested</span>
        </div>
        <div className={styles.reviewSummaryGrid}>
          <div className={styles.reviewSummaryBox}>
            <strong>{pct}%</strong>
            <span>Complete now</span>
          </div>
          <div className={styles.reviewSummaryBox}>
            <strong>
              {ready}/{total}
            </strong>
            <span>Requirements ready</span>
          </div>
          <div className={styles.reviewSummaryBox}>
            <strong>{fileCount}</strong>
            <span>Files uploaded</span>
          </div>
        </div>
      </div>
      <button type="button" className={`${styles.workBtn} ${styles.subtle}`} onClick={onCancel}>
        Cancel review request
      </button>
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
