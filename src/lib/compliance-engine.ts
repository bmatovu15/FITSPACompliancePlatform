// Shared, framework-agnostic logic for the two member compliance
// assistants (Payments and Digital Lending). Pure functions and types only
// -- no "use client" hooks -- so this can be imported from both the
// interactive wizard (dashboard/compliance-pathway) and the server-rendered
// Overview dashboard summary, without duplicating the applicability rules
// in two places and letting them drift.
import type { MemberComplianceProfile, Obligation } from "./types";

export const DIGITAL_LENDING_CATALOG_KEY = "digital_lending_compliance_assistant";
export const PAYMENTS_CATALOG_KEY = "payments_compliance_assistant";
export const INSURANCE_CATALOG_KEY = "insurance_compliance_assistant";

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
  // FITSPA Compliance Platform Phase 2 additions (Digital Lending Compliance audit, plan §9.3).
  route: string;
  issue_date: string;
  fye_date: string;
  pdpo_status: string;
  pdpo_expiry: string;
  custody: string;
  crossborder: string;
  advice: string;
  // Insurance Compliance Assistant (insurance_compliance_assistant).
  // `route` is reused for the insurer/broker/agent/hmo licence route (the
  // same generic column Digital Lending already uses for its own route
  // question), so only the life-vs-non-life dimension needs a new field.
  business_line: string;
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
    business_line: "",
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
    business_line: row.business_line ?? "",
  };
}

