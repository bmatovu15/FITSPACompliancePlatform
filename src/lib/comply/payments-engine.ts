// Payments Compliance ("Comply") -- pure rules engine.
//
// Typed port of the logic in the Beacon design prototype (payments_comply.html /
// pc.js): applicability, baseline items, recurring / event / regulator task
// generation, the status model, workflows, evidence rules, event consequence
// actions, operational grouping, product filters, timing and the working-day
// calculator. Nothing in here touches the DOM, localStorage or the network and
// nothing reads the system clock: every date-dependent function receives a
// `Clock` (see `makeClock`) so the same code is unit-testable and production
// simply passes the real current instant (dates are Africa/Kampala, UTC+3, no DST).
import catalogJson from "@/data/payments-comply-catalog.json";
import type { StoredEvidenceFile } from "./workspace";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Entry {
  id: string;
  group: string;
  requirement: string;
  applies: string;
  type: string;
  decision?: string;
  source: string;
  links: [string, string][];
  meaning: string;
  what_do: string;
  when: string;
  evidence: string;
  next: string;
  cta?: string;
  completion?: string;
  ui_placement?: string | null;
  audit_note?: string;
}

export const ENTRIES: Entry[] = catalogJson as unknown as Entry[];
export const BY_ID: Record<string, Entry> = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------
// State model (one JSON document, persisted by the workspace adapter)
// ---------------------------------------------------------------------------

export interface Profile {
  categories: { pso: boolean; psp: boolean; instrument: boolean };
  psoClasses: string[];
  pspClasses: string[];
  instrumentClasses: string[];
  emiBand: string;
  licenceDate: string;
  licenceConditions: "none" | "yes";
  fiMdi: boolean | null;
  safeguard: "trust" | "special" | null;
  agents: boolean | null;
  cards: boolean | null;
  participant: boolean | null;
}

export type TaskStateName =
  | "overdue"
  | "confirm"
  | "evidence"
  | "upcoming"
  | "action"
  | "preparing"
  | "review"
  | "submitted"
  | "waiting"
  | "complete"
  | "current"
  | "due"
  | "controlreview"
  | "asneeded";

export type BaselineValue = "completed" | "outstanding" | "unknown";

export interface EvidenceRecord {
  uid: number;
  name: string;
  type: string;
  obligationId: string;
  taskKey: string;
  /** ISO date (Africa/Kampala) the evidence was recorded. */
  added: string;
  /** Stored file (private bucket) when the workspace adapter uploaded one. */
  file?: StoredEvidenceFile;
}

export interface EventAction {
  id: string;
  due: string;
  dueDateTime?: string;
  dateType: string;
  timing?: string;
}

export interface EventRecord {
  uid: number;
  type: string;
  label: string;
  date: string;
  time: string;
  actions: EventAction[];
}

export interface RegulatorTask {
  uid: number;
  title: string;
  due: string;
  received: string;
  details: string;
}

export interface SavedTaskState {
  state?: TaskStateName;
  stage?: number;
}

export interface ControlState {
  state: TaskStateName;
  stage: number;
  lastReview: string;
}

export interface Inquiry {
  uid: number;
  text: string;
  contextId: string;
  /** ISO date */
  date: string;
}

export interface ReviewRequest {
  /** ISO date */
  date: string;
  scope: string;
}

export type TabName = "home" | "obligations" | "calendar" | "evidence";

export interface PcState {
  profile: Profile;
  profileSet: boolean;
  /** Date (ISO, Africa/Kampala) the workspace was generated; anchors the occurrence history. */
  anchorDate: string;
  baseline: Record<string, BaselineValue>;
  baselineEvidence: Record<string, unknown>;
  taskStates: Record<string, SavedTaskState>;
  evidence: EvidenceRecord[];
  events: EventRecord[];
  regulatorTasks: RegulatorTask[];
  controlStates: Record<string, ControlState>;
  inquiries: Inquiry[];
  review: ReviewRequest | null;
  activeTab: TabName;
}

export function blankProfile(): Profile {
  return {
    categories: { pso: false, psp: false, instrument: false },
    psoClasses: [],
    pspClasses: [],
    instrumentClasses: [],
    emiBand: "",
    licenceDate: "",
    licenceConditions: "none",
    fiMdi: null,
    safeguard: null,
    agents: null,
    cards: null,
    participant: null,
  };
}

export function defaultState(): PcState {
  return {
    profile: blankProfile(),
    profileSet: false,
    anchorDate: "",
    baseline: {},
    baselineEvidence: {},
    taskStates: {},
    evidence: [],
    events: [],
    regulatorTasks: [],
    controlStates: {},
    inquiries: [],
    review: null,
    activeTab: "home",
  };
}

/** Merge a stored document over the defaults (tolerates missing / partial documents). */
export function normalizeState(raw: unknown): PcState {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<PcState>;
  const bp = blankProfile();
  const rp = (r.profile ?? {}) as Partial<Profile>;
  const profile: Profile = {
    ...bp,
    ...rp,
    categories: { ...bp.categories, ...(rp.categories ?? {}) },
    psoClasses: Array.isArray(rp.psoClasses) ? rp.psoClasses : [],
    pspClasses: Array.isArray(rp.pspClasses) ? rp.pspClasses : [],
    instrumentClasses: Array.isArray(rp.instrumentClasses) ? rp.instrumentClasses : [],
  };
  return {
    ...base,
    ...r,
    profile,
    baseline: r.baseline ?? {},
    baselineEvidence: r.baselineEvidence ?? {},
    taskStates: r.taskStates ?? {},
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
    events: Array.isArray(r.events) ? r.events : [],
    regulatorTasks: Array.isArray(r.regulatorTasks) ? r.regulatorTasks : [],
    controlStates: r.controlStates ?? {},
    inquiries: Array.isArray(r.inquiries) ? r.inquiries : [],
    review: r.review ?? null,
    activeTab: (["home", "obligations", "calendar", "evidence"] as const).includes(r.activeTab as TabName)
      ? (r.activeTab as TabName)
      : "home",
  };
}

