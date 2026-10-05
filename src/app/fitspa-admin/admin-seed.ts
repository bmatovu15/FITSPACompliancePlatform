// Sample data for the FITSPA Admin demonstration, built from the real published catalogues.
import paymentsCatalog from "@/data/payments-comply-catalog.json";
import dlObligations from "@/data/digital-lending/obligations.json";
import dlEvents from "@/data/digital-lending/events.json";
import dlControls from "@/data/digital-lending/control-areas.json";
import { CLASSES, FEES, INSURANCE_OBLIGATIONS, TEMPLATES } from "./admin-apply-seed";
import type {
  AdminState, ApplyClass, ControlDef, DocItem, EventDef, Member, Obligation, Programme, Question, Regulator, Requirement, Rule,
} from "./admin-types";

const yn = (key: string, label: string, help: string): Question => ({
  key, label, help, kind: "yesno", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
});
const ynm = (key: string, label: string, help: string): Question => ({
  key, label, help, kind: "yesnomaybe",
  options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not-sure", label: "Not sure" }],
});

const always: Rule = { mode: "always", conds: [] };
const all = (...c: [string, string][]): Rule => ({ mode: "all", conds: c.map(([q, is]) => ({ q, is })) });
const any = (...c: [string, string][]): Rule => ({ mode: "any", conds: c.map(([q, is]) => ({ q, is })) });

const PAY_PHASE_ORDER = ["company", "people", "business", "forms", "policies", "technology", "review"];
const DL_PHASE_ORDER = ["business", "people", "products", "policies", "technology", "finalise"];
const INS_PHASE_ORDER = ["company", "people", "business", "compliance", "technology", "forms", "review"];

const GUIDE: Record<string, string> = {
  C02: "Corporate records that establish legal existence, constitutional documents, current ownership and governance information, certified where required.",
  C05: "Resolution authorising the application and identifying the licence category or categories being applied for.",
  F02: "Prescribed application form for a Payment System Operator and/or Payment Service Provider, commissioned before upload.",
  F04: "A completed and commissioned Form B for every person included in the fit-and-proper vetting process.",
  B03: "Three-year business plan with supporting financial projections, capital implications and projected balance sheet.",
  B07: "Evidence that the applicant holds at least the minimum paid-up capital for the selected licence route.",
  T07: "Pre-application penetration test report with remediation evidence or status for material findings.",
  A01: "How the applicant prevents, identifies, monitors, escalates and reports money-laundering and terrorist-financing risk.",
};

function requirements(app: keyof typeof TEMPLATES, order: string[]): Requirement[] {
  return TEMPLATES[app].map(([id, phase, title, drawer, route]) => ({
    id, phase, title, drawer, route, mandatory: true,
    guidance: app === "payments_nps" ? GUIDE[id] ?? "" : "",
  })).sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase));
}

function classes(app: string): ApplyClass[] {
  return CLASSES.filter((c) => c[0] === app).map(([, key, label, minCapital]) => ({
    key, label, minCapital,
    fees: FEES.filter((f) => f[0] === app && f[1] === key).map(([, , type, amount]) => ({ type, amount })),
  }));
}

// ---------- Payments (Bank of Uganda · National Payment Systems) ----------
const PAY_ROWS = paymentsCatalog as unknown as Array<Record<string, string>>;

