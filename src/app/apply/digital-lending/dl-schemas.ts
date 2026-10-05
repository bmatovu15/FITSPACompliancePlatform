// Data schema for the Digital Lending Apply requirement drawers.
//
// Every requirement drawer in the Beacon design (digital_apply.html) is a
// purpose-built form. Rather than hand-coding 17 components, each one is
// described here as a list of "blocks" that ONE renderer (dl-forms.tsx) draws
// and ONE evaluator (dl-engine.ts) reads to decide whether the requirement is
// "Not started" / "In progress" / "Ready to submit". The same JSON is seeded
// into licence_application_templates.form_schema by db/migrations/0102_*.sql;
// the app prefers the database copy and falls back to the copy in this file,
// so the drawers keep working if the migration has not been applied yet (and so
// admins can later tune labels without a deploy).
//
// Answer shapes (stored in member_licence_application_item_state.answers) are
// exactly those of the design (Appendix A of the gap analysis).

export type Field = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date";
  /** default true; the design treats "Other directorships" as optional. */
  required?: boolean;
};

export type Cond =
  | { key: string; eq: string | boolean }
  | { key: string; ne: string | boolean }
  | { route: string };

export type RowFile = {
  /** slot = `${slotPrefix}${rowId}` */
  slotPrefix: string;
  label: string;
  /** helper text shown under the file input when nothing is attached */
  hint: string;
  required?: boolean;
};

export type Block =
  | { kind: "fields"; cols?: 1 | 2; fields: Field[]; mt?: number }
  | {
      kind: "choice";
      key: string;
      label?: string;
      options: { value: string; label: string }[];
      required?: boolean;
      /** margin-top (px) of the choice row (design uses 10 under an intro paragraph) */
      mt?: number;
    }
  | { kind: "section"; title?: string; blocks: Block[]; mt?: number }
  | { kind: "text"; text: string }
  | { kind: "note"; text: string }
  | { kind: "check"; key: string; label: string; required?: boolean; saveOnToggle?: boolean }
  | { kind: "checks"; items: { key: string; label: string }[]; required?: boolean }
  | { kind: "checkArray"; key: string; options: string[]; min?: number }
  | {
      kind: "upload";
      slot: string;
      label: string;
      /** labels that depend on another answer (NDT-A1: company vs NGO) */
      labelIf?: { key: string; map: Record<string, string> };
      required?: boolean;
    }
  | { kind: "multiupload"; label: string; slotPrefix: string; fileLabel: string; required?: boolean }
  | {
      kind: "repeater";
      key: string;
      cardClass: "person-card" | "product-card" | "fund-card" | "place-card";
      itemLabel: string;
      addLabel: string;
      cols: 1 | 2;
      fields: Field[];
      file?: RowFile;
      min?: number;
    }
  | {
      kind: "person";
      key: string;
      cardClass: "person-card";
      title: string;
      cols: 1 | 2;
      fields: Field[];
      file?: RowFile;
    }
  | { kind: "link"; label: string }
  | { kind: "when"; cond: Cond; blocks: Block[]; mt?: number };

/** How the req-card caption under a requirement is produced (design `progressText`). */
export type Caption =
  | { kind: "peopleML" }
  | { kind: "peopleNDT" }
  | { kind: "count"; key: string; noun: string }
  | { kind: "offices" }
  | { kind: "channels" }
  | { kind: "files" };

export type FormSchema = {
  blocks: Block[];
  /** label of the in-body Save button; omitted for upload-only drawers (the upload itself saves) */
  save_label?: string;
  caption?: Caption;
};

const REQ_UPLOAD_NOTE = "Use the current document that will support this application.";

const t = (key: string, label: string): Field => ({ key, label });
const ta = (key: string, label: string): Field => ({ key, label, type: "textarea" });
const d = (key: string, label: string, required = true): Field => ({ key, label, type: "date", required });

const singleUpload = (slot: string, label: string): FormSchema => ({
  blocks: [{ kind: "upload", slot, label, required: true }, { kind: "note", text: REQ_UPLOAD_NOTE }],
  caption: { kind: "files" },
});