// ---------------------------------------------------------------------------
// Dates (ISO strings, Gregorian arithmetic in UTC; no dependence on the host TZ)
// ---------------------------------------------------------------------------

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const KAMPALA_OFFSET_MS = 3 * 3600000;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function parseISO(iso: string): { y: number; m0: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m0: m - 1, d };
}
function utc(iso: string): Date {
  const { y, m0, d } = parseISO(iso);
  return new Date(Date.UTC(y, m0, d));
}
function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function ymd(y: number, m0: number, d: number): string {
  return toISO(new Date(Date.UTC(y, m0, d)));
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const { y, m0, d } = parseISO(iso);
  return `${d} ${MONTHS_SHORT[m0]} ${y}`;
}
export function fmtShort(iso?: string | null): string {
  if (!iso) return "—";
  const { m0, d } = parseISO(iso);
  return `${d} ${MONTHS_SHORT[m0]}`;
}
/** "24 Sept 2026, 9:00" in Africa/Kampala. */
export function fmtDateTime(isoInstant?: string | null): string {
  if (!isoInstant) return "—";
  const t = new Date(new Date(isoInstant).getTime() + KAMPALA_OFFSET_MS);
  return `${t.getUTCDate()} ${MONTHS_SHORT[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${t.getUTCHours()}:${pad2(t.getUTCMinutes())}`;
}
export function kampalaDateISO(isoInstant: string): string {
  return toISO(new Date(new Date(isoInstant).getTime() + KAMPALA_OFFSET_MS));
}
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
}
export function addCalendarDays(iso: string, n: number): string {
  const { y, m0, d } = parseISO(iso);
  return ymd(y, m0, d + n);
}
export function monthEnd(y: number, m0: number): string {
  return ymd(y, m0 + 1, 0);
}
export function monthLabel(y: number, m0: number): string {
  const d = new Date(Date.UTC(y, m0, 1));
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function longDate(iso: string): string {
  const { y, m0, d } = parseISO(iso);
  return `${d} ${MONTHS_LONG[m0]} ${y}`;
}

/**
 * Uganda public holidays (the design lists only the five that fall after its
 * prototype date; this extends it across 2026-2027). Islamic holidays move with
 * the lunar calendar and are the expected dates -- Bank of Uganda confirms them
 * by notice each year.
 */
export const UG_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-26", // NRM Liberation Day
  "2026-02-16", // Archbishop Janani Luwum Day
  "2026-03-08", // International Women's Day
  "2026-03-20", // Eid al-Fitr (expected)
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-01", // Labour Day
  "2026-05-27", // Eid al-Adha (expected)
  "2026-06-03", // Martyrs' Day
  "2026-06-09", // National Heroes' Day
  "2026-10-09", // Independence Day
  "2026-12-25", // Christmas Day
  "2026-12-26", // Boxing Day
  // 2027
  "2027-01-01",
  "2027-01-26",
  "2027-02-16",
  "2027-03-08",
  "2027-03-10", // Eid al-Fitr (expected)
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-01",
  "2027-05-17", // Eid al-Adha (expected)
  "2027-06-03",
  "2027-06-09",
  "2027-10-09",
  "2027-12-25",
  "2027-12-26",
]);

export function addWorkingDays(iso: string, n: number, holidays: ReadonlySet<string> = UG_HOLIDAYS): string {
  let d = utc(iso);
  let count = 0;
  while (count < n) {
    d = new Date(d.getTime() + 86400000);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(toISO(d))) count++;
  }
  return toISO(d);
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface Clock {
  /** Epoch milliseconds of "now". */
  nowMs: number;
  /** Today's date in Africa/Kampala. */
  todayISO: string;
}

export function makeClock(now: Date | string | number = Date.now()): Clock {
  const ms = now instanceof Date ? now.getTime() : typeof now === "number" ? now : new Date(now).getTime();
  return { nowMs: ms, todayISO: toISO(new Date(ms + KAMPALA_OFFSET_MS)) };
}

export function hoursRemaining(isoInstant: string | undefined, clock: Clock): string {
  if (!isoInstant) return "";
  const h = (new Date(isoInstant).getTime() - clock.nowMs) / 3600000;
  if (h <= 0) return "Deadline passed";
  if (h < 48) return `${Math.floor(h)}h ${Math.round((h - Math.floor(h)) * 60)}m remaining`;
  return "";
}

// ---------------------------------------------------------------------------
// Profile / applicability
// ---------------------------------------------------------------------------

export const isEmi = (p: Profile) => p.pspClasses.includes("emi");
export const isPso = (p: Profile) => p.categories.pso;
export const isPsp = (p: Profile) => p.categories.psp;
export const isInstrument = (p: Profile) => p.categories.instrument;

