export type Regulator = {
  id: string;
  name: string;
  sector: string | null;
  status: string;
};

export type Licence = {
  id: string;
  regulator_id: string;
  name: string;
  description: string | null;
  status: string;
};

export type Subsector = {
  id: string;
  name: string;
  notes: string | null;
};

export type FintechVertical = {
  id: string;
  name: string;
  status: "active" | "pending" | "rejected";
};

export type Obligation = {
  id: string;
  regulator_id: string | null;
  licence_id: string | null;
  member_id: string | null;
  title: string;
  legal_ref: string | null;
  description: string | null;
  penalty: string | null;
  frequency: string | null;
  due_date: string | null;
  risk: "High" | "Medium" | "Low" | null;
  requires_evidence: boolean;
  source: "admin" | "ai_extracted" | "member_added";
  status: "Active" | "Complete" | "Pending Approval" | "Rejected";
  policy_year: string | null;
  completion_remark: string | null;
  // Merged compliance-calendar catalog columns (payments_compliance_assistant
  // and any future annual-obligations catalog imported the same way).
  catalog_key: string | null;
  external_id: string | null;
  domain: string | null;
  obligation_type: string | null;
  cadence: string | null;
  trigger_event: string | null;
  legal_deadline: string | null;
  due_logic: string | null;
  owner_role: string | null;
  reviewer_role: string | null;
  evidence_needed: string | null;
  submission_channel: string | null;
  severity: "Critical" | "High" | "Medium" | null;
  authority: string | null;
  source_doc_name: string | null;
  applies_all: boolean;
  applies_pso: boolean;
  applies_psp: boolean;
  applies_emi: boolean;
  applies_instrument: boolean;
  applies_agent: boolean;
  applies_cards: boolean;
  applies_sfi: boolean;
  applies_participant: boolean;
  // Digital Lending Compliance Calendar (digital_lending_compliance_assistant)
  // applicability flags — mirror the payments applies_* columns above.
  applies_money_lender: boolean;
  applies_ndt_mfi: boolean;
  applies_personal_data: boolean;
  applies_collateral: boolean;
  applies_recovery_agents: boolean;
  applies_fitspa_subscriber: boolean;
  // Beacon Phase 2 additions (Digital Lending Compliance audit, plan §9.3):
  // custody/crossborder/advice are independent facts from the DL prototype
  // that don't map onto any existing applies_* column.
  applies_custody: boolean;
  applies_crossborder: boolean;
  applies_advice: boolean;
};

// ---------------------------------------------------------------------------
// NPS Licence Pathway reference tables
// ---------------------------------------------------------------------------

export type NpsRequirement = {
  id: string;
  seq: number;
  phase: string;
  type: string;
  requirement: string;
  meaning: string;
  pso: "Yes" | "No" | "Conditional";
  psp_other: "Yes" | "No" | "Conditional";
  psp_emi: "Yes" | "No" | "Conditional";
  instrument: "Yes" | "No" | "Conditional" | "Information only";
  timing: string | null;
  evidence: string | null;
  level: string | null;
  source: string | null;
  source_link: string | null;
  condition: string | null;
};

export type NpsFeeTier = {
  id: string;
  sort_order: number;
  category: string;
  class: string;
  threshold: string;
  application_fee: number;
  licensing_fee: number;
  annual_fee: number;
  min_capital: number;
};

// ---------------------------------------------------------------------------
// Digital Credit Licence Pathway reference tables
// ---------------------------------------------------------------------------

export type DigitalCreditRequirement = {
  id: string;
  seq: number;
  phase: string;
  type: string;
  requirement: string;
  meaning: string;
  money_lender: "Yes" | "No" | "Conditional";
  ndt_mfi: "Yes" | "No" | "Conditional";
  timing: string | null;
  evidence: string | null;
  level: string | null;
  source: string | null;
  source_link: string | null;
  condition: string | null;
};

export type DigitalCreditFee = {
  id: string;
  sort_order: number;
  route: string;
  event: string;
  amount: number;
  status: string | null;
  note: string | null;
  source: string | null;
  source_link: string | null;
};

// ---------------------------------------------------------------------------
// Compliance Calendar — reference/catalog tables (annual obligations,
// ported from the Payments Compliance Assistant prototype; ties back to
// the merged `obligations` catalog via obligation_external_id + catalog_key)
// ---------------------------------------------------------------------------

