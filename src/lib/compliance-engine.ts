// Shared, framework-agnostic logic for the two member compliance
// assistants (Payments and Digital Lending). Pure functions and types only
// -- no "use client" hooks -- so this can be imported from both the
// interactive wizard (dashboard/compliance-pathway) and the server-rendered
// Overview dashboard summary, without duplicating the applicability rules
// in two places and letting them drift.
import type { MemberComplianceProfile, Obligation } from "./types";

export const DIGITAL_LENDING_CATALOG_KEY = "digital_lending_compliance_assistant";
export const PAYMENTS_CATALOG_KEY = "payments_compliance_assistant";

export const DAY_MS = 86400000;

export type ProfileFields = {
  // Payments Compliance Assistant (payments_compliance_assistant)
  // primary_category is kept for backward-compatible display/storage only;
  // is_pso/is_psp/is_instrument are the independent flags that applicability
  // logic uses, so a member can hold combined licences (e.g. PSO + PSP).
  primary_category: string;
  is_pso: string;
  is_psp: string;
  is_instrument: string;
  pso_class: string;
  pso_band: string;
  emi: string;
  emi_band: string;
  cards: string;
  agent: string;
  sfi: string;
  participant: string;
  // Digital Lending Compliance Assistant (digital_lending_compliance_assistant)
  money_lender: string;
  ndt_mfi: string;
  personal_data: string;
  collateral: string;
  recovery_agents: string;
  fitspa_subscriber: string;
  // Beacon Phase 2 additions (Digital Lending Compliance audit, plan §9.3).
  route: string;
  issue_date: string;
  fye_date: string;
  pdpo_status: string;
  pdpo_expiry: string;
  custody: string;
  crossborder: string;
  advice: string;
};

export function emptyProfile(): ProfileFields {
  return {
    primary_category: "",
    is_pso: "",
    is_psp: "",
    is_instrument: "",
    pso_class: "",
    pso_band: "",
    emi: "",
    emi_band: "",
    cards: "",
    agent: "",
    sfi: "",
    participant: "",
    money_lender: "",
    ndt_mfi: "",
    personal_data: "",
    collateral: "",
    recovery_agents: "",
    fitspa_subscriber: "",
    route: "",
    issue_date: "",
    fye_date: "",
    pdpo_status: "",
    pdpo_expiry: "",
    custody: "",
    crossborder: "",
    advice: "",
  };
}

export function profileFromRow(row: MemberComplianceProfile | null): ProfileFields {
  if (!row) return emptyProfile();
  return {
    primary_category: row.primary_category ?? "",
    // Fall back to deriving from primary_category for rows saved before the
    // is_pso/is_psp/is_instrument columns existed (defensive; the migration
    // backfills these, but a stale client cache could still hand us nulls).
    is_pso: row.is_pso ?? (row.primary_category === "PSO" ? "Yes" : "No"),
    is_psp: row.is_psp ?? (row.primary_category === "PSP" ? "Yes" : "No"),
    is_instrument: row.is_instrument ?? (row.primary_category === "Instrument" ? "Yes" : "No"),
    pso_class: row.pso_class ?? "",
    pso_band: row.pso_band ?? "",
    emi: row.emi ?? "",
    emi_band: row.emi_band ?? "",
    cards: row.cards ?? "",
    agent: row.agent ?? "",
    sfi: row.sfi ?? "",
    participant: row.participant ?? "",
    money_lender: row.money_lender ?? "",
    ndt_mfi: row.ndt_mfi ?? "",
    personal_data: row.personal_data ?? "",
    collateral: row.collateral ?? "",
    recovery_agents: row.recovery_agents ?? "",
    fitspa_subscriber: row.fitspa_subscriber ?? "",
    route: row.route ?? "",
    issue_date: row.issue_date ?? "",
    fye_date: row.fye_date ?? "",
    pdpo_status: row.pdpo_status ?? "",
    pdpo_expiry: row.pdpo_expiry ?? "",
    custody: row.custody ?? "",
    crossborder: row.crossborder ?? "",
    advice: row.advice ?? "",
  };
}

export function appliesTo(category: string, profile: ProfileFields, catalogKey: string): boolean {
  const cat = (category || "").toUpperCase();
  if (cat === "ALL") return true;
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    switch (cat) {
      case "MONEY":
        return profile.money_lender === "Yes";
      case "NDT":
        return profile.ndt_mfi === "Yes";
      case "DATA":
        return profile.personal_data === "Yes";
      case "COLLATERAL":
        return profile.collateral === "Yes";
      case "RECOVERY":
        return profile.recovery_agents === "Yes";
      case "FITSPA":
        return profile.fitspa_subscriber === "Yes";
      case "CUSTODY":
        return profile.custody === "Yes";
      case "CROSSBORDER":
        return profile.crossborder === "Yes";
      case "ADVICE":
        return profile.advice === "Yes";
      default:
        return false;
    }
  }
  switch (cat) {
    case "PSO":
      return profile.is_pso === "Yes";
    case "PSP":
      return profile.is_psp === "Yes";
    case "INSTRUMENT":
      return profile.is_instrument === "Yes";
    case "EMI":
      return profile.emi === "Yes";
    case "AGENTS":
      return profile.agent === "Yes";
    case "STORED CARDS":
      return profile.cards === "Yes";
    case "PARTICIPANT":
      return profile.participant === "Yes";
    case "SFI":
      return profile.sfi === "Yes";
    default:
      return false;
  }
}