const PAYMENTS_RULES: Record<string, Rule> = {};
function payRule(label: string): Rule {
  const a = label;
  if (a === "All NPS licensees") return always;
  if (a.includes("Payment system operator; Payment service provider")) return any(["pso", "yes"], ["psp", "yes"]);
  if (a === "Payment system operator") return all(["pso", "yes"]);
  if (a === "Payment service provider") return all(["psp", "yes"]);
  if (a === "Electronic money issuer" || a.startsWith("Electronic money issuer;")) return all(["emi", "yes"]);
  if (a.startsWith("Trust-account EMI")) return all(["emi", "yes"], ["safeguard", "trust"]);
  if (a.startsWith("Only if the NPS licensee is also an FI/MDI")) return all(["fimdi", "yes"]);
  if (a === "Licensee using agents" || a === "Licensee with an approved agent programme") return all(["agents", "yes"]);
  if (a === "Stored-value/prepaid-card route") return all(["cards", "yes"]);
  if (a === "Payment-system participant" || a.startsWith("Payment-system participant /")) return all(["participant", "yes"]);
  if (a.startsWith("Any licensee proposing services in a different licence category")) return always;
  if (a.startsWith("Payment service provider proposing cross-border")) return all(["psp", "yes"]);
  return { mode: "never", conds: [] };
}

const PAY_CONTROL_RE = /Continuous|control|Transaction|Governance|Retention|Service-level|programme/i;

function paymentsObligations(): Obligation[] {
  return PAY_ROWS.map((r) => {
    PAYMENTS_RULES[r.applies] = payRule(r.applies);
    return {
      key: `P:${r.id}`, id: r.id, title: r.requirement, group: r.group, type: r.type, source: r.source,
      guidance: r.meaning ?? "", evidence: r.evidence ?? "", applies: r.applies, due: "", status: "active" as const,
      custom: false, edited: false,
    };
  });
}

function controlsByGroup(obs: Obligation[], re: RegExp): ControlDef[] {
  const g: Record<string, string[]> = {};
  for (const o of obs) if (re.test(o.type)) (g[o.group] ||= []).push(o.id);
  return Object.entries(g).map(([title, ids], i) => ({ id: `CTL-${i + 1}`, title, obligationIds: ids }));
}

function paymentsProgramme(): Programme {
  const obligations = paymentsObligations();
  const events: EventDef[] = [
    { id: "outage", title: "Outage, security incident or fraud issue", desc: "Something affected service safety, security or availability.", obligationIds: ["EMI-16", "CP-11"], needs: [] },
    { id: "director", title: "Director / manager / trustee / shareholder change", desc: "A key licence person or address is changing.", obligationIds: ["GEN-11"], needs: [] },
    { id: "outsourcing", title: "New outsourcing arrangement", desc: "Licensed service, core operation or technical personnel.", obligationIds: ["GEN-13"], needs: [] },
    { id: "branch", title: "Open a branch or create a subsidiary", desc: "In Uganda or outside Uganda.", obligationIds: ["GEN-14"], needs: [] },
    { id: "fee", title: "Increase a customer fee or charge", desc: "A fee change that will affect existing customers.", obligationIds: ["CP-09"], needs: [] },
    { id: "maintenance", title: "Planned service maintenance", desc: "Service channels will be temporarily unavailable.", obligationIds: ["CP-10"], needs: [] },
    { id: "records", title: "Destroy payment records", desc: "Records have reached the retention threshold.", obligationIds: ["GEN-24"], needs: [] },
    { id: "crossborder", title: "Offer cross-border payment services", desc: "A new cross-border service or payment system.", obligationIds: ["NEW-02"], needs: [{ q: "psp", is: "yes" }] },
    { id: "agents", title: "Launch or change an agent programme", desc: "New agent network or material programme change.", obligationIds: ["NEW-03", "AGT-01"], needs: [] },
    { id: "cessation", title: "Cease the licensed business", desc: "Planned closure of the regulated business.", obligationIds: ["GEN-08"], needs: [] },
    { id: "newcategory", title: "Offer services in a different licence category", desc: "A new regulated service outside the current category.", obligationIds: ["NEW-01"], needs: [] },
    { id: "insolvency", title: "Insolvency proceedings started", desc: "A payment-system participant has been served with an insolvency petition.", obligationIds: ["PSO-09"], needs: [{ q: "participant", is: "yes" }] },
  ];
  return {
    id: "payments", regulatorId: "bou", name: "Payments & electronic money (National Payment Systems)",
    blurb: "Licences and ongoing compliance for payment system operators, payment service providers and electronic money issuers.",
    status: "published", screens: "dedicated",
    phases: PAY_PHASE_ORDER, classes: classes("payments_nps"), requirements: requirements("payments_nps", PAY_PHASE_ORDER),
    questions: [
      yn("pso", "Operates a payment system (PSO)", "Licensed as a payment system operator."),
      yn("psp", "Provides payment services (PSP)", "Licensed as a payment service provider."),
      yn("emi", "Issues electronic money (EMI)", "A payment service provider licence in the electronic money issuer class."),
      yn("instrument", "Issues payment instruments", "Cards, electronic devices or paper instruments."),
      yn("agents", "Uses agents", "Operates, or has an approved, agent programme."),
      yn("cards", "Stored-value / prepaid cards", "Offers stored-value or prepaid-card products."),
      yn("participant", "Participates in a payment system", "Is a participant in a payment or settlement system."),
      yn("fimdi", "Also a financial institution / MDI", "Within scope of the 2024 cyber guidance."),
      { key: "safeguard", label: "How customer funds are safeguarded", help: "Trust account or special account (electronic money issuers).", kind: "single",
        options: [{ value: "trust", label: "Trust account" }, { value: "special", label: "Special account" }] },
    ],
    rules: PAYMENTS_RULES, obligations, events, controls: controlsByGroup(obligations, PAY_CONTROL_RE),
  };
}

