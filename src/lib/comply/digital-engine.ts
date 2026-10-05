// Digital Lending Compliance ("Comply") occurrence engine.
//
// Verbatim port of the pure logic of the Beacon "Digital Lending Compliance"
// design prototype (digital_comply.html): the profile generates dated
// occurrences, logged events generate more with computed due dates, and each
// occurrence is a workflow with owner / reviewer / evidence / submission /
// regulator-outcome / audit trail. Controls are 21 control areas with
// evidence, review dates and exceptions.
//
// Everything here is pure: the current date is injected through `Clock`
// (production passes the real clock, tests pass a fixed one), nothing reads
// `window`, `localStorage` or `Date.now()` on its own.
//
// Deliberate fixes of plain defects in the prototype (see the gap analysis,
// section 5) are marked "FIX:" below.
import OBLIGATIONS_JSON from "@/data/digital-lending/obligations.json";
import CONTROL_AREAS_JSON from "@/data/digital-lending/control-areas.json";
import FITSPA_JSON from "@/data/digital-lending/fitspa-layer.json";
import FEES_JSON from "@/data/digital-lending/fees.json";
import EVENTS_JSON from "@/data/digital-lending/events.json";
import DOMAIN_LABELS_JSON from "@/data/digital-lending/domain-labels.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Route = "ml" | "ndt";
export type Answer = "yes" | "no" | "not-sure";

export interface DLProfile {
  route: Route | "";
  issue: string; // ISO yyyy-mm-dd, date first licensed
  fye: string; // ISO yyyy-mm-dd, financial year-end (month + day used)
  pdpoStatus: Answer | "";
  pdpo: string; // PDPO certificate expiry (only when pdpoStatus === "yes")
  collateral: Answer | "";
  custody: Answer | "";
  recovery: Answer | "";
  crossborder: Answer | "";
  advice: Answer | "";
  fitspa: "yes" | "no" | "";
}

export interface Registrations {
  licenceNo?: string;
  pdpoNo?: string;
  fiaNo?: string;
  mlco?: string;
  goaml?: string;
  contact?: string;
}

/** A stored evidence file. `path` is the storage path (private bucket). */
export interface FileRef {
  name: string;
  date?: string;
  path?: string;
  size?: number;
  mime?: string;
}

export interface FeeItem {
  name: string;
  amount: number | null;
  label?: string;
}

export interface Fee {
  items: FeeItem[];
  source: string;
  reference?: string;
  file?: FileRef | string;
}

export interface HistoryEntry {
  text: string;
  date: string;
}

export interface Occurrence {
  uid: string;
  key: string;
  title: string;
  ids: string[];
  legalDue: string; // ISO date or ''
  type: string; // scheduled | expiry | profile | event | regulator
  action: string;
  state: string; // stored state; see occurrenceState() for the effective one
  owner: string;
  reviewer: string;
  internalTarget: string;
  evidence: FileRef[];
  history: HistoryEntry[];
  generated: boolean;
  createdAt: string;
  dueText?: string;
  fee?: Fee | null;
  submission?: { date?: string; reference?: string; file?: FileRef | string };
  outcome?: { status?: string; file?: FileRef | string };
  eventId?: string;
  details?: Record<string, string>;
  regInstruction?: FileRef | string;
}

export interface ControlException {
  title: string;
  note: string;
  closed: boolean;
  date: string;
}

export interface ControlData {
  evidence: FileRef[];
  exceptions: ControlException[];
  lastReview?: string;
  nextReview?: string;
}

export interface ActivityEntry {
  text: string;
  date: string;
}

export interface SupportEntry {
  text: string;
  date: string;
  context?: string;
}

/** The single state document (persisted in member_comply_workspace.state). */
export interface DLState {
  profile: DLProfile | null;
  registrations: Registrations;
  occurrences: Occurrence[];
  controls: Record<string, ControlData>;
  activities: ActivityEntry[];
  support: SupportEntry[];
  calendarFilter: string;
  obSearch: string;
  obDomain: string;
  obBehaviour: string;
}

export interface Obligation {
  ID: string;
  Obligation: string;
  "Applies to": string;
  Behaviour: string;
  "Legal clock": string;
  "Source / provision": string;
  Recipient: string;
  guide: { what: string; do: string; when: string; keep: string };
  domain: string;
  sourceUrl: string;
  domainLabel: string;
}

export interface ControlArea {
  title: string;
  ids: string;
  maintains: string;
  idList: string[];
}

export interface FitspaItem {
  ID: string;
  "Industry obligation": string;
  Trigger: string;
  "Code timing": string;
  "Due logic": string;
  Evidence: string;
  Basis: string;
}

export interface EventDef {
  id: string;
  cat: string;
  title: string;
  desc: string;
  ids: string[];
  routes: string[];
  requires?: string;
  fields: string[];
}