export function obligationApplies(o: Obligation, profile: ProfileFields, catalogKey: string): boolean {
  if (o.applies_all) return true;
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    if (o.applies_money_lender && profile.money_lender === "Yes") return true;
    if (o.applies_ndt_mfi && profile.ndt_mfi === "Yes") return true;
    if (o.applies_personal_data && profile.personal_data === "Yes") return true;
    if (o.applies_collateral && profile.collateral === "Yes") return true;
    if (o.applies_recovery_agents && profile.recovery_agents === "Yes") return true;
    if (o.applies_fitspa_subscriber && profile.fitspa_subscriber === "Yes") return true;
    if (o.applies_custody && profile.custody === "Yes") return true;
    if (o.applies_crossborder && profile.crossborder === "Yes") return true;
    if (o.applies_advice && profile.advice === "Yes") return true;
    return false;
  }
  // Beacon Phase 2: independent flags so combined licences (e.g. PSO + PSP)
  // both fire, instead of the old single primary_category equality check
  // which could only ever match one category at a time.
  if (o.applies_pso && profile.is_pso === "Yes") return true;
  if (o.applies_psp && profile.is_psp === "Yes") return true;
  if (o.applies_emi && profile.emi === "Yes") return true;
  if (o.applies_instrument && profile.is_instrument === "Yes") return true;
  if (o.applies_agent && profile.agent === "Yes") return true;
  if (o.applies_cards && profile.cards === "Yes") return true;
  if (o.applies_sfi && profile.sfi === "Yes") return true;
  if (o.applies_participant && profile.participant === "Yes") return true;
  return false;
}

const PSO_CLASS_LABEL: Record<string, string> = {
  funds_transfer: "Funds transfer",
  clearing: "Clearing/switch",
  settlement: "Settlement",
  third_party: "Third-party system",
};

export function profileSummaryText(p: ProfileFields, catalogKey: string): string {
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    const dlParts: string[] = [];
    if (p.money_lender === "Yes") dlParts.push("Money lender");
    if (p.ndt_mfi === "Yes") dlParts.push("NDT/MFI");
    if (p.personal_data === "Yes") dlParts.push("Handles personal data");
    if (p.collateral === "Yes") dlParts.push("Takes collateral");
    if (p.recovery_agents === "Yes") dlParts.push("Uses recovery agents");
    if (p.fitspa_subscriber === "Yes") dlParts.push("FITSPA subscriber");
    return dlParts.join("  ·  ") || "No profile set";
  }
  const parts: string[] = [];
  // Beacon Phase 2: a member can hold combined licences, so all three flags
  // are checked independently rather than a single primary_category branch.
  if (p.is_pso === "Yes") parts.push("PSO" + (p.pso_class ? " · " + (PSO_CLASS_LABEL[p.pso_class] || p.pso_class) : ""));
  if (p.is_psp === "Yes") parts.push("PSP" + (p.emi === "Yes" ? " · EMI" : ""));
  if (p.is_instrument === "Yes") parts.push("Instrument issuer");
  if (p.cards === "Yes") parts.push("Cards");
  if (p.agent === "Yes") parts.push("Agents");
  if (p.sfi === "Yes") parts.push("FI/MDI overlay");
  if (p.participant === "Yes") parts.push("Participant");
  return parts.join("  ·  ") || "No profile set";
}

export function validateProfile(p: ProfileFields, catalogKey: string): boolean {
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    return (
      !!p.money_lender &&
      !!p.ndt_mfi &&
      !!p.personal_data &&
      !!p.collateral &&
      !!p.recovery_agents &&
      !!p.fitspa_subscriber
    );
  }
  // Beacon Phase 2: at least one of PSO/PSP/Instrument must be answered Yes —
  // combined licences are allowed, but the member must hold at least one.
  const anyCategory = p.is_pso === "Yes" || p.is_psp === "Yes" || p.is_instrument === "Yes";
  let ok =
    !!p.is_pso &&
    !!p.is_psp &&
    !!p.is_instrument &&
    anyCategory &&
    !!p.emi &&
    !!p.cards &&
    !!p.agent &&
    !!p.sfi &&
    !!p.participant;
  if (p.is_pso === "Yes" && !p.pso_class) ok = false;
  if (p.pso_class === "funds_transfer" && !p.pso_band) ok = false;
  if (p.emi === "Yes" && !p.emi_band) ok = false;
  return ok;
}

const COVERAGE_WARNINGS: Record<string, string> = {
  [PAYMENTS_CATALOG_KEY]:
    "This is a payments compliance map, not a SACCO or digital-credit sheet. It excludes a complete AML/CFT, tax, company-law and data-protection calendar, since the payments source set does not contain the full current primary instruments and regulator instructions for those regimes.\n\nLicence-specific conditions, BoU letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them.",
  [DIGITAL_LENDING_CATALOG_KEY]:
    "This is a digital lending compliance map, not a payments or SACCO sheet. It excludes a complete AML/CFT, tax, company-law and consumer-protection calendar beyond the Tier 4 Microfinance Institutions and Money Lenders Act framework, since the digital-lending source set does not contain the full current primary instruments and regulator instructions for those regimes.\n\nLicence-specific conditions, UMRA letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them.",
};

export function coverageWarning(catalogKey: string): string {
  return (
    COVERAGE_WARNINGS[catalogKey] ??
    "This calendar reflects only the regulatory source material seeded for this catalog. Licence-specific conditions, regulator letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them."
  );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
export function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}
export function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateShort(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
export function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
export function localDateTimeInputValue(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function indexById<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, T> {
  const out: Record<string, T> = {};
  rows.forEach((r) => {
    out[String(r[key])] = r;
  });
  return out;
}

export function intervalDaysForCadence(cadence: string | null): number | null {
  const c = (cadence || "").toLowerCase();
  if (c.indexOf("daily") !== -1) return 1;
  if (c.indexOf("weekly") !== -1) return 7;
  if (c.indexOf("monthly") !== -1) return 30;
  return null;
}