export type ComplianceCalendarTask = {
  id: string;
  obligation_external_id: string;
  regulator_id: string | null;
  catalog_key: string;
  catalog_year: number | null;
  task: string;
  applies_to: string;
  period: string | null;
  period_end: string | null;
  legal_due: string | null;
  lead_days: number | null;
  internal_target: string | null;
  owner_role: string | null;
  reviewer_role: string | null;
  notes: string | null;
  source_link: string | null;
};

export type ComplianceEvent = {
  id: string;
  obligation_external_id: string | null;
  regulator_id: string | null;
  catalog_key: string;
  trigger_name: string;
  applies_to: string;
  legal_clock: string | null;
  response: string | null;
  owner_role: string | null;
  escalation: string | null;
  evidence: string | null;
  source_citation: string | null;
  source_link: string | null;
  notes: string | null;
};

export type ComplianceControl = {
  id: string;
  regulator_id: string | null;
  catalog_key: string;
  domain: string | null;
  objective: string;
  operation: string | null;
  applies_to: string;
  cadence: string | null;
  owner_role: string | null;
  reviewer_role: string | null;
  evidence: string | null;
  failure_response: string | null;
  legal_basis: string | null;
  source_link: string | null;
};

export type ComplianceWorkflowState = {
  state: string;
  description: string | null;
  sort_order: number | null;
};

export type ComplianceReminderRule = {
  id: string;
  sort_order: number | null;
  rule: string;
  legal_clock: string | null;
  pattern: string | null;
  escalation: string | null;
  completion: string | null;
};

export type ComplianceHoliday = {
  id: string;
  holiday_date: string;
  name: string;
  type: string | null;
};

// ---------------------------------------------------------------------------
// Compliance Calendar — per-member state
// ---------------------------------------------------------------------------

export type MemberComplianceProfile = {
  member_id: string;
  catalog_key: string;
  primary_category: string | null;
  // Beacon Phase 2: independent Payments classification flags, replacing the
  // single-select primary_category equality check so a member can hold
  // combined licences (e.g. PSO + PSP at once). primary_category is kept
  // for backward compatibility/display and is derived from these on save.
  is_pso: string | null;
  is_psp: string | null;
  is_instrument: string | null;
  pso_class: string | null;
  pso_band: string | null;
  emi: string | null;
  emi_band: string | null;
  cards: string | null;
  agent: string | null;
  sfi: string | null;
  participant: string | null;
  // Digital Lending Compliance Calendar profile fields (same table, scoped by
  // catalog_key — primary key is (member_id, catalog_key)).
  money_lender: string | null;
  ndt_mfi: string | null;
  personal_data: string | null;
  collateral: string | null;
  recovery_agents: string | null;
  fitspa_subscriber: string | null;
  // Beacon Phase 2 additions (Digital Lending Compliance audit, plan §9.3).
  route: string | null;
  issue_date: string | null;
  fye_date: string | null;
  pdpo_status: string | null;
  pdpo_expiry: string | null;
  custody: string | null;
  crossborder: string | null;
  advice: string | null;
  profile_set: boolean;
  updated_at: string;
};

export type MemberCalendarTaskState = {
  id: string;
  member_id: string;
  task_id: string;
  workflow: string;
  evidence_link: string | null;
  submitted_date: string | null;
  receipt: string | null;
  notes: string | null;
  updated_at: string;
};

export type MemberLoggedEvent = {
  id: string;
  member_id: string;
  event_id: string;
  chosen_date: string;
  deadline: string | null;
  status: string;
  created_at: string;
};

export type MemberControlState = {
  id: string;
  member_id: string;
  control_id: string;
  status: string;
  last_reviewed: string | null;
  updated_at: string;
};

export const WORKFLOW_STATES = [
  "Scheduled",
  "Preparing",
  "Under review",
  "Approved internally",
  "Submitted",
  "Acknowledged",
  "Closed",
  "Exception",
  "Not applicable",
] as const;

export const APPLIES_TO_VALUES = [
  "ALL",
  "PSO",
  "PSP",
  "EMI",
  "AGENTS",
  "STORED CARDS",
  "PARTICIPANT",
  "SFI",
] as const;

export type DocumentRow = {
  id: string;
  regulator_id: string | null;
  title: string;
  doc_kind: string;
  sector: string | null;
  tags: string[] | null;
  status: string;
  storage_path: string | null;
  file_name: string | null;
  ocr_status: string;
  index_status: string;
};

export type Member = {
  id: string;
  auth_user_id: string | null;
  company_name: string;
  company_email: string;
  fitspa_member_id: string | null;
  logo_url: string | null;
  office_location: string | null;
  signup_contact_name: string | null;
  signup_contact_role: string | null;
  fintech_vertical_id: string | null;
  member_type: string;
  status: "pending_activation" | "active" | "suspended";
};