/** Injected clock: `now` is the instant, `today` is the start of the local day. */
export interface Clock {
  now: Date;
  today: Date;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

export const OBLIGATIONS = OBLIGATIONS_JSON as unknown as Obligation[];
export const CONTROL_AREAS = CONTROL_AREAS_JSON as unknown as ControlArea[];
export const FITSPA = FITSPA_JSON as unknown as FitspaItem[];
export const EVENT_DEFS = EVENTS_JSON as unknown as EventDef[];
export const DOMAIN_LABELS = DOMAIN_LABELS_JSON as Record<string, string>;
export const FEE_MAP = FEES_JSON as unknown as Record<string, Fee>;

export const STORE_KEY = "beacon_digital_lending_compliance_v2";

const OB_BY_ID: Record<string, Obligation> = Object.fromEntries(OBLIGATIONS.map((o) => [o.ID, o]));
export function getOb(id: string): Obligation | undefined {
  return OB_BY_ID[id];
}

export const EVENT_FIELD_LABELS: Record<string, string> = {
  eventDate: "Event / receipt date",
  effectiveDate: "Proposed effective date",
  personName: "Person name",
  personRole: "Role / position",
  placeName: "Place / branch name",
  address: "Address / location",
  details: "Details",
  customerRef: "Customer / case reference",
  discoveryTime: "Discovery time",
  suspicionTime: "Time suspicion was formed",
  caseRef: "Case reference",
  amount: "Amount",
  regDue: "Regulator / reporting due date",
  providerName: "Provider / funder name",
};

export function eventFieldType(name: string): "date" | "time" | "text" | "textarea" {
  if (name === "details") return "textarea";
  if (name.includes("Date") || name === "regDue") return "date";
  if (name.includes("Time")) return "time";
  return "text";
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function emptyState(): DLState {
  return {
    profile: null,
    registrations: {},
    occurrences: [],
    controls: {},
    activities: [],
    support: [],
    calendarFilter: "all",
    obSearch: "",
    obDomain: "all",
    obBehaviour: "all",
  };
}

/** Merge a stored document over the defaults, like the prototype's load step. */
export function normaliseState(raw: unknown): DLState {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<DLState>;
  return {
    ...base,
    ...s,
    registrations: s.registrations || {},
    occurrences: Array.isArray(s.occurrences) ? s.occurrences : [],
    controls: s.controls && typeof s.controls === "object" ? s.controls : {},
    activities: Array.isArray(s.activities) ? s.activities : [],
    support: Array.isArray(s.support) ? s.support : [],
  };
}

export function makeClock(now: Date = new Date()): Clock {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return { now, today };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/**
 * FIX: the prototype formatted ISO dates with toISOString(), which is UTC and
 * shifts local-midnight dates back one day east of Greenwich (Uganda is
 * UTC+3). Format from the local calendar fields instead.
 */
export function iso(d?: Date | string | null): string {
  if (!d) return "";
  const x = new Date(d);
  if (isNaN(x.getTime())) return "";
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${String(x.getFullYear()).padStart(4, "0")}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addYears(d: Date, n: number): Date {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
}

/** Whole local days from a to b (DST-safe; identical to the prototype elsewhere). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function addWorkingDays(d: Date, n: number): Date {
  let x = new Date(d);
  let count = 0;
  while (count < n) {
    x = addDays(x, 1);
    const day = x.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return x;
}

export function addCalendarMonths(d: Date, n: number): Date {
  const day = d.getDate();
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

export function fmt(d: Date | string | null | undefined, locale?: string): string {
  if (!d) return "—";
  const x = typeof d === "string" ? parseDate(d) : d;
  return x ? x.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function monthKey(d: string, locale?: string): string {
  const x = parseDate(d);
  return x ? x.toLocaleDateString(locale, { month: "long", year: "numeric" }) : "No date";
}

export function currentLicenceExpiry(today: Date, year: number = today.getFullYear()): Date {
  return new Date(year, 11, 31);
}

export function licenceRenewalDue(year: number, route: string): Date {
  const exp = new Date(year, 11, 31);
  return route === "ml" ? new Date(year, 8, 30) : addDays(exp, -90);
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function ugx(n: number | null | undefined): string {
  return n == null ? "" : `UGX ${Number(n).toLocaleString("en-UG")}`;
}

export function feeTotal(f?: Fee | null): number {
  return !f ? 0 : (f.items || []).reduce((s, x) => s + (x.amount || 0), 0);
}

export function feeLabel(f?: Fee | null): string {
  if (!f) return "";
  const known = feeTotal(f);
  const unknown = (f.items || []).find((x) => x.amount == null);
  if (known && unknown) return `${ugx(known)} + ${unknown.label || "Check current fee"}`;
  if (known) return ugx(known);
  return unknown?.label || "Check current fee";
}

export function renewalFee(route: string): Fee {
  return clone(route === "ml" ? FEE_MAP.mlRenewal : FEE_MAP.ndtRenewal);
}

export function eventFee(id: string, route: string): Fee | null {
  if (id === "openPlace") return clone(route === "ml" ? FEE_MAP.mlAdditionalPlace : FEE_MAP.ndtBranch);
  if (id === "management" || id === "relocate") return clone(route === "ml" ? FEE_MAP.mlChange : FEE_MAP.ndtChange);
  return null;
}

export function costForObligation(id: string, route: string): string {
  if (id === "LIC-09") return ugx(300000);
  if (id === "LIC-10") return ugx(300000);
  if (id === "LIC-11" || id === "LIC-12") return feeLabel(renewalFee(route || "ml"));
  if (id === "TEC-04" || id === "TEC-05") return "Check current fee";
  return "";
}

export function fileName(f?: FileRef | string | null): string {
  if (!f) return "";
  return typeof f === "string" ? f : f.name;
}

/** Fees already generated by current renewal/event workflows, for this calendar year. */
export function knownCosts(state: DLState, clock: Clock): Occurrence[] {
  const year = clock.today.getFullYear();
  return (state.occurrences || []).filter(
    (o) =>
      o.fee &&
      ((o.legalDue && parseDate(o.legalDue)?.getFullYear() === year) ||
        (!o.legalDue && new Date(o.createdAt || clock.now).getFullYear() === year)),
  );
}

// ---------------------------------------------------------------------------
// Profile-derived helpers
// ---------------------------------------------------------------------------

export function routeName(state: DLState): string {
  return state.profile?.route === "ndt" ? "NDTMFI" : "Money Lender";
}

export function operatingUnresolved(state: DLState): string[] {
  const p = state.profile || ({} as Partial<DLProfile>);
  const out: string[] = [];
  if (!p.collateral || p.collateral === "not-sure") out.push("collateral/security");
  if (p.collateral === "yes" && (!p.custody || p.custody === "not-sure")) out.push("collateral custody");
  if (!p.recovery || p.recovery === "not-sure") out.push("external recovery agents");
  if (!p.crossborder || p.crossborder === "not-sure") out.push("cross-border data");
  return out;
}

export function isFcpEffective(state: DLState, onDate: Date | null | undefined, clock: Clock): boolean {
  const issue = parseDate(state.profile?.issue || "");
  if (!issue) return false;
  return (onDate || clock.today) >= addYears(issue, 1);
}

/**
 * FIX: custody is only meaningful when collateral is used (the settings drawer
 * hides the custody question otherwise), so a stale "custody = yes" must not
 * make ML-04 / the collateral-loss event apply when collateral is No / Not sure.
 */
function effectiveAnswer(p: Partial<DLProfile>, key: string): string {
  const v = (p as Record<string, string | undefined>)[key] || "";
  if (key === "custody" && p.collateral !== "yes") return "";
  return v;
}

export function applicableOb(state: DLState, o: Obligation): boolean {
  const a = o["Applies to"] || "";
  const p = state.profile || ({} as Partial<DLProfile>);
  if (p.route === "ml" && a.startsWith("NDTMFI")) return false;
  if (p.route === "ndt" && a.startsWith("Money Lender")) return false;
  const conditional = (phrase: string, key: string) => (a.includes(phrase) ? effectiveAnswer(p, key) === "yes" : true);
  if (!conditional("if collateral is used", "collateral")) return false;
  if (!conditional("if collateral is held in custody", "custody")) return false;
  if (!conditional("third-party recovery", "recovery")) return false;
  if (!conditional("personal advice", "advice")) return false;
  if (!conditional("cross-border", "crossborder")) return false;
  if (a.includes("international wire") && !(state.occurrences || []).some((x) => x.eventId === "wire")) return false;
  return true;
}

export function obligations(state: DLState): Obligation[] {
  return OBLIGATIONS.filter((o) => applicableOb(state, o));
}

export function eventApplicable(state: DLState, e: EventDef): boolean {
  if (!state.profile || !e.routes.includes(state.profile.route)) return false;
  if (e.requires && effectiveAnswer(state.profile, e.requires) !== "yes") return false;
  return true;
}

export function controlIds(state: DLState, c: ControlArea): string[] {
  return c.idList.filter((id) => {
    const o = getOb(id);
    return !!o && applicableOb(state, o);
  });
}

export type ControlStatus = "evidence" | "attention" | "notreviewed";

export function controlStatus(state: DLState, idx: number): ControlStatus {
  const c = state.controls[idx];
  if (!c || (!(c.evidence || []).length && !c.lastReview && !(c.exceptions || []).length)) return "notreviewed";
  if ((c.exceptions || []).some((x) => !x.closed)) return "attention";
  if ((c.evidence || []).length) return "evidence";
  return "attention";
}

export function controlLabel(st: ControlStatus): string {
  return st === "evidence" ? "Evidence on file" : st === "attention" ? "Needs attention" : "Not reviewed";
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

export function occurrenceState(o: Occurrence, clock: Clock): string {
  if (o.state === "Closed" || o.state === "Submitted" || o.state === "Awaiting regulator" || o.state === "In progress")
    return o.state;
  const due = parseDate(o.legalDue);
  if (due && clock.today > due) return "Overdue";
  if (due && daysBetween(clock.today, due) > 0) return o.state || "Upcoming";
  return o.state || "Action needed";
}

export function badgeClass(s: string): string {
  const map: Record<string, string> = {
    "Action needed": "action",
    Overdue: "overdue",
    Upcoming: "upcoming",
    "In progress": "action",
    Submitted: "submitted",
    "Awaiting regulator": "awaiting",
    Closed: "evidence",
    "Evidence on file": "evidence",
    "Needs attention": "attention",
    "Not reviewed": "notreviewed",
  };
  return map[s] || "upcoming";
}

export function legalDueText(o: Occurrence): string {
  return o.legalDue ? fmt(o.legalDue) : o.dueText || "No fixed date";
}

/** Stable 53-bit string hash (cyrb53) for occurrence uids. */
function hashKey(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * FIX: the prototype derived the uid from the first 18 bytes of the key, so
 * every occurrence with the same type and obligation ids (e.g. all NDT
 * quarterly returns, both licence renewals, every complaints report) shared one
 * uid and "Open" always opened the first of them. Hash the whole key instead.
 */
export function makeOcc(
  clock: Clock,
  title: string,
  ids: string[],
  due: string,
  type: string,
  action: string,
  extra: Partial<Occurrence> = {},
): Occurrence {
  const key = extra.key || `${type}|${ids.join(",")}|${title}|${due || ""}`;
  const base: Occurrence = {
    uid: "occ_" + hashKey(key),
    key,
    title,
    ids,
    legalDue: due || "",
    type,
    action,
    state: due && (parseDate(due) as Date) > clock.today ? "Upcoming" : "Action needed",
    owner: "Unassigned",
    reviewer: "",
    internalTarget: "",
    evidence: [],
    history: [{ text: "Occurrence created", date: clock.now.toISOString() }],
    generated: true,
    createdAt: clock.now.toISOString(),
  };
  return Object.assign(base, extra);
}

/** Recompute the generated (profile-driven) occurrences, keeping worked-on state by key. */
export function generateScheduled(state: DLState, clock: Clock): DLState {
  if (!state.profile) return state;
  const p = state.profile;
  const now = clock.today;
  const y = now.getFullYear();
  const old = state.occurrences.filter((x) => !x.generated);
  let gen: Occurrence[] = [];
  const rn = routeName(state);
  for (let yy = y; yy <= y + 1; yy++) {
    const due = licenceRenewalDue(yy, p.route);
    if (daysBetween(now, due) >= -120 && daysBetween(now, due) <= 550)
      gen.push(
        makeOcc(clock, `${yy} ${rn} licence renewal`, ["LIC-11", "LIC-12"], iso(due), "scheduled", "Prepare renewal", {
          fee: renewalFee(p.route),
        }),
      );
  }
  if (p.pdpoStatus === "yes") {
    const pdpo = parseDate(p.pdpo);
    if (pdpo)
      gen.push(
        makeOcc(clock, "PDPO registration renewal", ["TEC-05"], iso(addCalendarMonths(pdpo, -3)), "expiry", "Prepare renewal", {
          fee: clone(FEE_MAP.pdpo),
        }),
      );
  }
  if (p.pdpoStatus === "no")
    gen.push(
      makeOcc(clock, "Complete PDPO registration", ["TEC-04"], "", "profile", "Register with PDPO", {
        dueText: "Registration action required",
        state: "Action needed",
        fee: clone(FEE_MAP.pdpo),
      }),
    );
  if (p.route === "ndt") {
    for (let yy = y - 1; yy <= y + 1; yy++) {
      ([[2, 31], [5, 30], [8, 30], [11, 31]] as const).forEach(([m]) => {
        const due = new Date(yy, m + 1, 15);
        if (daysBetween(now, due) >= -120 && daysBetween(now, due) <= 500)
          gen.push(
            makeOcc(
              clock,
              `${yy} Q${m === 2 ? 1 : m === 5 ? 2 : m === 8 ? 3 : 4} NDT risk-classification return`,
              ["RPT-01"],
              iso(due),
              "scheduled",
              "Prepare return",
            ),
          );
      });
    }
    for (let reportYear = y - 1; reportYear <= y + 1; reportYear++) {
      const due = new Date(reportYear + 1, 2, 31);
      if (daysBetween(now, due) >= -180 && daysBetween(now, due) <= 700)
        gen.push(
          makeOcc(
            clock,
            `${reportYear} NDTMFI annual report & audited financial statements`,
            ["RPT-02"],
            iso(due),
            "scheduled",
            "Prepare annual filing",
          ),
        );
    }
  }
  const fye = parseDate(p.fye);
  const issue = parseDate(p.issue);
  const fcp = issue ? addYears(issue, 1) : null;
  if (fye && fcp) {
    for (let yy = y - 1; yy <= y + 1; yy++) {
      const end = new Date(yy, fye.getMonth(), fye.getDate());
      const due = addCalendarMonths(end, 1);
      if (end >= fcp && daysBetween(now, due) >= -180 && daysBetween(now, due) <= 550)
        gen.push(
          makeOcc(clock, `Annual complaints report — FY ending ${fmt(end)}`, ["RPT-04"], iso(due), "scheduled", "Prepare report"),
        );
    }
  }
  const existing = state.occurrences.filter((x) => x.generated);
  gen = gen.map((g) => {
    const oldg = existing.find((x) => x.key === g.key);
    return oldg
      ? Object.assign(g, {
          state: oldg.state,
          owner: oldg.owner,
          reviewer: oldg.reviewer,
          internalTarget: oldg.internalTarget,
          evidence: oldg.evidence || [],
          submission: oldg.submission,
          outcome: oldg.outcome,
          fee: oldg.fee || g.fee,
          history: oldg.history || g.history,
        })
      : g;
  });
  return { ...state, occurrences: [...old, ...gen] };
}

export function addActivity(state: DLState, text: string, clock: Clock): DLState {
  return { ...state, activities: [{ text, date: clock.now.toISOString() }, ...state.activities].slice(0, 30) };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function summary(state: DLState, clock: Clock) {
  const occ = state.occurrences || [];
  const states = occ.map((o) => occurrenceState(o, clock));
  return {
    action: states.filter((x) => x === "Action needed").length,
    overdue: states.filter((x) => x === "Overdue").length,
    due30: occ.filter((x) => {
      const d = parseDate(x.legalDue);
      return d && daysBetween(clock.today, d) >= 0 && daysBetween(clock.today, d) <= 30 && occurrenceState(x, clock) !== "Closed";
    }).length,
    controls: CONTROL_AREAS.filter(
      (c, i) => controlIds(state, c).length && ["notreviewed", "attention"].includes(controlStatus(state, i)),
    ).length,
  };
}

export function priorityOccurrences(state: DLState, clock: Clock): Occurrence[] {
  const rank: Record<string, number> = {
    Overdue: 0,
    "Action needed": 1,
    "In progress": 2,
    Upcoming: 3,
    Submitted: 4,
    "Awaiting regulator": 5,
  };
  const FAR = 8640000000000000;
  return (state.occurrences || [])
    .filter((x) => occurrenceState(x, clock) !== "Closed")
    .sort((a, b) => {
      const sa = occurrenceState(a, clock);
      const sb = occurrenceState(b, clock);
      const r = (rank[sa] ?? 9) - (rank[sb] ?? 9);
      if (r) return r;
      const da = parseDate(a.legalDue)?.getTime() ?? FAR;
      const db = parseDate(b.legalDue)?.getTime() ?? FAR;
      return da - db;
    });
}

export function profileWarningText(state: DLState): string | null {
  const unresolved = operatingUnresolved(state);
  const pdpo = state.profile?.pdpoStatus || "";
  const parts: string[] = [];
  if (pdpo === "not-sure") parts.push("confirm your PDPO registration status");
  if (unresolved.length) parts.push(`complete ${unresolved.length} operating-profile answer${unresolved.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" and ") : null;
}

// ---------------------------------------------------------------------------
// Setup / profile
// ---------------------------------------------------------------------------

export interface SetupForm {
  route: Route | "";
  issue: string;
  fye: string;
  pdpoStatus: Answer | "";
  pdpo: string;
}

/** The setup save button is disabled until this is true. */
export function setupValid(f: SetupForm): boolean {
  const required: string[] = [f.route, f.issue, f.fye, f.pdpoStatus];
  if (f.pdpoStatus === "yes") required.push(f.pdpo);
  return !required.some((x) => !x);
}

/**
 * Save the setup essentials. `prefill` carries operating answers from an older
 * profile row (e.g. member_compliance_profile) when there is no saved profile.
 * Changing the saved route wipes generated occurrences and all control state.
 */
export function saveSetup(
  state: DLState,
  f: SetupForm,
  clock: Clock,
  prefill?: Partial<DLProfile> | null,
): DLState {
  const old: Partial<DLProfile> = state.profile || prefill || {};
  let next: DLState = {
    ...state,
    profile: {
      route: f.route as Route,
      issue: f.issue,
      fye: f.fye,
      pdpoStatus: f.pdpoStatus,
      pdpo: f.pdpoStatus === "yes" ? f.pdpo : "",
      collateral: old.collateral || "not-sure",
      custody: old.custody || "not-sure",
      recovery: old.recovery || "not-sure",
      crossborder: old.crossborder || "not-sure",
      advice: old.advice || "not-sure",
      fitspa: old.fitspa || "",
    },
  };
  if (state.profile?.route && state.profile.route !== f.route) {
    next = { ...next, occurrences: next.occurrences.filter((x) => !x.generated), controls: {} };
  }
  next = addActivity(next, "Compliance essentials saved", clock);
  return generateScheduled(next, clock);
}

export interface SettingsForm {
  issue: string;
  fye: string;
  pdpoStatus: Answer | "";
  pdpo: string;
  collateral: Answer | "";
  custody: Answer | "";
  recovery: Answer | "";
  crossborder: Answer | "";
  advice: Answer | "";
  fitspa: "yes" | "no" | "";
  registrations: Registrations;
}

export function saveSettings(state: DLState, f: SettingsForm, clock: Clock): DLState {
  const p: DLProfile = {
    ...(state.profile as DLProfile),
    issue: f.issue,
    fye: f.fye,
    pdpoStatus: f.pdpoStatus,
    pdpo: f.pdpoStatus === "yes" ? f.pdpo : "",
    collateral: f.collateral,
    custody: f.custody,
    recovery: f.recovery,
    crossborder: f.crossborder,
    advice: f.advice,
    fitspa: f.fitspa,
  };
  let next: DLState = { ...state, profile: p, registrations: { ...f.registrations } };
  next = generateScheduled(next, clock);
  return addActivity(next, "Updated profile & registrations", clock);
}

// ---------------------------------------------------------------------------
// Occurrence workflow
// ---------------------------------------------------------------------------

export function isPriorApproval(oc: Occurrence): boolean {
  return (oc.ids || [])
    .map(getOb)
    .filter((o): o is Obligation => !!o)
    .some((o) => (o.Behaviour || "").toLowerCase().includes("prior approval"));
}

export interface OccurrenceForm {
  owner: string;
  reviewer: string;
  internalTarget: string;
  workFile?: FileRef | null;
  feeRef?: string;
  feeFile?: FileRef | null;
  subDate: string;
  subRef: string;
  subFile?: FileRef | null;
  outcomeStatus?: string;
  outcomeFile?: FileRef | null;
}

export type OccurrenceMode = "save" | "submit" | "close";

export type EngineResult<T = Record<never, never>> = ({ ok: true; state: DLState } & T) | { ok: false; error: string };

export const MESSAGES = {
  needSubmission:
    "Add the submission/delivery date and either a reference or submission evidence before recording this as submitted.",
  needFee: "Add payment evidence or a payment reference before closing this fee-bearing occurrence.",
  needOutcome: "Add the regulator outcome and outcome evidence before closing this prior-approval workflow.",
  needEvidence: "Add evidence of the required action before closing this occurrence.",
  needEventDate: "Add the event / receipt date.",
  needRegulatorFields: "Add the title and the stated regulator due date.",
};

export function saveOccurrence(
  state: DLState,
  uid: string,
  form: OccurrenceForm,
  mode: OccurrenceMode,
  clock: Clock,
): EngineResult {
  const idx = state.occurrences.findIndex((x) => x.uid === uid);
  if (idx < 0) return { ok: false, error: "Occurrence not found." };
  const oc: Occurrence = JSON.parse(JSON.stringify(state.occurrences[idx]));
  const prior = isPriorApproval(oc);
  const nowIso = clock.now.toISOString();
  const submit = mode === "submit";
  const close = mode === "close";

  oc.owner = (form.owner || "").trim() || "Unassigned";
  oc.reviewer = (form.reviewer || "").trim();
  oc.internalTarget = form.internalTarget || "";
  if (form.workFile) {
    oc.evidence = oc.evidence || [];
    oc.evidence.push({ ...form.workFile, date: nowIso });
  }
  if (oc.fee) {
    const fr = (form.feeRef || "").trim();
    if (fr) oc.fee.reference = fr;
    if (form.feeFile) oc.fee.file = form.feeFile;
  }
  const sd = form.subDate;
  const sr = (form.subRef || "").trim();
  if (sd || sr || form.subFile) {
    oc.submission = oc.submission || {};
    if (sd) oc.submission.date = sd;
    if (sr) oc.submission.reference = sr;
    if (form.subFile) oc.submission.file = form.subFile;
  }
  if (prior) {
    oc.outcome = oc.outcome || {};
    if (form.outcomeStatus) oc.outcome.status = form.outcomeStatus;
    if (form.outcomeFile) oc.outcome.file = form.outcomeFile;
  }
  oc.history = oc.history || [];

  let activity: string | null = null;
  if (submit) {
    if (!(oc.submission?.date && (oc.submission?.reference || oc.submission?.file))) {
      return { ok: false, error: MESSAGES.needSubmission };
    }
    oc.state = prior ? "Awaiting regulator" : "Submitted";
    oc.history.push({ text: prior ? "Submitted — awaiting regulator" : "Submitted / sent", date: nowIso });
    activity = `Submitted: ${oc.title}`;
  }
  if (close) {
    if (oc.fee && !(oc.fee.reference || oc.fee.file)) return { ok: false, error: MESSAGES.needFee };
    if (prior && !(oc.outcome?.status && oc.outcome?.file)) return { ok: false, error: MESSAGES.needOutcome };
    if (!prior && !(oc.evidence?.length || oc.submission?.file || oc.submission?.reference))
      return { ok: false, error: MESSAGES.needEvidence };
    oc.state = "Closed";
    oc.history.push({ text: "Occurrence closed", date: nowIso });
    activity = `Closed: ${oc.title}`;
  } else if (!submit) {
    oc.state = "In progress";
    oc.history.push({ text: "Progress updated", date: nowIso });
  }
  const occurrences = state.occurrences.slice();
  occurrences[idx] = oc;
  let next: DLState = { ...state, occurrences };
  if (activity) next = addActivity(next, activity, clock);
  return { ok: true, state: next };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function actionFor(ids: string[]): string {
  const bs = ids
    .map((id) => getOb(id)?.Behaviour || "")
    .join(" ")
    .toLowerCase();
  if (bs.includes("prior approval")) return "Prepare approval";
  if (bs.includes("return") || bs.includes("report")) return "Prepare report";
  if (bs.includes("notice") || bs.includes("notification")) return "Prepare notice";
  return "Open workflow";
}

export function eventIds(state: DLState, e: EventDef): string[] {
  const route = state.profile?.route;
  if (e.id === "openPlace") return route === "ml" ? ["LIC-09"] : ["LIC-10"];
  if (e.id === "relocate") return route === "ml" ? ["ML-02"] : ["NDT-08"];
  // FIX: recoveryAgent (DBT-03/DBT-02) and wire (AML-16) obligations are only
  // "applicable" once such an occurrence/answer exists, so filtering by
  // applicability left these events with no linked obligation. Link always.
  if (e.id === "recoveryAgent" || e.id === "wire") return e.ids.filter((id) => !!getOb(id));
  return e.ids.filter((id) => {
    const o = getOb(id);
    return !!o && applicableOb(state, o);
  });
}

export function eventTitle(e: EventDef, vals: Record<string, string>): string {
  return (
    e.title +
    (vals.customerRef
      ? ` — ${vals.customerRef}`
      : vals.personName
        ? ` — ${vals.personName}`
        : vals.placeName
          ? ` — ${vals.placeName}`
          : vals.caseRef
            ? ` — ${vals.caseRef}`
            : "")
  );
}

/** Computed legal / regulator due date (ISO) for a logged event, '' when none. */
export function eventDue(state: DLState, e: EventDef, vals: Record<string, string>, clock: Clock): string {
  const base = parseDate(vals.eventDate) as Date;
  const route = state.profile?.route;
  switch (e.id) {
    case "complaint":
      return iso(addDays(base, isFcpEffective(state, base, clock) ? 14 : 30));
    case "access":
      return iso(addDays(base, 30));
    case "objection":
      return iso(addDays(base, 14));
    case "assignment":
      return iso(addDays(base, 5));
    case "inspectionNDT":
      return iso(addDays(base, 30));
    case "revocationML":
      return iso(addDays(base, 14));
    case "str":
      return iso(addWorkingDays(base, 2));
    case "collateralSale":
      return iso(addDays(base, 60));
    case "breach":
      return vals.eventDate;
    case "productTech":
      return vals.effectiveDate || "";
    case "terms": {
      const eff = parseDate(vals.effectiveDate);
      return eff ? iso(isFcpEffective(state, eff, clock) ? addDays(eff, -30) : eff) : "";
    }
    case "management":
    case "openPlace":
    case "corporate":
    case "recoveryAgent":
      return vals.effectiveDate || "";
    case "relocate": {
      const eff = parseDate(vals.effectiveDate);
      return eff ? iso(route === "ml" ? addDays(eff, 7) : eff) : "";
    }
    case "closePlace": {
      const eff = parseDate(vals.effectiveDate);
      return eff ? iso(addDays(eff, -90)) : "";
    }
    case "cash":
    case "wire":
    case "regulator":
      return vals.regDue || "";
    case "sanctions":
      return vals.eventDate;
    default:
      return "";
  }
}

function uniqueUid(state: DLState, uid: string): string {
  let u = uid;
  let n = 2;
  while (state.occurrences.some((x) => x.uid === u)) u = `${uid}_${n++}`;
  return u;
}

export function createEvent(
  state: DLState,
  e: EventDef,
  rawVals: Record<string, string>,
  clock: Clock,
): EngineResult<{ uid: string }> {
  const vals: Record<string, string> = {};
  e.fields.forEach((f) => (vals[f] = (rawVals[f] || "").trim()));
  if (!vals.eventDate) return { ok: false, error: MESSAGES.needEventDate };
  const ids = eventIds(state, e);
  const title = eventTitle(e, vals);
  const due = eventDue(state, e, vals, clock);
  const first = ids.map(getOb).filter(Boolean)[0] as Obligation | undefined;
  const dueText = !due && first ? first["Legal clock"] : "";
  const route = state.profile?.route || "ml";
  const fee = eventFee(e.id, route);
  const oc = makeOcc(clock, title, ids, due, "event", actionFor(ids), {
    generated: false,
    eventId: e.id,
    details: vals,
    dueText,
    state: "Action needed",
    fee,
  });
  oc.uid = uniqueUid(state, oc.uid);
  let next: DLState = { ...state, occurrences: [...state.occurrences, oc] };
  next = addActivity(next, `Logged event: ${title}`, clock);
  return { ok: true, state: next, uid: oc.uid };
}

export interface RegulatorForm {
  title: string;
  due: string;
  obligationId: string;
  file?: FileRef | null;
}

export const REGULATOR_OBLIGATIONS: { id: string; label: string }[] = [
  { id: "LIC-03", label: "Licence condition / direction" },
  { id: "RPT-03", label: "Other MRD-MoFPED return" },
  { id: "LIC-14", label: "Books / records request" },
];

export function createRegulatorSet(state: DLState, f: RegulatorForm, clock: Clock): EngineResult<{ uid: string }> {
  const title = (f.title || "").trim();
  if (!title || !f.due) return { ok: false, error: MESSAGES.needRegulatorFields };
  const oc = makeOcc(clock, title, [f.obligationId], f.due, "regulator", "Prepare response", {
    generated: false,
    state: "Action needed",
    regInstruction: f.file || "",
  });
  oc.uid = uniqueUid(state, oc.uid);
  let next: DLState = { ...state, occurrences: [...state.occurrences, oc] };
  next = addActivity(next, `Added regulator-set work: ${title}`, clock);
  return { ok: true, state: next, uid: oc.uid };
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export interface ControlForm {
  file?: FileRef | null;
  lastReview: string;
  nextReview: string;
  exception: string;
}

export function saveControlReview(state: DLState, idx: number, form: ControlForm, clock: Clock): DLState {
  const c = CONTROL_AREAS[idx];
  const old = state.controls[idx] || { evidence: [], exceptions: [] };
  const d: ControlData = {
    ...old,
    evidence: [...(old.evidence || [])],
    exceptions: [...(old.exceptions || [])],
  };
  if (form.file) d.evidence.push({ ...form.file, date: clock.now.toISOString() });
  d.lastReview = form.lastReview || iso(clock.today);
  d.nextReview = form.nextReview;
  const ex = (form.exception || "").trim();
  if (ex) d.exceptions.push({ title: ex, note: "", closed: false, date: clock.now.toISOString() });
  const next: DLState = { ...state, controls: { ...state.controls, [idx]: d } };
  return addActivity(next, `Reviewed control: ${c.title}`, clock);
}

export function resolveException(state: DLState, idx: number, exIdx: number): DLState {
  const old = state.controls[idx] || { evidence: [], exceptions: [] };
  const exceptions = (old.exceptions || []).map((x, i) => (i === exIdx ? { ...x, closed: true } : x));
  return { ...state, controls: { ...state.controls, [idx]: { ...old, exceptions } } };
}

// ---------------------------------------------------------------------------
// Expert Support
// ---------------------------------------------------------------------------

export type ExpertCtx =
  | { kind: "general" }
  | { kind: "obligation"; obligationId: string }
  | { kind: "occurrence"; uid: string }
  | { kind: "control"; control: number };

export function expertContext(state: DLState, ctx: ExpertCtx, clock: Clock): { text: string; meta: string; key: string } {
  let text = "Digital Lending compliance";
  let meta = "";
  let key = "digital-lending:general";
  if (ctx.kind === "obligation") {
    text = getOb(ctx.obligationId)?.Obligation || text;
    key = `digital-lending:obligation:${ctx.obligationId}`;
  } else if (ctx.kind === "occurrence") {
    const oc = state.occurrences.find((x) => x.uid === ctx.uid);
    text = oc?.title || text;
    key = `digital-lending:occurrence:${oc?.key || ctx.uid}`;
    meta = oc
      ? `${occurrenceState(oc, clock)}${oc.legalDue ? " · due " + fmt(oc.legalDue) : ""}${oc.fee ? " · fee " + feeLabel(oc.fee) : ""} · ${(oc.evidence || []).length} evidence item${(oc.evidence || []).length === 1 ? "" : "s"}`
      : "";
  } else if (ctx.kind === "control") {
    text = CONTROL_AREAS[ctx.control]?.title || text;
    key = `digital-lending:control:${ctx.control}`;
    const cd = state.controls[ctx.control] || ({ evidence: [] } as Partial<ControlData>);
    meta = `${controlLabel(controlStatus(state, ctx.control))} · ${(cd.evidence || []).length} evidence item${(cd.evidence || []).length === 1 ? "" : "s"}`;
  }
  return { text, meta, key };
}

export function addSupport(state: DLState, text: string, contextText: string, clock: Clock, kind: "question" | "review"): DLState {
  const next: DLState = {
    ...state,
    support: [...state.support, { text, date: clock.now.toLocaleString(), context: contextText }],
  };
  return addActivity(
    next,
    kind === "question" ? `Expert Support question sent: ${contextText}` : `Compliance review requested: ${contextText}`,
    clock,
  );
}

// ---------------------------------------------------------------------------
// Legacy pre-fill (member_compliance_profile -> setup draft)
// ---------------------------------------------------------------------------

export interface LegacyProfileRow {
  route?: string | null;
  money_lender?: string | null;
  ndt_mfi?: string | null;
  issue_date?: string | null;
  fye_date?: string | null;
  pdpo_status?: string | null;
  pdpo_expiry?: string | null;
  collateral?: string | null;
  custody?: string | null;
  recovery_agents?: string | null;
  crossborder?: string | null;
  advice?: string | null;
  fitspa_subscriber?: string | null;
}

function legacyAnswer(v?: string | null): Answer | "" {
  const s = (v || "").trim().toLowerCase();
  if (s === "yes") return "yes";
  if (s === "no") return "no";
  if (s === "not sure" || s === "not-sure") return "not-sure";
  return "";
}

/** Map an old member_compliance_profile row onto the new profile where fields map. */
export function profileFromLegacy(row: LegacyProfileRow | null | undefined): Partial<DLProfile> | null {
  if (!row) return null;
  let route: Route | "" = "";
  const r = (row.route || "").toLowerCase();
  if (r === "ml" || r === "ndt") route = r;
  else if (legacyAnswer(row.money_lender) === "yes" && legacyAnswer(row.ndt_mfi) !== "yes") route = "ml";
  else if (legacyAnswer(row.ndt_mfi) === "yes" && legacyAnswer(row.money_lender) !== "yes") route = "ndt";
  const fit = legacyAnswer(row.fitspa_subscriber);
  const out: Partial<DLProfile> = {
    route,
    issue: (row.issue_date || "").slice(0, 10),
    fye: (row.fye_date || "").slice(0, 10),
    pdpoStatus: legacyAnswer(row.pdpo_status),
    pdpo: (row.pdpo_expiry || "").slice(0, 10),
    collateral: legacyAnswer(row.collateral),
    custody: legacyAnswer(row.custody),
    recovery: legacyAnswer(row.recovery_agents),
    crossborder: legacyAnswer(row.crossborder),
    advice: legacyAnswer(row.advice),
    fitspa: fit === "yes" || fit === "no" ? fit : "",
  };
  return out;
}