export function isApplicable(e: Entry, p: Profile): boolean {
  const a = e.applies || "";
  if (a === "All NPS licensees") return true;
  if (a.includes("Payment system operator; Payment service provider")) return isPso(p) || isPsp(p);
  if (a === "Payment system operator") return isPso(p);
  if (a === "Payment service provider") return isPsp(p);
  if (a === "Electronic money issuer") return isEmi(p);
  if (a.startsWith("Electronic money issuer;")) return isEmi(p);
  if (a.startsWith("Trust-account EMI")) return isEmi(p) && p.safeguard === "trust";
  if (a.startsWith("Only if the NPS licensee is also an FI/MDI")) return !!p.fiMdi;
  if (a === "Licensee using agents") return !!p.agents;
  if (a === "Licensee with an approved agent programme") return !!p.agents;
  if (a === "Stored-value/prepaid-card route") return !!p.cards;
  if (a === "Payment-system participant") return !!p.participant;
  if (a.startsWith("Payment-system participant /")) return !!p.participant;
  if (a.startsWith("Any licensee proposing services in a different licence category")) return true;
  if (a.startsWith("Payment service provider proposing cross-border")) return isPsp(p);
  return false;
}

export function applicableEntries(p: Profile): Entry[] {
  return ENTRIES.filter((e) => isApplicable(e, p)).filter(
    (e) => e.ui_placement !== "Embedded inside another obligation / workflow",
  );
}

export function profileText(p: Profile): string {
  const bits: string[] = [];
  if (isPso(p)) bits.push("PSO");
  if (isPsp(p)) bits.push(isEmi(p) ? "PSP · EMI" : "PSP");
  if (isInstrument(p)) bits.push("Payment instrument issuer");
  if (p.agents) bits.push("Agents");
  if (p.cards) bits.push("Stored-value/prepaid cards");
  if (p.participant) bits.push("Payment-system participant");
  return bits.join(" · ") || "Payments compliance";
}

/** Step 1 validity: >=1 class under a selected category (+ band when EMI). */
export function licenceComplete(p: Profile): boolean {
  let ok = false;
  if (p.categories.pso && p.psoClasses.length) ok = true;
  if (p.categories.psp && p.pspClasses.length) ok = true;
  if (p.categories.instrument && p.instrumentClasses.length) ok = true;
  if (isEmi(p) && !p.emiBand) ok = false;
  return ok;
}

