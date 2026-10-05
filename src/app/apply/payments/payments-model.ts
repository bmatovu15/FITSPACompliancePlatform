// Pure (React-free) model for the Payments application: classification,
// fees, item applicability and readiness rules. This is a port of the Beacon
// design prototype's own logic (beacon.html: CLASS_OPTIONS, selectedFeeRows,
// pricingAssessment, FACT_QUESTIONS, routeBaseApplies / factApplies,
// visualItems, statusFor, getPeople ...). The editors in payments-drawers.tsx
// and the screens in payments-screens.tsx / payments-workspace.tsx only call
// into this module so the rules live in exactly one place.
//
// What differs from the prototype is only where data comes from: the
// requirement catalogue (titles, notes, CTAs, guidance, applicability,
// editor type) is read from licence_application_templates (see
// db/migrations/0201-0204) instead of an embedded JSON blob, and answers /
// files are persisted to Supabase instead of localStorage.

import type {
  LicenceApplicationFeeTier,
  LicenceApplicationTemplate,
  LicenceApplicationWizardClass,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Classification (design CLASS_OPTIONS)
// ---------------------------------------------------------------------------

export type Category = "pso" | "psp" | "instrument";

export type ActivityKey =
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

export type ActivityDef = {
  key: ActivityKey;
  category: Category;
  categoryLabel: string;
  title: string;
  activity: string;
  info: string;
};

export const ACTIVITY_OPTIONS: ActivityDef[] = [
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

export const LICENCE_GROUPS: { key: Category; title: string }[] = [
  { key: "pso", title: "Payment System Operator" },
  { key: "psp", title: "Payment Service Provider" },
  { key: "instrument", title: "Issuer of a Payment Instrument" },
];

export type TierOption = { value: string; label: string };

export const FUNDS_TRANSFER_TIER_OPTIONS: TierOption[] = [
  { value: "", label: "Select a range…" },
  { value: "small", label: "Up to UGX 1 billion per month" },
  { value: "medium", label: "More than UGX 1 billion up to UGX 100 billion per month" },
  { value: "large", label: "More than UGX 100 billion per month" },
];

export const EMI_TIER_OPTIONS: TierOption[] = [
  { value: "", label: "Select a range…" },
  { value: "small2", label: "Up to UGX 250 million" },
  { value: "small1", label: "More than UGX 250 million up to UGX 500 million" },
  { value: "medium3", label: "More than UGX 500 million up to UGX 5 billion" },
  { value: "medium2", label: "More than UGX 5 billion up to UGX 50 billion" },
  { value: "medium1", label: "More than UGX 50 billion up to UGX 100 billion" },
  { value: "large", label: "More than UGX 100 billion" },
];

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

export type Classification = {
  classes: Record<ActivityKey, boolean>;
  fundsTier: string;
  emiTier: string;
};

export function emptyClasses(): Record<ActivityKey, boolean> {
  return Object.fromEntries(ACTIVITY_OPTIONS.map((a) => [a.key, false])) as Record<ActivityKey, boolean>;
}

export function classificationLabel(c: Classification, key: ActivityKey): string {
  if (key === "funds_transfer") return FUNDS_TRANSFER_LABEL[c.fundsTier] ?? "";
  if (key === "emi") return EMI_LABEL[c.emiTier] ?? "";
  return "";
}

export function classificationDetail(c: Classification, key: ActivityKey): string {
  if (key === "funds_transfer") return FUNDS_TRANSFER_DETAIL[c.fundsTier] ?? "";
  if (key === "emi") return EMI_DETAIL[c.emiTier] ?? "";
  return "";
}

export function selectedDefs(c: Classification): ActivityDef[] {
  return ACTIVITY_OPTIONS.filter((d) => c.classes[d.key]);
}

export type Routes = { pso: boolean; psp: boolean; instrument: boolean; emi: boolean };

export function derivedRoutes(c: Classification): Routes {
  const sel = selectedDefs(c);
  return {
    pso: sel.some((x) => x.category === "pso"),
    psp: sel.some((x) => x.category === "psp"),
    instrument: sel.some((x) => x.category === "instrument"),
    emi: !!c.classes.emi,
  };
}

// validateWizard(): at least one class, and a tier for each tiered class.
export function classificationValid(c: Classification): boolean {
  if (selectedDefs(c).length === 0) return false;
  if (c.classes.funds_transfer && !c.fundsTier) return false;
  if (c.classes.emi && !c.emiTier) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Fees (design FEES / selectedFeeRows / pricingAssessment)
// ---------------------------------------------------------------------------

export type FeeRow = {
  classKey: string;
  category: string; // PSO | PSP | Payment instrument issuer
  cls: string; // Funds transfer system | Clearing system or switch | ...
  threshold: string;
  application_fee: number;
  licensing_fee: number;
  annual_fee: number;
  min_capital: number;
};

// Fallback copy of the 14 design fee rows. The live wizard-classes /
// fee-tier fetch has been observed returning no rows intermittently, so the
// catalogue is seeded from this and overwritten per class_key by whatever
// the database returned (a live row always wins).
const FEE_SEED: FeeRow[] = [
  { classKey: "pso_funds_transfer_large", category: "PSO", cls: "Funds transfer system", threshold: "Large: monthly transaction value > UGX 100bn", application_fee: 3000000, licensing_fee: 25000000, annual_fee: 25000000, min_capital: 1000000000 },
  { classKey: "pso_funds_transfer_medium", category: "PSO", cls: "Funds transfer system", threshold: "Medium: > UGX 1bn and <= UGX 100bn per month", application_fee: 3000000, licensing_fee: 20000000, annual_fee: 20000000, min_capital: 500000000 },
  { classKey: "pso_funds_transfer_small", category: "PSO", cls: "Funds transfer system", threshold: "Small: <= UGX 1bn per month", application_fee: 3000000, licensing_fee: 15000000, annual_fee: 15000000, min_capital: 100000000 },
  { classKey: "pso_clearing_switch", category: "PSO", cls: "Clearing system or switch", threshold: "No transaction-value band", application_fee: 3000000, licensing_fee: 25000000, annual_fee: 25000000, min_capital: 500000000 },
  { classKey: "pso_settlement", category: "PSO", cls: "Settlement system", threshold: "No transaction-value band", application_fee: 3000000, licensing_fee: 25000000, annual_fee: 25000000, min_capital: 250000000 },
  { classKey: "pso_third_party", category: "PSO", cls: "Third-party system", threshold: "Aggregator, integrator or gateway", application_fee: 3000000, licensing_fee: 10000000, annual_fee: 10000000, min_capital: 100000000 },
  { classKey: "psp_emi_large", category: "PSP", cls: "Electronic-money issuer", threshold: "Large: total trust-account value > UGX 100bn", application_fee: 3000000, licensing_fee: 25000000, annual_fee: 25000000, min_capital: 10000000000 },
  { classKey: "psp_emi_medium_100bn", category: "PSP", cls: "Electronic-money issuer", threshold: "Medium: > UGX 50bn and <= UGX 100bn", application_fee: 3000000, licensing_fee: 20000000, annual_fee: 20000000, min_capital: 5000000000 },
  { classKey: "psp_emi_medium_50bn", category: "PSP", cls: "Electronic-money issuer", threshold: "Medium: > UGX 5bn and <= UGX 50bn", application_fee: 3000000, licensing_fee: 18000000, annual_fee: 18000000, min_capital: 2000000000 },
  { classKey: "psp_emi_medium_5bn", category: "PSP", cls: "Electronic-money issuer", threshold: "Medium: > UGX 500m and <= UGX 5bn", application_fee: 3000000, licensing_fee: 16000000, annual_fee: 16000000, min_capital: 1000000000 },
  { classKey: "psp_emi_small_500m", category: "PSP", cls: "Electronic-money issuer", threshold: "Small: > UGX 250m and <= UGX 500m", application_fee: 3000000, licensing_fee: 15000000, annual_fee: 15000000, min_capital: 250000000 },
  { classKey: "psp_emi_small_250m", category: "PSP", cls: "Electronic-money issuer", threshold: "Small: <= UGX 250m", application_fee: 3000000, licensing_fee: 10000000, annual_fee: 10000000, min_capital: 100000000 },
  { classKey: "psp_other", category: "PSP", cls: "Any other PSP", threshold: "Includes payment services that do not issue electronic money", application_fee: 3000000, licensing_fee: 10000000, annual_fee: 10000000, min_capital: 100000000 },
  { classKey: "instrument", category: "Payment instrument issuer", cls: "Payment cards, electronic devices or paper instruments", threshold: "All classes in amended schedules", application_fee: 0, licensing_fee: 0, annual_fee: 0, min_capital: 0 },
];

export function buildFeeCatalogue(
  wizardClasses: LicenceApplicationWizardClass[],
  feeTiers: LicenceApplicationFeeTier[]
): Record<string, FeeRow> {
  const out: Record<string, FeeRow> = {};
  FEE_SEED.forEach((r) => {
    out[r.classKey] = { ...r };
  });
  wizardClasses.forEach((c) => {
    const base = out[c.class_key];
    const label = c.label ?? "";
    const dash = label.indexOf("—");
    const cls = dash >= 0 ? label.slice(dash + 1).trim() : label;
    out[c.class_key] = {
      classKey: c.class_key,
      category: c.fee_class_label ?? base?.category ?? "",
      cls: cls || base?.cls || "",
      threshold: c.description ?? base?.threshold ?? "",
      application_fee: base?.application_fee ?? 0,
      licensing_fee: base?.licensing_fee ?? 0,
      annual_fee: base?.annual_fee ?? 0,
      min_capital: c.min_capital != null ? Number(c.min_capital) : base?.min_capital ?? 0,
    };
  });
  feeTiers.forEach((t) => {
    const row = out[t.class_key];
    if (!row) return;
    const amount = Number(t.amount);
    if (t.fee_type === "application") row.application_fee = amount;
    if (t.fee_type === "licensing") row.licensing_fee = amount;
    if (t.fee_type === "annual") row.annual_fee = amount;
  });
  return out;
}

export function classKeyForActivity(c: Classification, key: ActivityKey): string | null {
  switch (key) {
    case "funds_transfer":
      return c.fundsTier ? FUNDS_TRANSFER_CLASS_KEY[c.fundsTier] ?? null : null;
    case "clearing":
      return "pso_clearing_switch";
    case "settlement":
      return "pso_settlement";
    case "third_party":
      return "pso_third_party";
    case "emi":
      return c.emiTier ? EMI_CLASS_KEY[c.emiTier] ?? null : null;
    case "psp_tokens":
    case "psp_other":
      return "psp_other";
    default:
      return "instrument";
  }
}

// selectedFeeRows(): one row per distinct licence class, in the design's order.
export function selectedFeeRows(c: Classification, catalogue: Record<string, FeeRow>): FeeRow[] {
  const rows: FeeRow[] = [];
  const seen = new Set<string>();
  ACTIVITY_OPTIONS.forEach((def) => {
    if (!c.classes[def.key]) return;
    const k = classKeyForActivity(c, def.key);
    if (!k || seen.has(k)) return;
    const row = catalogue[k];
    if (!row) return;
    seen.add(k);
    rows.push(row);
  });
  return rows;
}

export type Pricing = {
  rows: FeeRow[];
  applicationFee: number;
  licensingFee: number;
  annualFee: number;
  minCapital: number;
};

export function pricingAssessment(c: Classification, catalogue: Record<string, FeeRow>): Pricing {
  const rows = selectedFeeRows(c, catalogue);
  return {
    rows,
    applicationFee: rows.reduce((s, r) => s + r.application_fee, 0),
    licensingFee: rows.reduce((s, r) => s + r.licensing_fee, 0),
    annualFee: rows.reduce((s, r) => s + r.annual_fee, 0),
    minCapital: rows.length ? Math.max(...rows.map((r) => r.min_capital)) : 0,
  };
}

// fmtUGX(): zero is "Nil".
export function fmtUGX(n: number): string {
  if (n === 0) return "Nil";
  return "UGX " + n.toLocaleString("en-US");
}

export function cleanThresholdLabel(threshold: string): string {
  return threshold.replace(/^(Large|Medium|Small):\s*/, "");
}

export function resultFeeClassLabel(c: Classification, row: FeeRow): string {
  if (row.cls === "Funds transfer system") return classificationLabel(c, "funds_transfer") || "Funds Transfer System";
  if (row.cls === "Electronic-money issuer") {
    const name = classificationLabel(c, "emi") || "Electronic Money Issuer";
    const band = cleanThresholdLabel(row.threshold);
    return band ? name + " · " + band : name;
  }
  if (row.cls === "Any other PSP") {
    const psp: string[] = [];
    if (c.classes.psp_tokens) psp.push("Payment Services including Tokens");
    if (c.classes.psp_other) psp.push("Any other Payment Service Provider");
    return psp.length ? psp.join(" · ") : "Payment Service Provider";
  }
  if (row.cls === "Payment instrument issuer") {
    const instruments: string[] = [];
    if (c.classes.payment_cards) instruments.push("Payment Cards");
    if (c.classes.electronic_devices) instruments.push("Electronic Devices");
    if (c.classes.paper_instruments) instruments.push("Paper-Based Instruments");
    return instruments.length ? instruments.join(" · ") : "Issuer of a Payment Instrument";
  }
  if (row.cls === "Clearing system or switch") return "Clearing System / Switch";
  if (row.cls === "Settlement system") return "Settlement System";
  if (row.cls === "Third-party system") return "Third-Party System";
  return row.cls;
}

export const COST_HELP = {
  application:
    "A non-refundable fee paid as part of the application. Bank of Uganda requires proof of payment before evaluation of the application can begin.",
  licence: "Payable after Bank of Uganda has made a decision to grant the licence.",
  annual:
    "A recurring fee payable by the licensee each year in accordance with the applicable National Payment Systems requirements.",
  capital:
    "The minimum paid-up capital the applicant must hold. It is not paid to Bank of Uganda; it is held by the applicant to support business operations.",
};

// ---------------------------------------------------------------------------
// Application details (facts)
// ---------------------------------------------------------------------------

export type FactKey =
  | "fi_mdi"
  | "existing_psp_pso_licence"
  | "foreign_corporate_shareholder"
  | "foreign_resident_management"
  | "established_business"
  | "electronic_platform"
  | "outsourcing"
  | "payment_system_participation"
  | "agents"
  | "foreign_licences";

export type FactAnswers = Record<FactKey, boolean | null>;

export function emptyFacts(): FactAnswers {
  return {
    foreign_corporate_shareholder: null,
    foreign_resident_management: null,
    established_business: null,
    electronic_platform: null,
    outsourcing: null,
    payment_system_participation: null,
    agents: null,
    foreign_licences: null,
    existing_psp_pso_licence: null,
    fi_mdi: null,
  };
}

export type FactQuestion = { key: FactKey; q: string };

// Same order and wording as the design's FACT_QUESTIONS.
export const FACT_QUESTIONS: FactQuestion[] = [
  { key: "fi_mdi", q: "Is the payment-instrument applicant a financial institution or microfinance deposit-taking institution?" },
  { key: "existing_psp_pso_licence", q: "Does the payment-instrument applicant already hold a PSP or Payment System Operator licence?" },
  { key: "foreign_corporate_shareholder", q: "Does the applicant have a foreign corporate shareholder?" },
  { key: "foreign_resident_management", q: "Are any directors or senior managers foreign nationals resident and working in Uganda?" },
  { key: "established_business", q: "Is the applicant an established business with at least two years of financial history?" },
  { key: "electronic_platform", q: "Will the payment system or service operate on an electronic system or platform?" },
  { key: "outsourcing", q: "Will any material activity be outsourced to a third party?" },
  { key: "payment_system_participation", q: "Will the applicant participate in another domestic or foreign payment system?" },
  { key: "agents", q: "Will the business model use agents?" },
  { key: "foreign_licences", q: "Does the applicant hold a similar licence in another country?" },
];

// FACT_QUESTIONS[].show() against the committed facts.
function factQuestionShown(key: FactKey, r: Routes, facts: FactAnswers): boolean {
  const formA = r.pso || r.psp;
  switch (key) {
    case "fi_mdi":
      return r.instrument;
    case "existing_psp_pso_licence":
      return r.instrument && facts.fi_mdi === false;
    case "agents":
      return formA || r.instrument;
    default:
      return formA;
  }
}

// detailQuestionVisible(): the details screen evaluates the same conditions
// against its draft answers.
export function visibleDetailQuestions(r: Routes, draft: FactAnswers): FactQuestion[] {
  return FACT_QUESTIONS.filter((q) => factQuestionShown(q.key, r, draft));
}

export function unresolvedQuestions(r: Routes, facts: FactAnswers): FactQuestion[] {
  return FACT_QUESTIONS.filter((q) => factQuestionShown(q.key, r, facts) && facts[q.key] === null);
}

export function instrumentBlocker(r: Routes, facts: FactAnswers): boolean {
  return r.instrument && facts.fi_mdi === true;
}

export function readFacts(raw: Record<string, unknown>): FactAnswers {
  const out = emptyFacts();
  (Object.keys(out) as FactKey[]).forEach((k) => {
    const v = raw[k];
    out[k] = typeof v === "boolean" ? v : null;
  });
  return out;
}

export function readClassification(raw: Record<string, unknown>): Classification {
  const classes = emptyClasses();
  const arr = Array.isArray(raw.activities) ? (raw.activities as unknown[]) : [];
  arr.forEach((a) => {
    if (typeof a === "string" && a in classes) classes[a as ActivityKey] = true;
  });
  return {
    classes,
    fundsTier: typeof raw.fundsTransferTier === "string" ? raw.fundsTransferTier : "",
    emiTier: typeof raw.emiTier === "string" ? raw.emiTier : "",
  };
}

export function classificationToFacts(c: Classification): Record<string, unknown> {
  return {
    activities: ACTIVITY_OPTIONS.filter((a) => c.classes[a.key]).map((a) => a.key),
    fundsTransferTier: c.fundsTier,
    emiTier: c.emiTier,
  };
}

// ---------------------------------------------------------------------------
// Files / answers
// ---------------------------------------------------------------------------

export type FileMeta = {
  name: string;
  version: number;
  uploadedAt: string;
  label: string;
  slot: string;
  storagePath: string;
};

// externalId -> slot -> latest version of that slot
export type FileMap = Record<string, Record<string, FileMeta>>;
// externalId -> persisted answers ("d" in the design)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataMap = Record<string, any>;

export type Ctx = {
  c: Classification;
  routes: Routes;
  facts: FactAnswers;
  data: DataMap;
  files: FileMap;
  pricing: Pricing;
};

export type ItemStatus = "not_started" | "in_progress" | "ready";

export type Template = LicenceApplicationTemplate;

export const WORKSPACE_PEOPLE_ITEM = "P02";
export const WORKSPACE_OWNERSHIP_ITEM = "P01";

export function productType(t: Template): string {
  return t.product_type || "upload";
}

export function productConfig(t: Template) {
  return t.product_config ?? {};
}

export function cardTitle(t: Template): string {
  return t.card_title || t.title;
}

export function normName(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function fileMeta(ctx: Ctx, id: string, slot: string): FileMeta | null {
  return ctx.files[id]?.[slot] ?? null;
}
export function fileCount(ctx: Ctx, id: string): number {
  return Object.keys(ctx.files[id] ?? {}).length;
}
export function hasFile(ctx: Ctx, id: string, slot: string): boolean {
  return !!fileMeta(ctx, id, slot);
}

export type OwnerRow = {
  id: string;
  parent: string;
  name: string;
  type: "individual" | "company";
  percent: string | number;
  foreign?: boolean;
};
export type ManagementRow = {
  id: string;
  name: string;
  role: string;
  designation: string;
  nationality: string;
  qualification: string;
  workPermitRequired?: boolean;
};
export type Person = { key: string; name: string; roles: string[]; workPermitRequired?: boolean };

export function ownershipRows(ctx: Ctx): OwnerRow[] {
  const d = ctx.data[WORKSPACE_OWNERSHIP_ITEM];
  return Array.isArray(d?.rows) ? (d.rows as OwnerRow[]) : [];
}
export function managementRows(ctx: Ctx): ManagementRow[] {
  const d = ctx.data[WORKSPACE_PEOPLE_ITEM];
  return Array.isArray(d?.rows) ? (d.rows as ManagementRow[]) : [];
}

// getPeople(): one registry built from P02 plus the individual owners in P01.
export function getPeople(ctx: Ctx, filter?: string): Person[] {
  const map: Record<string, Person> = {};
  managementRows(ctx).forEach((r) => {
    if (!r.name) return;
    const k = normName(r.name);
    map[k] = map[k] || { key: k, name: r.name, roles: [] };
    const role = r.role || r.designation || "Management";
    if (map[k].roles.indexOf(role) === -1) map[k].roles.push(role);
    if (r.workPermitRequired) map[k].workPermitRequired = true;
  });
  ownershipRows(ctx).forEach((r) => {
    if (r.type !== "individual" || !r.name) return;
    const k = normName(r.name);
    map[k] = map[k] || { key: k, name: r.name, roles: [] };
    if (map[k].roles.indexOf("Shareholder / beneficial owner") === -1) map[k].roles.push("Shareholder / beneficial owner");
  });
  let arr = Object.keys(map).map((k) => map[k]);
  if (filter === "work_permit") arr = arr.filter((p) => !!p.workPermitRequired);
  return arr.sort((a, b) => a.name.localeCompare(b.name));
}

export function directShareholders(ctx: Ctx): OwnerRow[] {
  return ownershipRows(ctx).filter((r) => r.parent === "applicant");
}

export function ownershipReady(ctx: Ctx): boolean {
  const rows = ownershipRows(ctx);
  if (!rows.length || fileCount(ctx, WORKSPACE_OWNERSHIP_ITEM) === 0) return false;
  const children = (parent: string) => rows.filter((r) => r.parent === parent);
  const total = (list: OwnerRow[]) => list.reduce((s, r) => s + (parseFloat(String(r.percent)) || 0), 0);
  const direct = children("applicant");
  if (!direct.length || Math.abs(total(direct) - 100) > 0.01) return false;
  const seen: Record<string, boolean> = {};
  const branchReady = (row: OwnerRow): boolean => {
    if (!row.name || !row.type || !(parseFloat(String(row.percent)) > 0)) return false;
    if (row.type === "individual") return true;
    if (seen[row.id]) return false;
    seen[row.id] = true;
    const kids = children(row.id);
    if (!kids.length || Math.abs(total(kids) - 100) > 0.01) return false;
    return kids.every(branchReady);
  };
  return direct.every(branchReady);
}

export function peopleReady(ctx: Ctx): boolean {
  const d = ctx.data[WORKSPACE_PEOPLE_ITEM] ?? {};
  const rows = managementRows(ctx);
  if (!rows.length || !d.confirmed) return false;
  return rows.every((r) => !!(r.name && r.role && r.designation && r.nationality && r.qualification));
}

function personSlotsReady(ctx: Ctx, id: string, slots: [string, string][], filter?: string): boolean {
  const people = getPeople(ctx, filter);
  if (!people.length) return false;
  return people.every((p) => slots.every((s) => hasFile(ctx, id, p.key + "::" + s[0])));
}

export const COMPANY_DOC_SLOTS: [string, string][] = [
  ["certificate", "Certificate of Incorporation"],
  ["memorandum", "Memorandum"],
  ["articles", "Articles of Association"],
  ["shareholding", "Current shareholding / return of allotment"],
  ["directors", "Director particulars"],
  ["registered_office", "Registered-office details"],
  ["beneficial_ownership", "Beneficial-ownership records"],
];

export const IT_CONTROLS: [string, string][] = [
  ["assets", "IT asset inventory & maintenance"],
  ["change", "Configuration & change management"],
  ["access", "Identity & access management"],
  ["data", "Data architecture & protection"],
  ["vulnerability", "Patch & vulnerability management"],
  ["network", "Network architecture & security"],
  ["email", "Email & browser security"],
  ["endpoint", "Endpoint security & hardening"],
];

export const SOURCE_OF_FUNDS_OPTIONS = [
  "Savings",
  "Salary / employment income",
  "Dividends",
  "Business income",
  "Investment proceeds",
  "Other",
];

export function customerTermsRequired(ctx: Ctx): boolean {
  return !!ctx.c.classes.emi || ctx.routes.instrument;
}

// statusFor(): completion is always calculated from the actual work.
export function statusFor(t: Template, ctx: Ctx): ItemStatus {
  const id = t.external_id;
  const type = productType(t);
  const cfg = productConfig(t);
  const d = ctx.data[id] ?? {};
  const fc = fileCount(ctx, id);
  const ready = "ready" as const;
  const prog = "in_progress" as const;
  const none = "not_started" as const;

  switch (type) {
    case "embedded":
    case "system":
    case "event":
    case "aggregate":
      return ready;
    case "upload":
      return hasFile(ctx, id, "main") ? ready : fc ? prog : none;
    case "multi_upload":
      return fc > 0 ? ready : none;
    case "docpack":
      return (cfg.slots ?? []).every((s) => hasFile(ctx, id, s[0])) ? ready : fc ? prog : none;
    case "company_docs": {
      const complete = COMPANY_DOC_SLOTS.every((s) => hasFile(ctx, id, s[0])) && !!d.objectsChecked && !!d.articlesChecked;
      return complete ? ready : fc > 0 || d.objectsChecked || d.articlesChecked ? prog : none;
    }
    case "entity": {
      const ok = !!(d.legalName && d.entityType && d.entityType !== "foreign_branch" && d.entityType !== "other_ineligible");
      return ok ? ready : d.legalName || d.entityType ? prog : none;
    }
    case "repeat_docs": {
      const rows: { id: string; name?: string }[] = d.rows ?? [];
      const ok = rows.length > 0 && rows.every((r) => r.name && hasFile(ctx, id, "row::" + r.id));
      return ok ? ready : rows.length || fc ? prog : none;
    }
    case "premises": {
      const ok = !!(d.address && d.confirmed);
      return ok ? ready : d.address || d.confirmed ? prog : none;
    }
    case "emi_structure": {
      const ok = !!d.structure && (d.structure !== "separate_entity" || hasFile(ctx, id, "incorporation"));
      return ok ? ready : d.structure || fc ? prog : none;
    }
    case "official_form":
      return hasFile(ctx, id, "completed") ? ready : fc ? prog : none;
    case "person_form":
      return personSlotsReady(ctx, id, [["form", "Form B"]]) ? ready : fc ? prog : none;
    case "ownership":
      return ownershipReady(ctx) ? ready : ownershipRows(ctx).length || fc ? prog : none;
    case "people":
      return peopleReady(ctx) ? ready : managementRows(ctx).length ? prog : none;
    case "person_upload":
      return personSlotsReady(ctx, id, cfg.slots ?? [], cfg.person_filter) ? ready : fc ? prog : none;
    case "person_credit": {
      const ppl = getPeople(ctx);
      const nr: Record<string, boolean> = d.notRegistered ?? {};
      if (!ppl.length) return none;
      const ok = ppl.every((p) => hasFile(ctx, id, p.key + "::report") || nr[p.key] === true);
      return ok ? ready : fc || Object.keys(nr).length ? prog : none;
    }
    case "source_funds": {
      const sh = directShareholders(ctx);
      const rows: Record<string, { source?: string; explanation?: string }> = d.rows ?? {};
      if (!sh.length) return none;
      const ok = sh.every((s) => {
        const r = rows[s.id] ?? {};
        return !!(r.source && r.explanation && hasFile(ctx, id, "shareholder::" + s.id));
      });
      return ok ? ready : Object.keys(rows).length || fc ? prog : none;
    }
    case "product_desc": {
      const ok = hasFile(ctx, id, "main") && (!ctx.routes.pso || !!d.interoperabilityChecked);
      return ok ? ready : fc || d.interoperabilityChecked ? prog : none;
    }
    case "financials": {
      const ok = ctx.facts.established_business !== null && hasFile(ctx, id, "main");
      return ok ? ready : ctx.facts.established_business !== null || fc ? prog : none;
    }
    case "capital": {
      const min = ctx.pricing.minCapital || 0;
      const amount = parseFloat(d.amount) || 0;
      const ok = hasFile(ctx, id, "main") && (min === 0 || amount >= min);
      return ok ? ready : fc || d.amount ? prog : none;
    }
    case "tin_tax": {
      const ok = !!d.tin && hasFile(ctx, id, "main");
      return ok ? ready : d.tin || fc ? prog : none;
    }
    case "it_controls": {
      const checks: Record<string, boolean> = d.coverage ?? {};
      const ok = fc > 0 && IT_CONTROLS.every((c) => checks[c[0]] === true);
      return ok ? ready : fc || Object.keys(checks).length ? prog : none;
    }
    case "pentest": {
      const ok = hasFile(ctx, id, "report") && d.findings && (d.findings !== "material" || hasFile(ctx, id, "remediation"));
      return ok ? ready : fc || d.findings ? prog : none;
    }
    case "outsourcing":
    case "payment_systems":
    case "foreign_licences": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = d.rows ?? [];
      const ok =
        rows.length > 0 &&
        rows.every((r) => {
          if (type === "outsourcing") return r.provider && r.service && hasFile(ctx, id, "row::" + r.id);
          if (type === "payment_systems")
            return r.system && r.participation && (hasFile(ctx, id, "row::" + r.id) || r.noEvidence === true);
          return r.country && r.licenceType && r.status && hasFile(ctx, id, "row::" + r.id);
        });
      return ok ? ready : rows.length || fc ? prog : none;
    }
    case "customer_terms": {
      const required = customerTermsRequired(ctx);
      const ok = hasFile(ctx, id, "main") || (!required && d.notApplicable === true);
      return ok ? ready : fc || d.notApplicable ? prog : none;
    }
    case "pricing": {
      const ok = hasFile(ctx, id, "main") || d.noCharges === true;
      return ok ? ready : fc || d.noCharges ? prog : none;
    }
    case "fee_proof":
      return hasFile(ctx, id, "main") ? ready : none;
    case "data_centre": {
      const ok = !!(d.location && d.hosting && hasFile(ctx, id, "main"));
      return ok ? ready : d.location || d.hosting || fc ? prog : none;
    }
    default:
      return none;
  }
}

export function cardSummary(t: Template, ctx: Ctx, status: ItemStatus): string {
  const id = t.external_id;
  const type = productType(t);
  const cfg = productConfig(t);
  if (status === "ready") {
    if (type === "person_upload" || type === "person_form" || type === "person_credit") {
      const n = getPeople(ctx, cfg.person_filter).length;
      return n + " person" + (n === 1 ? "" : "s") + " complete";
    }
    if (type === "upload" || type === "official_form") {
      const f = ctx.files[id] ?? {};
      const ks = Object.keys(f);
      if (ks.length) return f[ks[0]].name + " · v" + f[ks[0]].version;
    }
    if (type === "multi_upload" || type === "company_docs" || type === "docpack") {
      const n = fileCount(ctx, id);
      return n + " document" + (n === 1 ? "" : "s") + " added";
    }
    return "Complete";
  }
  if (status === "in_progress") return "Work saved";
  return "";
}

// ---------------------------------------------------------------------------
// Applicability (design routeBaseApplies / factApplies / visualItems)
// ---------------------------------------------------------------------------

export type Applicability = "in" | "out" | "unresolved";

export function itemApplicability(t: Template, r: Routes, facts: FactAnswers): Applicability {
  const a = t.applies_to;
  if (a == null) {
    // Legacy rows (applies_to not yet populated): route_key + applicability.fact_key.
    if (t.route_key === "pso" && !r.pso) return "out";
    if (t.route_key === "emi" && !r.emi) return "out";
    if (t.route_key === "instrument" && !r.instrument) return "out";
    const fk = (t.applicability as { fact_key?: unknown } | undefined)?.fact_key;
    if (typeof fk === "string" && fk in facts) {
      const v = facts[fk as FactKey];
      if (v === null) return "unresolved";
      return v ? "in" : "out";
    }
    return "in";
  }
  if (a.routes_any && a.routes_any.length && !a.routes_any.some((k) => !!r[k as keyof Routes])) return "out";
  if (a.emi && !r.emi) return "out";
  let unresolved = false;
  if (a.facts) {
    for (const [k, want] of Object.entries(a.facts)) {
      const v = facts[k as FactKey];
      if (v === null || v === undefined) unresolved = true;
      else if (v !== want) return "out";
    }
  }
  return unresolved ? "unresolved" : "in";
}

// visualItems(): applicable, not hidden, and the fee / capital rules.
export function visibleTemplates(templates: Template[], r: Routes, facts: FactAnswers, pricing: Pricing): Template[] {
  return templates.filter((t) => {
    if (itemApplicability(t, r, facts) !== "in") return false;
    if (t.workspace_hidden) return false;
    const a = t.applies_to;
    if (a?.min_capital_gt != null && !(pricing.minCapital > a.min_capital_gt)) return false;
    if (a?.application_fee_gt != null && !(pricing.applicationFee > a.application_fee_gt)) return false;
    return true;
  });
}

// PHASES: phases appear in the order their items first appear (by seq).
export function phaseOrder(templates: Template[]): string[] {
  const sorted = [...templates].sort((a, b) => a.seq - b.seq);
  const out: string[] = [];
  sorted.forEach((t) => {
    if (out.indexOf(t.phase) === -1) out.push(t.phase);
  });
  return out;
}

export const PHASE_LABELS: Record<string, string> = {
  company: "Company setup",
  forms: "Forms & submission",
  people: "Owners, directors & management",
  business: "Business & financials",
  technology: "Risk, technology & operations",
  policies: "Customers & compliance",
  review: "BoU review & approval readiness",
};

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

export function routeSummaryText(c: Classification): string {
  const sel = selectedDefs(c);
  if (!sel.length) return "No route selected";
  return sel
    .map((def) => {
      const cl = classificationLabel(c, def.key);
      return def.title + (cl ? " · " + cl : "");
    })
    .join("  ·  ");
}

export type ApplicationSummary = {
  total: number;
  ready: number;
  inProgress: number;
  remaining: number;
  unresolved: number;
  pct: number;
  complete: boolean;
};

export function summarise(items: Template[], statuses: Record<string, ItemStatus>, unresolved: number): ApplicationSummary {
  const ready = items.filter((t) => statuses[t.external_id] === "ready").length;
  const inProgress = items.filter((t) => statuses[t.external_id] === "in_progress").length;
  const total = items.length;
  return {
    total,
    ready,
    inProgress,
    remaining: Math.max(0, total - ready - inProgress),
    unresolved,
    pct: total ? Math.round((100 * ready) / total) : 0,
    complete: total > 0 && ready === total && unresolved === 0,
  };
}

// dynamicCopy() is unused in the v7 workspace; B06's variant is handled by its editor.

export function formatBookingDate(value: string): string {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function newRowId(prefix: string): string {
  return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
}
