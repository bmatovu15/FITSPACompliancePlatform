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
};

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