/** Step 2 validity. */
export function operatingDone(p: Profile): boolean {
  if (p.agents === null || p.cards === null || p.participant === null) return false;
  if (isEmi(p) && (p.fiMdi === null || !p.safeguard)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Occurrence generation
// ---------------------------------------------------------------------------

export interface Task {
  key: string;
  id: string;
  period: string;
  due: string;
  dueDateTime?: string;
  dateType: string;
  state: TaskStateName;
  source: "baseline" | "generated" | "event" | "regulator";
  eventUid?: number;
  customTiming?: string;
}

export interface BaselineItem {
  key: string;
  id: string;
  period: string;
  due: string;
}

interface Occ {
  key: string;
  period: string;
  due: string;
}

const qOf = (m0: number) => Math.floor(m0 / 3) + 1;

/** Monthly occurrences: every period whose due date is on/after the anchor, up to the first one still due today. */
function monthlyOccs(
  anchor: string,
  today: string,
  dueFn: (y: number, m0: number) => string,
  idKey: string,
  periodFn: (label: string) => string,
): Occ[] {
  const a = parseISO(anchor);
  const out: Occ[] = [];
  for (let i = -3; i < 60; i++) {
    const d = new Date(Date.UTC(a.y, a.m0 + i, 1));
    const y = d.getUTCFullYear();
    const m0 = d.getUTCMonth();
    const due = dueFn(y, m0);
    if (due >= anchor) {
      out.push({ key: `${idKey}|${y}-${pad2(m0 + 1)}`, period: periodFn(monthLabel(y, m0)), due });
    }
    if (due >= today) break;
  }
  return out;
}

function quarterlyOccs(
  anchor: string,
  today: string,
  dueFn: (qEnd: string) => string,
  idKey: string,
  periodFn: (qLabel: string) => string,
): Occ[] {
  const a = parseISO(anchor);
  const out: Occ[] = [];
  for (let i = -3; i < 40; i++) {
    const d = new Date(Date.UTC(a.y, a.m0 + i * 3, 1));
    const y = d.getUTCFullYear();
    const q = qOf(d.getUTCMonth());
    const qEnd = monthEnd(y, q * 3 - 1);
    const due = dueFn(qEnd);
    if (due >= anchor) out.push({ key: `${idKey}|${y}-Q${q}`, period: periodFn(`Q${q} ${y}`), due });
    if (due >= today) break;
  }
  return out;
}

function annualOccs(
  anchor: string,
  today: string,
  dueFn: (y: number) => string,
  idKey: string,
  periodFn: (y: number) => string,
): Occ[] {
  const a = parseISO(anchor);
  const out: Occ[] = [];
  for (let y = a.y - 2; y < a.y + 40; y++) {
    const due = dueFn(y);
    if (due >= anchor) out.push({ key: `${idKey}|${y}`, period: periodFn(y), due });
    if (due >= today) break;
  }
  return out;
}

function consumerAwarenessOccs(anchor: string, today: string): Occ[] {
  const a = parseISO(anchor);
  const out: Occ[] = [];
  for (let y = a.y - 1; y < a.y + 20; y++) {
    for (const mm of ["01", "07"]) {
      const due = `${y}-${mm}-15`;
      if (due >= anchor) out.push({ key: `CP-06|${y}-${mm === "07" ? "H1" : "H2"}`, period: "Consumer-awareness report", due });
      if (due >= today) return out;
    }
  }
  return out;
}

const gen17Due = (y: number, m0: number) => addWorkingDays(monthEnd(y, m0), 10);

/**
 * Key baseline items: the occurrence immediately before the one that was current
 * when the workspace was generated (the design lists the 2026 fee, the August
 * return, the August complaints report, Q2 statements and yesterday's EMI
 * reconciliation for its 23 Sep 2026 date).
 */
export function baselineItems(p: Profile, anchor: string): BaselineItem[] {
  const a = parseISO(anchor);
  const items: BaselineItem[] = [];
  // annual fee: year before the first Jan-31 that is on/after the anchor
  const feeYear = anchor <= `${a.y}-01-31` ? a.y - 1 : a.y;
  items.push({ key: `GEN-03|${feeYear}`, id: "GEN-03", period: `${feeYear} annual fee`, due: `${feeYear}-01-31` });
  // monthly return (month-end + 10 working days) and complaints report (+15 days)
  const prevMonth = (dueFn: (y: number, m0: number) => string) => {
    let last: { y: number; m0: number; due: string } | null = null;
    for (let i = -3; i < 6; i++) {
      const d = new Date(Date.UTC(a.y, a.m0 + i, 1));
      const y = d.getUTCFullYear();
      const m0 = d.getUTCMonth();
      const due = dueFn(y, m0);
      if (due >= anchor) return last;
      last = { y, m0, due };
    }
    return last;
  };
  const r = prevMonth(gen17Due);
  if (r) {
    items.push({
      key: `GEN-17|${r.y}-${pad2(r.m0 + 1)}`,
      id: "GEN-17",
      period: `${monthLabel(r.y, r.m0)} return`,
      due: r.due,
    });
  }
  const c = prevMonth((y, m0) => addCalendarDays(monthEnd(y, m0), 15));
  if (c) {
    items.push({
      key: `CP-05|${c.y}-${pad2(c.m0 + 1)}`,
      id: "CP-05",
      period: `${monthLabel(c.y, c.m0)} complaints report`,
      due: c.due,
    });
  }
  // previous quarter's financial statements (quarter-end + 15 days)
  let lastQ: { y: number; q: number; due: string } | null = null;
  for (let i = -3; i < 4; i++) {
    const d = new Date(Date.UTC(a.y, a.m0 + i * 3, 1));
    const y = d.getUTCFullYear();
    const q = qOf(d.getUTCMonth());
    const due = addCalendarDays(monthEnd(y, q * 3 - 1), 15);
    if (due >= anchor) break;
    lastQ = { y, q, due };
  }
  if (lastQ) {
    items.push({
      key: `GEN-18|${lastQ.y}-Q${lastQ.q}`,
      id: "GEN-18",
      period: `Q${lastQ.q} ${lastQ.y} financial statements`,
      due: lastQ.due,
    });
  }
  if (isEmi(p)) {
    const yesterday = addCalendarDays(anchor, -1);
    items.push({
      key: `EMI-12|${yesterday}`,
      id: "EMI-12",
      period: `${longDate(yesterday)} reconciliation`,
      due: yesterday,
    });
  }
  return items.filter((x) => BY_ID[x.id] && isApplicable(BY_ID[x.id], p));
}

export function baselineEvidenceFor(st: PcState, key: string): EvidenceRecord[] {
  return st.evidence.filter((x) => x.taskKey === key);
}

function taskFromBaseline(st: PcState, x: BaselineItem): Task {
  const b = st.baseline[x.key] || "unknown";
  return {
    key: x.key,
    id: x.id,
    period: x.period,
    due: x.due,
    dateType: "Legal due",
    state: b === "completed" ? (baselineEvidenceFor(st, x.key).length ? "complete" : "evidence") : b === "outstanding" ? "overdue" : "confirm",
    source: "baseline",
  };
}

export function anchorOf(st: PcState, clock: Clock): string {
  return st.anchorDate || clock.todayISO;
}

export function recurringTasks(st: PcState, clock: Clock): Task[] {
  const p = st.profile;
  const today = clock.todayISO;
  const anchor = anchorOf(st, clock);
  const t: Task[] = baselineItems(p, anchor).map((x) => taskFromBaseline(st, x));
  const add = (id: string, occs: Occ[], dateType = "Legal due") => {
    if (!BY_ID[id] || !isApplicable(BY_ID[id], p)) return;
    for (const o of occs) {
      const saved = st.taskStates[o.key];
      t.push({ key: o.key, id, period: o.period, due: o.due, dateType, state: saved?.state || "upcoming", source: "generated" });
    }
  };
  add(
    "CP-03",
    quarterlyOccs(anchor, today, (qEnd) => qEnd, "CP-03", (q) => `${q} internal data-security assessment`),
    "Internal review date",
  );
  add(
    "AGT-05",
    monthlyOccs(anchor, today, (y, m0) => addCalendarDays(monthEnd(y, m0), 10), "AGT-05", (m) => `${m} agent report`),
  );
  add("GEN-17", monthlyOccs(anchor, today, gen17Due, "GEN-17", (m) => `${m} return`));
  add(
    "CP-05",
    monthlyOccs(anchor, today, (y, m0) => addCalendarDays(monthEnd(y, m0), 15), "CP-05", (m) => `${m} complaints report`),
  );
  add(
    "GEN-18",
    quarterlyOccs(anchor, today, (qEnd) => addCalendarDays(qEnd, 15), "GEN-18", (q) => `${q} financial statements`),
  );
  add(
    "INS-02",
    monthlyOccs(
      anchor,
      today,
      (y, m0) => addCalendarDays(monthEnd(y, m0), 15),
      "INS-02",
      (m) => `${m} stored-value / prepaid-card return`,
    ),
  );
  add("CP-06", consumerAwarenessOccs(anchor, today));
  add(
    "GEN-03",
    annualOccs(anchor, today, (y) => `${y}-01-31`, "GEN-03", (y) => `${y} annual licence fee`),
  );
  add(
    "GEN-19",
    annualOccs(anchor, today, (y) => `${y + 1}-03-30`, "GEN-19", (y) => `${y} audited financial statements`),
  );
  add(
    "GEN-20",
    annualOccs(anchor, today, (y) => `${y + 1}-03-30`, "GEN-20", (y) => `${y} payment-system / platform audit report`),
  );
  add(
    "GEN-21",
    annualOccs(anchor, today, (y) => `${y + 1}-04-30`, "GEN-21", (y) => `Publish ${y} audited financial statements`),
  );
  if (isEmi(p)) {
    add("EMI-12", [{ key: `EMI-12|${today}`, period: `${fmtDate(today)} e-money reconciliation`, due: today }]);
  }
  return t;
}

export function eventTaskKey(eventUid: number, obligationId: string): string {
  return `EVT|${eventUid}|${obligationId}`;
}

export function eventTasks(st: PcState): Task[] {
  const t: Task[] = [];
  st.events.forEach((ev) => {
    (ev.actions || []).forEach((a) => {
      const key = eventTaskKey(ev.uid, a.id);
      const saved = st.taskStates[key];
      t.push({
        key,
        id: a.id,
        period: ev.label,
        due: a.due || "",
        dueDateTime: a.dueDateTime || "",
        dateType: a.dateType || "Legal timing",
        state: saved?.state || "action",
        source: "event",
        eventUid: ev.uid,
        customTiming: a.timing || "",
      });
    });
  });
  st.regulatorTasks.forEach((rt) => {
    const key = `REG|${rt.uid}`;
    const saved = st.taskStates[key];
    t.push({
      key,
      id: "GEN-02",
      period: rt.title,
      due: rt.due,
      dateType: "BoU deadline",
      state: saved?.state || "action",
      source: "regulator",
      customTiming: rt.details || "",
    });
  });
  return t;
}

export function allTasks(st: PcState, clock: Clock): Task[] {
  return [...recurringTasks(st, clock), ...eventTasks(st)].map((x) => {
    const saved = st.taskStates[x.key];
    if (saved?.state) x.state = saved.state;
    if (x.state === "upcoming" && x.due && x.due < clock.todayISO) x.state = "overdue";
    if (["action", "upcoming"].includes(x.state) && x.dueDateTime && new Date(x.dueDateTime).getTime() < clock.nowMs) {
      x.state = "overdue";
    }
    return x;
  });
}

// ---------------------------------------------------------------------------
// Status model
// ---------------------------------------------------------------------------

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    overdue: "Overdue",
    confirm: "Needs confirmation",
    evidence: "Evidence needed",
    controlreview: "Needs baseline review",
    upcoming: "Upcoming",
    // `due` is what the design stores for a control whose review is under way
    // (it rendered as a raw lower-case "due"); show it as "Upcoming".
    due: "Upcoming",
    action: "Action required",
    preparing: "Preparing",
    review: "Internal review",
    submitted: "Submitted",
    waiting: "Awaiting response",
    complete: "Complete",
    current: "Current evidence on file",
    asneeded: "Needs baseline review",
  };
  return map[s] ?? s;
}