export type MemberLicence = {
  id: string;
  member_id: string;
  licence_id: string;
  licence_number: string | null;
  status: "Active" | "Expired" | "Pending" | "Suspended";
  expiry_date: string | null;
  verified: boolean;
  verification_note: string | null;
};

export const DOC_KINDS = [
  "Act", "Regulation", "Framework", "Guideline", "Form", "Checklist",
  "Reporting Template", "Policy", "Circular", "Template", "Other",
] as const;

export const CONTACT_ROLES = ["Compliance", "CEO", "Legal", "IT"] as const;

// ---------------------------------------------------------------------------
// Compliance Calendar — catalogs (multi-regulator support)
// ---------------------------------------------------------------------------

export type ComplianceCatalog = {
  catalog_key: string;
  regulator_id: string | null;
  title: string;
  seal_text: string | null;
  subtitle: string | null;
  sort_order: number;
};

export type ComplianceCatalogFee = {
  id: number;
  catalog_key: string;
  route_or_layer: string | null;
  fee_or_requirement: string;
  amount: string | null;
  when_due: string | null;
  treatment: string | null;
  source: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SourceRegister = {
  id: string;
  scope_type: string;
  scope_key: string;
  sort_order: number;
  file: string | null;
  document: string | null;
  source_level: string | null;
  use_in_map: string | null;
  relied_on: boolean | null;
  drive_link: string | null;
};

// ---------------------------------------------------------------------------
// Requirements Pathway -- generic, admin-extensible schema for "licence
// readiness" wizards (one-time, no-login checklist + fee estimate tools).
// This is the canonical source going forward; `pathway_regulators` carries
// one row per regulator/pathway (e.g. 'nps', 'digital_credit', and any
// future regulator added purely through admin data entry), with
// `pathway_requirements`/`pathway_fees` scoped to it by `pathway_key`. The
// old bespoke tables (nps_requirements, nps_fee_tiers,
// digital_credit_requirements, digital_credit_fees) are left in the DB,
// unused, for reference/diffing.
// ---------------------------------------------------------------------------

export type PathwayHeroStat = {
  value: string;
  label: string;
};

export type PathwayRouteOption = {
  value: string;
  label: string;
  // Set on the option that determines the effective applicability column
  // for its route (e.g. PSP's "Electronic-money issuer" option sets
  // column: "PSP_EMI"). Options that only narrow a fee tier (a volume/value
  // band) omit this and set bandMatch instead.
  column?: string;
  // Set on a class-choosing option to select which `pathway_fees` rows
  // (tiered shape) apply, matched against `pathway_fees.class`.
  feeClass?: string;
  // Set on a band-choosing option (shown via a nested `show_if`) to narrow
  // which `pathway_fees` row within a class applies, matched as a prefix
  // against `pathway_fees.threshold`.
  bandMatch?: string;
};

export type PathwaySubquestion = {
  key: string;
  label: string;
  // Only rendered/considered once the subquestion with key `show_if.key`
  // has an answer equal to `show_if.equals` (nested conditional questions).
  show_if?: { key: string; equals: string };
  options: PathwayRouteOption[];
};

export type PathwayRoute = {
  key: string;
  tag?: string;
  label: string;
  description?: string;
  // Present when selecting the route alone (no subquestion override) sets
  // applicability for this column.
  column?: string;
  // Tiered fee_shape: which `pathway_fees.category` this route's fees fall
  // under.
  feeCategory?: string;
  // Flat fee_shape: which `pathway_fees.route` label this route's fees are
  // filed under.
  feeRouteLabel?: string;
  subquestions?: PathwaySubquestion[];
};

export type PathwayRegulator = {
  key: string;
  regulator_id: string | null;
  title: string;
  seal_text: string | null;
  eyebrow: string | null;
  subtitle: string | null;
  hero_title: string | null;
  hero_dek: string | null;
  hero_stats: PathwayHeroStat[];
  routes: PathwayRoute[];
  fee_shape: "tiered" | "flat";
  source_note: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  wizard_title: string | null;
  wizard_note: string | null;
  routes_heading: string | null;
  routes_note: string | null;
  fees_note: string | null;
};

export type PathwayApplicabilityValue = "Yes" | "No" | "Conditional" | "Information only";

export type PathwayRequirement = {
  id: string;
  pathway_key: string;
  external_id: string;
  seq: number;
  phase: string;
  item_type: string | null;
  requirement: string;
  meaning: string | null;
  applicability: Record<string, PathwayApplicabilityValue>;
  timing: string | null;
  evidence: string | null;
  level: string | null;
  source: string | null;
  source_link: string | null;
  condition: string | null;
};

// Numeric columns come back from Postgres/Supabase as strings (safe-integer
// avoidance) -- code reading this table converts with Number(...) at the
// fetch boundary before treating it as this type.
export type PathwayFee = {
  id: string;
  pathway_key: string;
  sort_order: number;
  // Tiered shape (fee_shape = 'tiered', e.g. nps)
  category: string | null;
  class: string | null;
  threshold: string | null;
  application_fee: number | null;
  licensing_fee: number | null;
  annual_fee: number | null;
  min_capital: number | null;
  // Flat shape (fee_shape = 'flat', e.g. digital_credit)
  route: string | null;
  event: string | null;
  amount: number | null;
  note: string | null;
  status: string | null;
  source: string | null;
  source_link: string | null;
};

// ---------------------------------------------------------------------------
// Licence Application Manager -- the public/no-login "Apply" wizard (Beacon
// Phase 4). One admin-authored template catalog per application_key (e.g.
// 'digital_lending') drives a per-applicant checklist; the applicant's own
// progress is tracked anonymously (member_id nullable) against a
// browser-persisted application id, then optionally linked to a member once
// they sign in. See strategy/beacon-template-redesign-plan.md §9.1 for the
// audited Digital Lending 21-item schema this was seeded from.
// ---------------------------------------------------------------------------

export type LicenceApplicationDrawerType =
  | "company_registration"
  | "premises"
  | "org_structure"
  | "capital"
  | "people"
  | "declarations"
  | "product_desc"
  | "source_funds"
  | "lending_agreement"
  | "it_controls"
  | "generic_upload"
  | "data_protection"
  | "governance"
  | "official_form"
  // Payments (payments_nps) -- added for the Phase 3 Apply wizard. See
  // strategy/beacon-template-redesign-plan.md §9.5 for the per-item drawer
  // classification rationale.
  | "ownership"
  | "emi_structure"
  | "credit"
  | "tin_tax"
  | "financials"
  | "pentest"
  | "repeat_arrangement"
  | "docpack"
  | "customer_terms"
  | "pricing"
  | "multi_upload"
  | "fee_proof"
  | "data_centre";

export type LicenceApplicationTemplate = {
  id: string;
  application_key: string;
  regulator_id: string | null;
  licence_id: string | null;
  external_id: string;
  // null on a route-agnostic item (applies to every wizard class of this
  // application_key); otherwise scopes the item to one wizard class's route
  // (e.g. 'ml' or 'ndt' for digital_lending).
  route_key: string | null;
  phase: string;
  seq: number;
  title: string;
  copy: string | null;
  cta_label: string | null;
  drawer_type: LicenceApplicationDrawerType;
  source_label: string | null;
  source_url: string | null;
  guide_what: string | null;
  guide_do: string | null;
  guide_evidence: string | null;
  applicability: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LicenceApplicationWizardClass = {
  id: string;
  application_key: string;
  class_key: string;
  label: string;
  description: string | null;
  sort_order: number;
  fee_class_label: string | null;
  min_capital: number | null;
  leads_to: Record<string, unknown>;
  created_at: string;
};

export type LicenceApplicationFeeTier = {
  id: string;
  application_key: string;
  class_key: string;
  fee_type: "application" | "licensing" | "annual";
  amount: number;
  note: string | null;
  source_label: string | null;
  source_url: string | null;
  sort_order: number;
  created_at: string;
};

export type MemberLicenceApplication = {
  id: string;
  // null for an anonymous applicant -- RLS scopes access to the row's own id
  // (held client-side, e.g. in localStorage) rather than to a signed-in
  // member for as long as this stays null.
  member_id: string | null;
  application_key: string;
  class_key: string | null;
  facts: Record<string, unknown>;
  status: "draft" | "submitted" | "withdrawn";
  started_at: string;
  submitted_at: string | null;
  updated_at: string;
};

export type MemberLicenceApplicationItemState = {
  id: string;
  application_id: string;
  external_id: string;
  status: "not_started" | "in_progress" | "ready";
  answers: Record<string, unknown>;
  updated_at: string;
};

export type MemberLicenceApplicationFile = {
  id: string;
  application_id: string;
  external_id: string;
  // Named slot within an item (e.g. "certificate", "id-doc-1") -- a new
  // upload to the same slot inserts a new, higher-`version` row rather than
  // overwriting the existing one.
  slot: string;
  file_name: string;
  storage_path: string;
  version: number;
  uploaded_at: string;
};