export function appliesTo(category: string, profile: ProfileFields, catalogKey: string): boolean {
  const cat = (category || "").toUpperCase();
  if (cat === "ALL") return true;
  if (catalogKey === INSURANCE_CATALOG_KEY) {
    switch (cat) {
      case "INSURER":
        return profile.route === "insurer";
      case "BROKER":
        return profile.route === "broker";
      case "AGENT":
        return profile.route === "agent";
      case "HMO":
        return profile.route === "hmo";
      case "LIFE":
        return profile.business_line === "life" || profile.business_line === "both";
      case "NONLIFE":
        return profile.business_line === "non_life" || profile.business_line === "both";
      default:
        return false;
    }
  }
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
  if (catalogKey === INSURANCE_CATALOG_KEY) {
    const route = profile.route;
    const line = profile.business_line;
    if (o.applies_insurer && route === "insurer") {
      // Insurer-route obligations that are additionally scoped to a
      // business line (life/non-life) only fire once that line is set and
      // matches; obligations with neither applies_life nor applies_nonlife
      // set apply to every insurer regardless of business line.
      if (!o.applies_life && !o.applies_nonlife) return true;
      if (o.applies_life && (line === "life" || line === "both")) return true;
      if (o.applies_nonlife && (line === "non_life" || line === "both")) return true;
      return false;
    }
    if (o.applies_broker && route === "broker") return true;
    if (o.applies_agent && route === "agent") return true;
    if (o.applies_hmo && route === "hmo") return true;
    return false;
  }
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
  // FITSPA Compliance Platform Phase 2: independent flags so combined licences (e.g. PSO + PSP)
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

export const INSURANCE_ROUTE_LABEL: Record<string, string> = {
  insurer: "Insurer/Reinsurer",
  broker: "Insurance/Reinsurance Broker",
  agent: "Insurance Agent",
  hmo: "Health Membership Organisation",
};

export const INSURANCE_BUSINESS_LINE_LABEL: Record<string, string> = {
  life: "Life business",
  non_life: "Non-life business",
  both: "Life & Non-life business",
};

export function profileSummaryText(p: ProfileFields, catalogKey: string): string {
  if (catalogKey === INSURANCE_CATALOG_KEY) {
    const insParts: string[] = [];
    if (p.route) insParts.push(INSURANCE_ROUTE_LABEL[p.route] || p.route);
    if (p.business_line) insParts.push(INSURANCE_BUSINESS_LINE_LABEL[p.business_line] || p.business_line);
    return insParts.join("  ·  ") || "No profile set";
  }
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
  // FITSPA Compliance Platform Phase 2: a member can hold combined licences, so all three flags
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

export type ProfileIssue = { step: 1 | 2; message: string };

/**
 * Everything still missing from a profile, in plain language, for the setup
 * wizards to show instead of leaving a button silently disabled. `step` says
 * which wizard step the missing answer lives on (Payments only has two).
 * validateProfile() below is simply "no issues".
 */
export function profileIssues(p: ProfileFields, catalogKey: string): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const need = (ok: boolean, step: 1 | 2, message: string) => {
    if (!ok) issues.push({ step, message });
  };
  if (catalogKey === INSURANCE_CATALOG_KEY) {
    need(!!p.route, 1, "Choose your insurance route");
    // Life-vs-non-life only matters (and is only asked) for the Insurer and
    // Broker routes -- Agent and HMO are single-track in the source
    // guidelines, so no business_line answer is required for them.
    need(!((p.route === "insurer" || p.route === "broker") && !p.business_line), 1, "Choose life or non-life business");
    return issues;
  }
  if (catalogKey === DIGITAL_LENDING_CATALOG_KEY) {
    need(!!p.money_lender, 1, "Answer: money lender");
    need(!!p.ndt_mfi, 1, "Answer: non-deposit-taking MFI");
    need(!!p.personal_data, 1, "Answer: personal data");
    need(!!p.collateral, 1, "Answer: collateral");
    need(!!p.recovery_agents, 1, "Answer: recovery agents");
    need(!!p.fitspa_subscriber, 1, "Answer: FITSPA subscriber");
    return issues;
  }
  // FITSPA Compliance Platform Phase 2: at least one of PSO/PSP/Instrument must be answered Yes —
  // combined licences are allowed, but the member must hold at least one.
  need(!!p.is_pso, 1, "Answer “Payment system operator (PSO)?”");
  need(!!p.is_psp, 1, "Answer “Payment service provider (PSP)?”");
  need(!!p.is_instrument, 1, "Answer “Issuer of a payment instrument?”");
  if (p.is_pso && p.is_psp && p.is_instrument) {
    need(
      p.is_pso === "Yes" || p.is_psp === "Yes" || p.is_instrument === "Yes",
      1,
      "Answer Yes to at least one of PSO, PSP or payment-instrument issuer — you must hold at least one licence type"
    );
  }
  need(!(p.is_pso === "Yes" && !p.pso_class), 1, "Choose your PSO class");
  need(!(p.pso_class === "funds_transfer" && !p.pso_band), 1, "Choose your funds-transfer volume band");
  need(!!p.emi, 1, "Answer “Electronic-money issuer (EMI)?”");
  need(!(p.emi === "Yes" && !p.emi_band), 1, "Choose your EMI trust-account value band");
  need(!!p.sfi, 2, "Answer “Also a financial institution or microfinance deposit-taking institution?”");
  need(!!p.agent, 2, "Answer “Do you use agents to provide payment services?”");
  need(!!p.cards, 2, "Answer “Do you issue stored-value or prepaid cards?”");
  need(!!p.participant, 2, "Answer “Are you a participant in another payment system or settlement arrangement?”");
  return issues;
}

export function validateProfile(p: ProfileFields, catalogKey: string): boolean {
  return profileIssues(p, catalogKey).length === 0;
}

const COVERAGE_WARNINGS: Record<string, string> = {
  [PAYMENTS_CATALOG_KEY]:
    "This is a payments compliance map, not a SACCO or digital-credit sheet. It excludes a complete AML/CFT, tax, company-law and data-protection calendar, since the payments source set does not contain the full current primary instruments and regulator instructions for those regimes.\n\nLicence-specific conditions, BoU letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them.",
  [DIGITAL_LENDING_CATALOG_KEY]:
    "This is a digital lending compliance map, not a payments or SACCO sheet. It excludes a complete AML/CFT, tax, company-law and consumer-protection calendar beyond the Tier 4 Microfinance Institutions and Money Lenders Act framework, since the digital-lending source set does not contain the full current primary instruments and regulator instructions for those regimes.\n\nLicence-specific conditions, UMRA letters, circulars, return templates and remediation dates must be added as your business receives them — this calendar cannot pre-populate them.",
  [INSURANCE_CATALOG_KEY]:
    "This is an insurance compliance map built from the IRA's licensing guideline documents (Insurer/Reinsurer, Broker, Agent and HMO guidelines, plus the Mutual Insurance Company form) — it is not a comprehensive Insurance Act rulebook. It excludes a complete AML/CFT, tax, company-law, market-conduct and solvency-returns calendar, since the source guidelines are primarily about how to get licensed, not a full statement of every ongoing IRA reporting and prudential obligation.\n\nLicence-specific conditions, IRA circulars, return templates, gazetted deadlines and remediation dates must be added as your business receives them — this calendar cannot pre-populate them.",
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