export function stateClass(s: string): string {
  if (["overdue", "action"].includes(s)) return s === "overdue" ? "overdue" : "action";
  if (["confirm", "controlreview", "evidence"].includes(s)) return s === "evidence" ? "evidence" : s === "controlreview" ? "controlreview" : "confirm";
  if (["submitted", "waiting"].includes(s)) return "waiting";
  if (["complete", "current"].includes(s)) return "complete";
  if (["upcoming", "preparing", "review", "due"].includes(s)) return "due";
  return "asneeded";
}

const CONTROL_TYPE_RE = /Continuous|control|Transaction|Governance|Retention|Service-level|programme/i;

export function currentStateForEntry(e: Entry, tasks: Task[], st: PcState): string {
  const mine = tasks.filter((t) => t.id === e.id);
  if (mine.some((t) => ["overdue", "action"].includes(t.state))) return "action";
  if (mine.some((t) => t.state === "confirm")) return "confirm";
  if (mine.some((t) => ["submitted", "waiting"].includes(t.state))) return "waiting";
  if (mine.some((t) => ["upcoming", "preparing", "review"].includes(t.state))) return "due";
  if (mine.length && mine.every((t) => t.state === "complete")) return "complete";
  if (CONTROL_TYPE_RE.test(e.type)) {
    return st.controlStates[e.id]?.state || "controlreview";
  }
  return "asneeded";
}

export function taskTiming(t: Task, clock: Clock): string {
  if (t.dueDateTime) {
    const c = hoursRemaining(t.dueDateTime, clock);
    return `${t.dateType}: ${fmtDateTime(t.dueDateTime)}${c ? ` · ${c}` : ""}`;
  }
  if (t.due) return `${t.dateType}: ${fmtDate(t.due)}`;
  return t.customTiming || BY_ID[t.id]?.when || "";
}

// ---------------------------------------------------------------------------
// Workflows & evidence rules
// ---------------------------------------------------------------------------