// ---------- Digital lending (Microfinance Regulatory Department) ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DL_ROWS = dlObligations as Array<Record<string, any>>;

function dlRule(label: string): Rule {
  const base: [string, string][] = label.startsWith("NDTMFI") ? [["route", "ndt"]] : label.startsWith("Money Lender") ? [["route", "ml"]] : [];
  const extra: [string, string][] = [];
  if (label.includes("if collateral is used")) extra.push(["collateral", "yes"]);
  if (label.includes("if collateral is held in custody")) extra.push(["collateral", "yes"], ["custody", "yes"]);
  if (label.includes("third-party recovery")) extra.push(["recovery", "yes"]);
  if (label.includes("personal advice")) extra.push(["advice", "yes"]);
  if (label.includes("cross-border")) extra.push(["crossborder", "yes"]);
  if (label.includes("international wire")) extra.push(["wire", "yes"]);
  const conds = [...base, ...extra];
  return conds.length ? all(...conds) : always;
}

function dlProgramme(): Programme {
  const rules: Record<string, Rule> = {};
  const obligations: Obligation[] = DL_ROWS.map((r) => {
    const applies = String(r["Applies to"] ?? "Both");
    rules[applies] = dlRule(applies);
    return {
      key: `D:${r.ID}`, id: r.ID, title: r.Obligation, group: r.domainLabel ?? r.domain ?? "", type: r.Behaviour ?? "",
      source: r["Source / provision"] ?? "", guidance: r.guide?.what ?? "", evidence: r.guide?.keep ?? "", applies,
      due: "", status: "active" as const, custom: false, edited: false,
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: EventDef[] = (dlEvents as Array<Record<string, any>>).map((e) => {
    const needs: { q: string; is: string }[] = [];
    const routes: string[] = e.routes ?? [];
    if (routes.length === 1) needs.push({ q: "route", is: routes[0] });
    if (e.requires === "collateral") needs.push({ q: "collateral", is: "yes" });
    if (e.requires === "custody") needs.push({ q: "collateral", is: "yes" }, { q: "custody", is: "yes" });
    return { id: e.id, title: e.title, desc: e.desc, obligationIds: e.ids ?? [], needs };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls: ControlDef[] = (dlControls as Array<Record<string, any>>).map((c, i) => ({
    id: `CTL-${i + 1}`, title: c.title, obligationIds: c.idList ?? [],
  }));
  return {
    id: "digital_lending", regulatorId: "mrd", name: "Digital lending (Money Lenders & NDTMFIs)",
    blurb: "Licences and ongoing compliance for money lenders and non-deposit-taking microfinance institutions.",
    status: "published", screens: "dedicated",
    phases: DL_PHASE_ORDER, classes: classes("digital_lending"), requirements: requirements("digital_lending", DL_PHASE_ORDER),
    questions: [
      { key: "route", label: "Licence route", help: "Money lender or non-deposit-taking microfinance institution.", kind: "single",
        options: [{ value: "ml", label: "Money Lender" }, { value: "ndt", label: "NDTMFI" }] },
      ynm("collateral", "Uses collateral", "Takes collateral for loans."),
      ynm("custody", "Holds collateral in custody", "Only asked when collateral is used."),
      ynm("recovery", "Uses third-party recovery agents", "A recovery agent or service provider is used."),
      ynm("advice", "Gives personal advice", "Gives personal advice or recommendations to borrowers."),
      ynm("crossborder", "Cross-border processing or transfer", "Customer data or funds are processed or sent abroad."),
      yn("wire", "Has conducted an international wire transfer", "Switched on when the member logs a wire event."),
    ],
    rules, obligations, events, controls,
  };
}

// ---------- Insurance (Insurance Regulatory Authority) ----------
function insProgramme(): Programme {
  const rules: Record<string, Rule> = {};
  const label = (flags: string): string => {
    const key = flags || "agent";
    const map: Record<string, [string, Rule]> = {
      all: ["All licensees", always],
      insurer: ["Insurers and reinsurers", all(["kind", "insurer"])],
      broker: ["Brokers", all(["kind", "broker"])],
      hmo: ["Health Membership Organisations", all(["kind", "hmo"])],
      agent: ["Insurance agents", all(["kind", "agent"])],
      "broker,hmo": ["Brokers and HMOs", any(["kind", "broker"], ["kind", "hmo"])],
      "insurer,broker": ["Insurers and brokers", any(["kind", "insurer"], ["kind", "broker"])],
      "insurer,broker,hmo": ["Insurers, brokers and HMOs", any(["kind", "insurer"], ["kind", "broker"], ["kind", "hmo"])],
      "insurer,life": ["Insurers writing life business", all(["kind", "insurer"], ["life", "yes"])],
      "insurer,nonlife": ["Insurers writing non-life business", all(["kind", "insurer"], ["nonlife", "yes"])],
    };
    const m = map[key] ?? [key, { mode: "never", conds: [] } as Rule];
    rules[m[0]] = m[1];
    return m[0];
  };
  const obligations: Obligation[] = INSURANCE_OBLIGATIONS.map(([id, title, group, type, source, guidance, evidence, flags]) => ({
    key: `I:${id}`, id, title, group, type, source, guidance, evidence, applies: label(flags), due: "", status: "active" as const,
    custom: false, edited: false,
  }));
  return {
    id: "insurance", regulatorId: "ira", name: "Insurance (insurers, brokers, agents, HMOs)",
    blurb: "Licences and ongoing compliance for insurers, reinsurers, brokers, agents and health membership organisations.",
    status: "published", screens: "dedicated",
    phases: INS_PHASE_ORDER, classes: classes("insurance"), requirements: requirements("insurance", INS_PHASE_ORDER),
    questions: [
      { key: "kind", label: "Licence type", help: "The kind of insurance licensee.", kind: "single",
        options: [{ value: "insurer", label: "Insurer / reinsurer" }, { value: "broker", label: "Broker" }, { value: "hmo", label: "HMO" }, { value: "agent", label: "Agent" }] },
      yn("life", "Writes life business", "Only meaningful for insurers and reinsurers."),
      yn("nonlife", "Writes non-life business", "Only meaningful for insurers and reinsurers."),
    ],
    rules, obligations, events: [], controls: controlsByGroup(obligations, /control/i),
  };
}

// ---------- Regulators, documents, members ----------
const REGS: [string, string, string, string, string, string][] = [
  ["bou", "Bank of Uganda (BOU)", "BOU", "Payments & E-Money, Banking", "bou.or.ug", "BOU = Bank of Uganda; NPS = National Payment Systems; PSP = payment service provider; PSO = payment system operator; EMI = electronic money issuer"],
  ["mrd", "Microfinance Regulatory Department (MRD)", "MRD", "Digital Lending, Microfinance", "finance.go.ug", "UMRA = Uganda Microfinance Regulatory Authority; NDTMFI = non-deposit-taking microfinance institution"],
  ["pdpo", "National Personal Data Protection Office (PDPO)", "PDPO", "Data Protection", "pdpo.go.ug", "PDPO = Personal Data Protection Office"],
  ["ura", "Uganda Revenue Authority (URA)", "URA", "Taxation", "ura.go.ug", "URA = Uganda Revenue Authority; TIN = tax identification number"],
  ["ucc", "Uganda Communications Commission (UCC)", "UCC", "Telecommunications", "ucc.co.ug", "UCC = Uganda Communications Commission"],
  ["nita", "National IT Authority – Uganda (NITA-U)", "NITA-U", "Technology Certification", "nita.go.ug", "NITA-U = National Information Technology Authority – Uganda"],
  ["ursb", "Uganda Registration Services Bureau (URSB)", "URSB", "Corporate Registration", "ursb.go.ug", "URSB = Uganda Registration Services Bureau"],
  ["cma", "Capital Markets Authority (CMA)", "CMA", "Investment & Securities", "cmauganda.co.ug", "CMA = Capital Markets Authority"],
  ["ira", "Insurance Regulatory Authority (IRA)", "IRA", "Insurance", "ira.go.ug", "IRA = Insurance Regulatory Authority; HMO = health membership organisation"],
  ["fitspa", "FITSPA", "FITSPA", "Industry Standards", "", ""],
  ["fia", "Financial Intelligence Authority (FIA)", "FIA", "AML/CFT", "fia.go.ug", "FIA = Financial Intelligence Authority; AML = anti-money laundering; CFT = countering the financing of terrorism"],
];

function regulators(): Regulator[] {
  return REGS.map(([id, name, short, sector, website, acronyms]) => ({
    id, name, short, sector, website, acronyms, status: "active" as const, contact: "", notes: "",
  }));
}

const DOCS: [string, string, string, string][] = [
  ["bou", "payments", "BOU - Full Checklist - Min Capital - License Fees - Obligations.xlsx", "Checklist"],
  ["bou", "payments", "Form A - APPLICATION FOR A LICENCE OF PAYMENT SERVICE PROVIDER OR AN OPERATOR OF A PAYMENT SYSTEM.pdf", "Form"],
  ["bou", "payments", "Form B - FIT AND PROPER - PERSON FORM.pdf", "Form"],
  ["bou", "payments", "National Payments Systems Act, 2020.pdf", "Act"],
  ["bou", "payments", "The-National-Payment-Systems-Agents-Regulations-2021.pdf", "Regulation"],
  ["bou", "", "financial institutional Act 2004.pdf", "Act"],
  ["bou", "", "2011-14 - Insolvency Act.pdf", "Act"],
  ["mrd", "digital_lending", "UMRA - Lending-Conditions Act.pdf", "Act"],
  ["mrd", "digital_lending", "UMRA - Tier-4-Microfinance-Institutions-Money-Lenders-Act-2016-PUBLISHED.pdf", "Act"],
  ["mrd", "digital_lending", "UMRA_Digital_Lending_Full_Checklist.xlsx", "Checklist"],
  ["ira", "insurance", "Guidelines on Licensing of Insurers and Reinsurers", "Guideline"],
  ["ira", "insurance", "Guidelines for Licensing of Reinsurance Brokers", "Guideline"],
  ["ira", "insurance", "Guidelines for Licensing of Insurance Agents", "Guideline"],
  ["ira", "insurance", "Guide to Licensing of Health Membership Organisations (HMOs)", "Guideline"],
  ["ira", "insurance", "Application for Licensing as a Mutual Insurance Company", "Form"],
  ["ira", "insurance", "IRA Registration Form", "Form"],
];

function documents(): DocItem[] {
  return DOCS.map(([regulatorId, programmeId, title, kind], i) => ({
    id: `doc${i + 1}`, regulatorId, programmeId, title, kind, audience: "public" as const,
    fileName: title.includes(".") ? title : `${title}.pdf`, sizeKb: 0, status: "indexed" as const, inAssistant: true, text: "",
    addedAt: "Already published",
  }));
}

const members = (): Member[] => [
  { id: "m1", name: "Sample Pay Ltd", programmeId: "payments", facts: { pso: "no", psp: "yes", emi: "no", instrument: "no", agents: "yes", cards: "no", participant: "no", fimdi: "no", safeguard: "" }, done: 21, overdue: 2, lastActive: "Today" },
  { id: "m2", name: "Sample E-Money Ltd", programmeId: "payments", facts: { pso: "no", psp: "yes", emi: "yes", instrument: "no", agents: "no", cards: "yes", participant: "no", fimdi: "no", safeguard: "trust" }, done: 34, overdue: 0, lastActive: "Yesterday" },
  { id: "m3", name: "Sample Switch PSO", programmeId: "payments", facts: { pso: "yes", psp: "no", emi: "no", instrument: "no", agents: "no", cards: "no", participant: "yes", fimdi: "no", safeguard: "" }, done: 12, overdue: 1, lastActive: "3 days ago" },
  { id: "m4", name: "Sample Credit (Money Lender)", programmeId: "digital_lending", facts: { route: "ml", collateral: "yes", custody: "no", recovery: "yes", advice: "no", crossborder: "no", wire: "no" }, done: 40, overdue: 3, lastActive: "Today" },
  { id: "m5", name: "Sample Microfinance (NDTMFI)", programmeId: "digital_lending", facts: { route: "ndt", collateral: "no", custody: "no", recovery: "no", advice: "yes", crossborder: "yes", wire: "no" }, done: 28, overdue: 0, lastActive: "2 days ago" },
  { id: "m6", name: "Sample Life Insurer", programmeId: "insurance", facts: { kind: "insurer", life: "yes", nonlife: "no" }, done: 9, overdue: 1, lastActive: "Today" },
  { id: "m7", name: "Sample Health Membership Org", programmeId: "insurance", facts: { kind: "hmo", life: "no", nonlife: "no" }, done: 6, overdue: 0, lastActive: "Last week" },
];

export function seedState(): AdminState {
  return {
    regulators: regulators(),
    programmes: [paymentsProgramme(), dlProgramme(), insProgramme()],
    documents: documents(),
    ai: {
      enabled: true, visitors: true, members: true, useDocuments: true, useWeb: true,
      disclaimer: "General guidance from FITSPA's published documents. It is not legal advice; confirm with the regulator before you act.",
    },
    members: members(),
    log: [],
  };
}

export const DRAWER_TYPES = [
  "company_registration", "premises", "org_structure", "capital", "people", "ownership", "declarations", "financials", "official_form",
  "generic_upload", "multi_upload", "fee_proof", "tin_tax", "it_controls", "data_protection", "product_desc", "pricing", "source_funds",
  "customer_terms", "lending_agreement", "governance", "credit", "pentest", "docpack", "repeat_arrangement", "data_centre", "emi_structure",
];

export const OBLIGATION_TYPES = [
  "Regulatory return", "Prior approval", "Continuous control", "Event-driven notification", "Annual filing", "Governance control",
];