export const DL_FORM_SCHEMAS: Record<string, FormSchema> = {
  "ML-A1": {
    blocks: [
      {
        kind: "fields",
        cols: 2,
        fields: [t("legalName", "Company legal name"), t("regNo", "Registration number"), t("tin", "Company TIN")],
      },
      { kind: "upload", slot: "incorp", label: "Certificate of Incorporation", required: true },
      { kind: "upload", slot: "constitution", label: "Memorandum & Articles / incorporation documents", required: true },
      { kind: "upload", slot: "tin", label: "TIN registration certificate", required: true },
    ],
    save_label: "Save details",
    caption: { kind: "files" },
  },
  "ML-A3": {
    blocks: [
      {
        kind: "fields",
        cols: 1,
        fields: [
          t("physical", "Registered physical address"),
          t("postal", "Postal address"),
          t("area", "Proposed area of operation"),
        ],
      },
      {
        kind: "fields",
        cols: 2,
        fields: [t("officePhone", "Principal-office phone"), t("officeEmail", "Principal-office email")],
      },
    ],
    save_label: "Save details",
    caption: { kind: "files" },
  },
  "NDT-A1": {
    blocks: [
      {
        kind: "choice",
        key: "legalForm",
        label: "Applicant legal form",
        required: true,
        options: [
          { value: "company", label: "Company" },
          { value: "ngo", label: "Non-governmental organisation" },
        ],
      },
      { kind: "fields", cols: 2, fields: [t("legalName", "Legal name"), t("regNo", "Registration number")] },
      {
        kind: "upload",
        slot: "registration",
        label: "Certificate of Incorporation",
        labelIf: { key: "legalForm", map: { ngo: "NGO registration certificate" } },
        required: true,
      },
      {
        kind: "upload",
        slot: "constitution",
        label: "Memorandum & Articles / incorporation documents",
        labelIf: { key: "legalForm", map: { ngo: "Constitution / incorporation documents" } },
        required: true,
      },
    ],
    save_label: "Save details",
    caption: { kind: "files" },
  },
  "NDT-A2": {
    blocks: [
      { kind: "fields", cols: 1, fields: [ta("description", "Describe the management and administrative structure")] },
      { kind: "upload", slot: "structure", label: "Organisation chart / management structure", required: true },
    ],
    save_label: "Save details",
    caption: { kind: "files" },
  },
  "NDT-A3": {
    blocks: [
      {
        kind: "fields",
        cols: 2,
        fields: [
          t("headPhysical", "Head-office physical address"),
          t("headPostal", "Postal address"),
          t("email", "Email"),
          t("phone", "Telephone"),
        ],
      },
      { kind: "check", key: "noExisting", label: "The applicant has no existing place of business yet.", saveOnToggle: true },
      {
        kind: "when",
        cond: { key: "noExisting", ne: true },
        blocks: [
          {
            kind: "repeater",
            key: "places",
            cardClass: "place-card",
            itemLabel: "Place of business",
            addLabel: "+ Add place of business",
            cols: 2,
            min: 1,
            fields: [
              t("name", "Name / branch"),
              t("address", "Address"),
              t("year", "Year established"),
              t("years", "Years in operation"),
            ],
          },
        ],
      },
    ],
    save_label: "Save details",
    caption: { kind: "offices" },
  },
  "NDT-A6": {
    blocks: [
      {
        kind: "section",
        title: "Capital information",
        blocks: [
          {
            kind: "fields",
            cols: 2,
            fields: [
              t("core", "Core capital"),
              t("permanent", "Permanent / non-withdrawable capital"),
              t("redeemable", "Redeemable capital"),
              t("institutional", "Institutional capital"),
            ],
          },
        ],
      },
      {
        kind: "section",
        title: "Banker",
        blocks: [
          {
            kind: "choice",
            key: "hasBanker",
            required: true,
            options: [
              { value: "yes", label: "Has banker" },
              { value: "no", label: "No banker" },
            ],
          },
          {
            kind: "when",
            cond: { key: "hasBanker", eq: "yes" },
            mt: 12,
            blocks: [{ kind: "fields", cols: 2, fields: [t("bankerName", "Banker name"), t("bankerAddress", "Banker address")] }],
          },
        ],
      },
      {
        kind: "section",
        title: "Auditor",
        blocks: [{ kind: "fields", cols: 2, fields: [t("auditorName", "Auditor name"), d("auditorDate", "Appointment date")] }],
      },
    ],
    save_label: "Save details",
  },
  "ML-A2": {
    blocks: [
      {
        kind: "repeater",
        key: "directors",
        cardClass: "person-card",
        itemLabel: "Director",
        addLabel: "+ Add director",
        cols: 2,
        min: 1,
        fields: [t("name", "Full name"), t("phone", "Phone"), t("email", "Email"), t("address", "Physical address")],
        file: {
          slotPrefix: "id-",
          label: "Identity document",
          hint: "Add the ID/passport evidence used for the application.",
          required: true,
        },
      },
      {
        kind: "section",
        title: "Company secretary",
        mt: 22,
        blocks: [
          {
            kind: "person",
            key: "secretary",
            cardClass: "person-card",
            title: "Company secretary",
            cols: 2,
            fields: [t("name", "Full name"), t("phone", "Phone"), t("email", "Email"), t("address", "Physical address")],
            file: {
              slotPrefix: "id-",
              label: "Identity document",
              hint: "Add the ID/passport evidence used for the application.",
              required: true,
            },
          },
        ],
      },
      { kind: "check", key: "allAdded", label: "I have added all current directors.", required: true },
      {
        kind: "check",
        key: "declarationsDone",
        label: "I have completed the Form 1 fit/propriety declarations for the relevant people.",
        required: true,
      },
      { kind: "upload", slot: "goodconduct", label: "Certificate of good conduct", required: true },
    ],
    save_label: "Save people",
    caption: { kind: "peopleML" },
  },
  "NDT-A4": {
    blocks: [
      {
        kind: "section",
        title: "Board members",
        blocks: [
          {
            kind: "repeater",
            key: "board",
            cardClass: "person-card",
            itemLabel: "Board member",
            addLabel: "+ Add board member",
            cols: 2,
            min: 1,
            fields: [
              t("name", "Full name"),
              t("designation", "Designation"),
              t("address", "Address"),
              { key: "otherDirectorships", label: "Other directorships", required: false },
              d("appointmentDate", "Appointment date"),
            ],
          },
        ],
      },
      {
        kind: "section",
        title: "Senior management",
        blocks: [
          {
            kind: "repeater",
            key: "management",
            cardClass: "person-card",
            itemLabel: "Senior manager",
            addLabel: "+ Add senior manager",
            cols: 2,
            min: 1,
            fields: [
              t("name", "Full name"),
              t("designation", "Designation"),
              t("nationality", "Nationality"),
              t("age", "Age"),
              t("qualifications", "Qualifications"),
              t("previousEmployment", "Previous employment"),
              d("appointmentDate", "Appointment date"),
            ],
          },
        ],
      },
      { kind: "check", key: "allAdded", label: "I have added all current board members and senior management.", required: true },
    ],
    save_label: "Save people",
    caption: { kind: "peopleNDT" },
  },
  "NDT-A5": {
    blocks: [
      ...(
        [
          ["receivership", "Has the institution been under receivership, compromised with creditors or failed to satisfy creditors in full?"],
          ["investigation", "Has the institution been the subject of an investigation in any country?"],
          ["litigation", "Is there current or expected litigation that may materially affect the institution’s resources?"],
          ["related", "Does the institution have business relationships with officers or significant shareholders that should be disclosed?"],
        ] as [string, string][]
      ).map(
        ([k, q]): Block => ({
          kind: "section",
          title: q,
          blocks: [
            {
              kind: "choice",
              key: `answers.${k}.value`,
              required: true,
              options: [
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ],
            },
            {
              kind: "when",
              cond: { key: `answers.${k}.value`, eq: "yes" },
              mt: 10,
              blocks: [{ kind: "fields", cols: 1, fields: [{ ...ta(`answers.${k}.explanation`, "Provide details") }] }],
            },
          ],
        })
      ),
    ],
    save_label: "Save declarations",
  },
  "DL-A2": {
    blocks: [
      {
        kind: "repeater",
        key: "products",
        cardClass: "product-card",
        itemLabel: "Loan product",
        addLabel: "+ Add loan product",
        cols: 2,
        min: 1,
        fields: [t("name", "Product name"), t("rate", "Interest rate"), t("tenure", "Tenure"), t("fees", "Fees / charges")],
      },
      {
        kind: "section",
        title: "Product documents",
        mt: 22,
        blocks: [
          { kind: "upload", slot: "terms", label: "Customer terms & conditions", required: true },
          { kind: "upload", slot: "pricing", label: "Pricing model & parameters", required: true },
          {
            kind: "when",
            cond: { route: "ml" },
            blocks: [
              {
                kind: "upload",
                slot: "declaration",
                label: "Loan Products & Interest Rates Declaration",
                required: true,
              },
            ],
          },
        ],
      },
    ],
    save_label: "Save products",
    caption: { kind: "count", key: "products", noun: "product" },
  },
  "DL-A3": {
    blocks: [
      {
        kind: "repeater",
        key: "sources",
        cardClass: "fund-card",
        itemLabel: "Funding source",
        addLabel: "+ Add funding source",
        cols: 1,
        min: 1,
        fields: [t("name", "Source / funder"), ta("description", "Description")],
        file: {
          slotPrefix: "evidence-",
          label: "Supporting evidence",
          hint: "Add evidence supporting this source.",
          required: true,
        },
      },
    ],
    save_label: "Save funding",
    caption: { kind: "count", key: "sources", noun: "funding source" },
  },
  "DL-A4": {
    blocks: [
      { kind: "upload", slot: "agreement", label: "Template lending agreement", required: true },
      {
        kind: "section",
        title: "Agreement content check",
        blocks: [
          {
            kind: "checks",
            required: true,
            items: [
              { key: "pricing", label: "Interest, fees and charges" },
              { key: "total", label: "Total cost of credit" },
              { key: "repayment", label: "Repayment schedule and due dates" },
              { key: "cooling", label: "Cooling-off provision" },
              { key: "security", label: "Security / recovery / guarantor terms where applicable" },
              { key: "early", label: "Early-repayment rights" },
            ],
          },
        ],
      },
    ],
    save_label: "Save check",
    caption: { kind: "files" },
  },
  "DL-A5": {
    blocks: [
      {
        kind: "fields",
        cols: 1,
        fields: [ta("systemDescription", "Describe the ICT system used to deliver and manage digital credit")],
      },
      {
        kind: "section",
        title: "Delivery channels",
        blocks: [
          {
            kind: "checkArray",
            key: "channels",
            min: 1,
            options: ["App", "Web", "USSD", "Mobile money", "Embedded / partner channel", "Other"],
          },
        ],
      },
      {
        kind: "section",
        title: "Third-party channel provider",
        blocks: [
          {
            kind: "text",
            text: "Does a telecom company or another service provider supply or operate any of these channels or platforms?",
          },
          {
            kind: "choice",
            key: "provider",
            required: true,
            mt: 10,
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          {
            kind: "when",
            cond: { key: "provider", eq: "yes" },
            mt: 12,
            blocks: [
              { kind: "fields", cols: 1, fields: [t("providerName", "Provider name")] },
              { kind: "upload", slot: "providerAgreement", label: "Provider agreement", required: true },
            ],
          },
        ],
      },
      {
        kind: "section",
        title: "App / trading name",
        blocks: [
          {
            kind: "text",
            text: "Will any loan app or trading name differ from the applicant's registered legal name?",
          },
          {
            kind: "choice",
            key: "differentName",
            required: true,
            mt: 10,
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
          },
          {
            kind: "when",
            cond: { key: "differentName", eq: "yes" },
            mt: 12,
            blocks: [{ kind: "fields", cols: 1, fields: [t("tradingName", "Trading / app name")] }],
          },
        ],
      },
    ],
    save_label: "Save technology details",
    caption: { kind: "channels" },
  },
  "DL-A7": singleUpload("aml", "AML/CFT framework"),
  "DL-A8": {
    blocks: [
      { kind: "upload", slot: "policy", label: "Data protection / privacy policy & procedures", required: true },
      { kind: "upload", slot: "certificate", label: "PDPO Certificate of Registration", required: true },
    ],
    caption: { kind: "files" },
  },
  "DL-A9": singleUpload("credit", "Credit policy"),
  "DL-A10": {
    blocks: [
      {
        kind: "multiupload",
        label: "Add governance / conduct document(s)",
        slotPrefix: "doc_",
        fileLabel: "Governance / conduct document",
        required: true,
      },
      {
        kind: "section",
        title: "Coverage",
        blocks: [
          {
            kind: "checks",
            required: true,
            items: [
              { key: "governance", label: "Corporate governance" },
              { key: "ethics", label: "Code of ethics" },
              { key: "conduct", label: "Market conduct" },
            ],
          },
        ],
      },
    ],
    save_label: "Save coverage",
    caption: { kind: "files" },
  },
  "ML-S1": singleUpload("fee", "Application fee"),
  "NDT-S1": singleUpload("fee", "Application fee"),
  "ML-S2": {
    blocks: [
      {
        kind: "section",
        title: "Official form",
        blocks: [
          {
            kind: "text",
            text: "Open the official Money Lender Form 1, complete and sign it, then add the final signed copy below.",
          },
          { kind: "link", label: "Open official Form 1 ↗" },
        ],
      },
      { kind: "upload", slot: "signed", label: "Signed Form 1", required: true },
    ],
    caption: { kind: "files" },
  },
  "NDT-S2": {
    blocks: [
      {
        kind: "section",
        title: "Official form",
        blocks: [
          {
            kind: "text",
            text: "Open Form 1A, complete it and the Chairperson/CEO declaration, sign it, then add the final copy below.",
          },
          { kind: "link", label: "Open official Form 1A ↗" },
        ],
      },
      { kind: "check", key: "declarationComplete", label: "Chairperson/CEO declaration completed.", required: true },
      { kind: "upload", slot: "signed", label: "Signed Form 1A", required: true },
    ],
    save_label: "Save declaration status",
    caption: { kind: "files" },
  },
};

/** Used only for a requirement an admin adds later that has no schema yet. */
export const GENERIC_FORM_SCHEMA: FormSchema = {
  blocks: [
    { kind: "fields", cols: 1, fields: [ta("description", "Description")] },
    {
      kind: "multiupload",
      label: "Add supporting document(s)",
      slotPrefix: "doc_",
      fileLabel: "Supporting document",
      required: true,
    },
  ],
  save_label: "Save details",
  caption: { kind: "files" },
};

// Fallback route-card copy (the design's). The database's
// licence_application_wizard_classes.route_tag / card_title / card_blurb win when present.
export const DL_ROUTE_FALLBACK: Record<string, { tag: string; title: string; blurb: string; badge: string }> = {
  ml: {
    tag: "Company",
    title: "Money Lender",
    blurb: "For a company applying for a Money Lender licence.",
    badge: "Money Lender",
  },
  ndt: {
    tag: "Company or NGO",
    title: "Non-Deposit-Taking Microfinance Institution",
    blurb: "For a company or NGO applying for an NDTMFI licence.",
    badge: "NDTMFI",
  },
};

export function isFormSchema(v: unknown): v is FormSchema {
  return !!v && typeof v === "object" && Array.isArray((v as { blocks?: unknown }).blocks);
}