export function workflowFor(e: Entry): string[] {
  const typ = e.type.toLowerCase();
  if (typ.includes("prior approval") || e.id === "GEN-12" || e.id === "GEN-13" || e.id === "GEN-14")
    return ["Preparing request", "Submitted to BoU", "Awaiting BoU", "Approved"];
  if (typ.includes("prior notice")) return ["Preparing notice", "Notice sent", "Evidence recorded", "Complete"];
  if (typ.includes("regulatory return") || typ.includes("filing/payment") || typ.includes("public disclosure"))
    return ["Preparing", "Internal review", "Submitted / action completed", "Evidence recorded"];
  if (typ.includes("event-driven notification") || typ === "event-driven")
    return ["Action required", "Preparing response", "Notified / responded", "Follow-up closed"];
  if (typ.includes("regulator-set")) return ["Open", "In progress", "Submitted / action taken", "Closed"];
  if (
    typ.includes("continuous") ||
    typ.includes("control") ||
    typ.includes("transaction") ||
    typ.includes("retention") ||
    typ.includes("service-level") ||
    typ.includes("governance")
  )
    return ["Review control", "Record evidence", "Resolve exception if any", "Current"];
  return ["Open", "In progress", "Evidence recorded", "Complete"];
}

const STAGE_BY_STATE: Record<string, number> = {
  overdue: 0,
  confirm: 0,
  upcoming: 0,
  action: 0,
  preparing: 1,
  review: 1,
  submitted: 2,
  waiting: 2,
  complete: 3,
  current: 3,
};

export function workflowStage(task: Task | null, e: Entry, st: PcState): number {
  if (task) {
    const saved = st.taskStates[task.key] || {};
    return STAGE_BY_STATE[saved.state || task.state] ?? 0;
  }
  return st.controlStates[e.id]?.stage || 0;
}

/**
 * Evidence rows that count for a piece of work. The design matched
 * `taskKey === ""` for occurrence-less work, which leaked every other
 * obligation's general evidence into it; here control work only sees evidence
 * recorded against that obligation.
 */
export function evidenceFor(st: PcState, task: Task | null, e: Entry): EvidenceRecord[] {
  if (task) return st.evidence.filter((x) => x.taskKey === task.key);
  return st.evidence.filter((x) => x.obligationId === e.id);
}

export function evidenceTypeOptions(e: Entry): string[] {
  const typ = e.type.toLowerCase();
  const opts: string[] = [];
  if (typ.includes("prior approval")) opts.push("BoU written approval", "BoU submission / acknowledgement", "Supporting application record");
  else if (typ.includes("prior notice")) opts.push("Notice / publication evidence", "Submission / receipt", "Supporting record");
  else if (typ.includes("filing/payment")) opts.push("Payment evidence", "Submission / receipt", "Supporting record");
  else if (typ.includes("public disclosure")) opts.push("Publication evidence", "Supporting record");
  else if (typ.includes("event-driven notification") || typ === "event-driven")
    opts.push("Notification / submission evidence", "BoU acknowledgement / response", "Follow-up record");
  else if (typ.includes("regulatory return"))
    opts.push("Submission / receipt", "BoU acknowledgement / response", "Source reconciliation / supporting record");
  else opts.push("Control evidence", "BoU approval / acknowledgement", "Submission / receipt", "Other supporting record");
  return [...new Set(opts)];
}

export function completionEvidenceSatisfied(st: PcState, task: Task | null, e: Entry): boolean {
  const ev = evidenceFor(st, task, e);
  const typ = e.type.toLowerCase();
  if (typ.includes("prior approval")) return ev.some((x) => x.type === "BoU written approval");
  if (typ.includes("prior notice")) return ev.some((x) => x.type === "Notice / publication evidence" || x.type === "Submission / receipt");
  if (typ.includes("filing/payment")) return ev.some((x) => x.type === "Payment evidence" || x.type === "Submission / receipt");
  if (typ.includes("public disclosure")) return ev.some((x) => x.type === "Publication evidence");
  if (typ.includes("regulatory return")) return ev.some((x) => x.type === "Submission / receipt");
  if (typ.includes("event-driven notification") || typ === "event-driven")
    return ev.some((x) => x.type === "Notification / submission evidence");
  return ev.length > 0;
}

/** Wording of the "before closing this workflow" alert. */
export function neededEvidenceWording(e: Entry): string {
  const typ = e.type.toLowerCase();
  return typ.includes("prior approval")
    ? "a BoU written approval"
    : typ.includes("filing/payment")
      ? "payment or submission evidence"
      : typ.includes("public disclosure")
        ? "publication evidence"
        : "the required completion evidence";
}

export function nextStepLabel(e: Entry, stage: number): string {
  const steps = workflowFor(e);
  if (stage === 0) return `Start: ${steps[1] || "work"}`;
  if (stage === 1) return `Mark: ${steps[2] || "next"}`;
  return `Complete: ${steps[3] || "workflow"}`;
}

/** Returns the new state document with the workflow advanced to `newStage`. */
export function advanceWork(st: PcState, task: Task | null, e: Entry, newStage: number, clock: Clock): PcState {
  const typ = e.type.toLowerCase();
  if (task) {
    let s: TaskStateName = "preparing";
    if (newStage === 2) s = typ.includes("prior approval") || typ.includes("regulator-set") ? "waiting" : "submitted";
    if (newStage >= 3) s = typ.includes("continuous") || typ.includes("control") ? "current" : "complete";
    return { ...st, taskStates: { ...st.taskStates, [task.key]: { ...(st.taskStates[task.key] || {}), state: s, stage: newStage } } };
  }
  return {
    ...st,
    controlStates: {
      ...st.controlStates,
      [e.id]: { state: newStage >= 3 ? "current" : "due", stage: newStage, lastReview: clock.todayISO },
    },
  };
}

// ---------------------------------------------------------------------------
// Obligation lists: grouping, filters
// ---------------------------------------------------------------------------

export const OP_GROUP_ORDER = [
  "Regulatory reporting & payments",
  "Licence & corporate changes",
  "Safeguarding, capital & settlement",
  "Consumer protection",
  "Operations, technology & records",
  "Agents",
  "Payment-system operations",
];

