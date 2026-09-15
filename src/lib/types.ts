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
  pso_class: string | null;
  pso_band: string | null;
  emi: string | null;
  emi_band: string | null;
  cards: string | null;
  agent: string | null;
  sfi: string | null;
  participant: string | null;
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