export function operationalGroup(e: Entry): string {
  const typ = (e.type || "").toLowerCase();
  const g = e.group || "";
  const r = (e.requirement || "").toLowerCase();
  if (
    /return|filing\/payment|public disclosure/.test(typ) ||
    ["GEN-03", "GEN-17", "GEN-18", "GEN-19", "GEN-20", "GEN-21", "CP-05", "CP-06"].includes(e.id)
  )
    return "Regulatory reporting & payments";
  if (
    ["GEN-08", "GEN-11", "GEN-12", "GEN-13", "GEN-14", "NEW-01", "NEW-02"].includes(e.id) ||
    /corporate change|licence/.test(g.toLowerCase())
  )
    return "Licence & corporate changes";
  if (/capital|trust|special account|liquid|settlement|collateral|safeguard/.test(r + " " + g.toLowerCase()))
    return "Safeguarding, capital & settlement";
  if (g === "Consumer protection") return "Consumer protection";
  if (g === "Agents") return "Agents";
  if (g === "Payment-system / participant" || g === "Payment system / participant") return "Payment-system operations";
  return "Operations, technology & records";
}

export type ObFilter = "all" | "reporting" | "approvals" | "controls" | "consumer" | "agents";
export type ObStateFilter = "all" | "overdue" | "confirm" | "waiting";
export type CalFilter = "all" | "attention" | "upcoming" | "complete";

export function productFilter(e: Entry, f: ObFilter): boolean {
  if (f === "all") return true;
  if (f === "reporting") return /return|filing|payment|public disclosure/i.test(e.type);
  if (f === "approvals") return /approval|notice|event-driven notification|regulator-set/i.test(e.type);
  if (f === "controls") return /continuous|control|transaction|retention|governance|service-level/i.test(e.type);
  if (f === "consumer") return e.group === "Consumer protection";
  if (f === "agents") return e.group === "Agents";
  return true;
}

export function filterObligations(
  st: PcState,
  tasks: Task[],
  filter: ObFilter,
  stateFilter: ObStateFilter,
  query: string,
): Entry[] {
  const q = query.toLowerCase();
  let entries = applicableEntries(st.profile)
    .filter((e) => productFilter(e, filter))
    .filter((e) => (e.requirement + " " + e.group + " " + e.meaning).toLowerCase().includes(q));
  if (stateFilter !== "all") {
    entries = entries.filter((e) => {
      const s = currentStateForEntry(e, tasks, st);
      if (stateFilter === "overdue") return tasks.some((t) => t.id === e.id && t.state === "overdue");
      if (stateFilter === "confirm") return tasks.some((t) => t.id === e.id && ["confirm", "evidence"].includes(t.state));
      if (stateFilter === "waiting") return s === "waiting";
      return true;
    });
  }
  return entries.sort((a, b) => {
    const ga = OP_GROUP_ORDER.indexOf(operationalGroup(a));
    const gb = OP_GROUP_ORDER.indexOf(operationalGroup(b));
    return ga - gb || a.requirement.localeCompare(b.requirement);
  });
}

export function filterCalendar(tasks: Task[], filter: CalFilter, query: string): Task[] {
  const q = query.toLowerCase();
  return tasks
    .filter((t) => t.due)
    .filter((t) => {
      if (filter === "attention") return ["overdue", "action", "confirm", "evidence"].includes(t.state);
      if (filter === "upcoming") return ["upcoming", "preparing", "review"].includes(t.state);
      if (filter === "complete") return t.state === "complete";
      return true;
    })
    .filter((t) => ((BY_ID[t.id]?.requirement || "") + " " + t.period).toLowerCase().includes(q))
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export interface HomeSummary {
  attention: Task[];
  upcoming: Task[];
  waiting: Task[];
  overdue: number;
  confirm: number;
  dueSoon: number;
}

export function homeSummary(tasks: Task[], clock: Clock): HomeSummary {
  const today = clock.todayISO;
  const attention = tasks.filter((t) => ["overdue", "action", "confirm", "evidence"].includes(t.state));
  const upcoming = tasks
    .filter(
      (t) =>
        ["upcoming", "preparing", "review"].includes(t.state) &&
        t.due &&
        daysBetween(today, t.due) >= 0 &&
        daysBetween(today, t.due) <= 45,
    )
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const waiting = tasks.filter((t) => ["submitted", "waiting"].includes(t.state));
  return {
    attention,
    upcoming,
    waiting,
    overdue: tasks.filter((t) => t.state === "overdue").length,
    confirm: tasks.filter((t) => ["confirm", "evidence"].includes(t.state)).length,
    dueSoon: upcoming.length,
  };
}

export const PREFERRED_CONTROLS = ["GEN-10", "GEN-15", "CP-01", "CP-03", "EMI-10", "EMI-18", "AGT-04", "PSO-04"];

export function controlsToReview(st: PcState): string[] {
  return PREFERRED_CONTROLS.filter((id) => BY_ID[id] && isApplicable(BY_ID[id], st.profile))
    .filter((id) => st.controlStates[id]?.state !== "current")
    .slice(0, 4);
}

/** Add-evidence drawer: occurrences of an obligation, newest first. */
export function occurrenceOptionsFor(id: string, tasks: Task[]): { value: string; label: string }[] {
  const e = BY_ID[id];
  const list = tasks.filter((t) => t.id === id).sort((a, b) => (b.due || "").localeCompare(a.due || ""));
  const recurring = /return|filing\/payment|public disclosure|event-driven notification/i.test(e.type);
  const opts = list.map((t) => ({ value: t.key, label: `${t.period} · ${statusLabel(t.state)}` }));
  if (!recurring) opts.unshift({ value: "", label: "General obligation / control evidence" });
  return opts.length ? opts : [{ value: "", label: "General obligation / control evidence" }];
}

// ---------------------------------------------------------------------------
// Change / event consequences
// ---------------------------------------------------------------------------

export const EVENT_TYPES: { key: string; title: string; hint: string }[] = [
  { key: "outage", title: "Outage, security incident or fraud issue", hint: "Something affected service safety, security or availability." },
  { key: "director", title: "Director / manager / trustee / shareholder change", hint: "A key licence person or address is changing." },
  { key: "outsourcing", title: "New outsourcing arrangement", hint: "Licensed service, core operation or technical personnel." },
  { key: "branch", title: "Open a branch or create a subsidiary", hint: "In Uganda or outside Uganda." },
  { key: "fee", title: "Increase a customer fee or charge", hint: "A fee change that will affect existing customers." },
  { key: "maintenance", title: "Planned service maintenance", hint: "Service channels will be temporarily unavailable." },
  { key: "records", title: "Destroy payment records", hint: "Records have reached the retention threshold." },
  { key: "crossborder", title: "Offer cross-border payment services", hint: "A new cross-border service or payment system." },
  { key: "agents", title: "Launch or change an agent programme", hint: "New agent network or material programme change." },
  { key: "cessation", title: "Cease the licensed business", hint: "Planned closure of the regulated business." },
  { key: "newcategory", title: "Offer services in a different licence category", hint: "A new regulated service outside the current category." },
  { key: "insolvency", title: "Insolvency proceedings started", hint: "A payment-system participant has been served with an insolvency petition." },
  { key: "other", title: "Something else / I’m not sure", hint: "Describe the change and get help identifying what it triggers." },
];

export interface EventDraft {
  uid: number | null;
  type: string;
  date: string;
  time: string;
  label: string;
}

export function eventActions(d: EventDraft, p: Profile, clock: Clock): EventAction[] {
  const actions: EventAction[] = [];
  const date = d.date || clock.todayISO;
  const minusDays = (iso: string, n: number) => addCalendarDays(iso, -n);
  const instant = (hours: number) => {
    const start = new Date(`${date}T${d.time || "09:00"}:00+03:00`);
    return new Date(start.getTime() + hours * 3600000).toISOString();
  };
  if (d.type === "outage") {
    if (isEmi(p)) {
      const dueDT = instant(24);
      actions.push({
        id: "EMI-16",
        due: kampalaDateISO(dueDT),
        dueDateTime: dueDT,
        dateType: "24-hour notification deadline",
        timing: "No later than 24 hours after occurrence",
      });
    }
    actions.push({ id: "CP-11", due: date, dateType: "Immediate action", timing: "Communicate an unplanned outage without delay" });
  }
  if (d.type === "director")
    actions.push({ id: "GEN-11", due: date, dateType: "Before effective date", timing: "BoU approval before the change takes effect" });
  if (d.type === "outsourcing") actions.push({ id: "GEN-13", due: date, dateType: "Before outsourcing starts" });
  if (d.type === "branch") actions.push({ id: "GEN-14", due: date, dateType: "Before operation" });
  if (d.type === "fee")
    actions.push({ id: "CP-09", due: minusDays(date, 30), dateType: "Customer notice deadline", timing: "At least 30 days before the fee increase" });
  if (d.type === "maintenance")
    actions.push({ id: "CP-10", due: minusDays(date, 2), dateType: "Customer notice deadline", timing: "At least 48 hours before planned maintenance" });
  if (d.type === "records") actions.push({ id: "GEN-24", due: date, dateType: "Before destruction" });
  if (d.type === "crossborder" && isPsp(p)) actions.push({ id: "NEW-02", due: date, dateType: "Before launch" });
  if (d.type === "agents")
    actions.push({ id: p.agents ? "NEW-03" : "AGT-01", due: date, dateType: "Before programme/change takes effect" });
  if (d.type === "cessation")
    actions.push({ id: "GEN-08", due: minusDays(date, 30), dateType: "Notice deadline", timing: "At least 30 days before cessation" });
  if (d.type === "newcategory") actions.push({ id: "NEW-01", due: date, dateType: "Before new service begins" });
  if (d.type === "insolvency" && p.participant) {
    const dueDT = instant(2);
    actions.push({
      id: "PSO-09",
      due: kampalaDateISO(dueDT),
      dueDateTime: dueDT,
      dateType: "2-hour notification deadline",
      timing: "Immediately and in any case not more than 2 hours after service",
    });
  }
  return actions.filter((a) => BY_ID[a.id] && isApplicable(BY_ID[a.id], p));
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

export const SAMPLE_PROFILE = (): Profile => {
  const p = blankProfile();
  p.categories.psp = true;
  p.pspClasses = ["emi"];
  p.emiBand = "medium2";
  p.licenceDate = "2024-04-15";
  return p;
};

/** Sample baseline answers by obligation id (the design keys them by item key for its fixed date). */
export function sampleHistoryFor(items: BaselineItem[]): Record<string, BaselineValue> {
  const byId: Record<string, BaselineValue> = {
    "GEN-03": "completed",
    "GEN-17": "outstanding",
    "CP-05": "completed",
    "GEN-18": "unknown",
    "EMI-12": "completed",
  };
  const out: Record<string, BaselineValue> = {};
  items.forEach((x) => (out[x.key] = byId[x.id] || "unknown"));
  return out;
}
