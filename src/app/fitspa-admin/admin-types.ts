// FITSPA Admin (demonstration) — data model.
//
// One generic shape serves every regulator programme (Payments, Digital lending, Insurance and any
// regulator FITSPA adds later). Everything a member or visitor sees in Apply, Comply, Documents and
// the AI assistant is described by this admin-entered data: no developer work per regulator.

export type Audience = "public" | "members" | "staff";

export interface Regulator {
  id: string;
  name: string;
  short: string;
  sector: string;
  status: "active" | "draft";
  website: string; // allowlisted domain for the assistant's regulator-site search
  acronyms: string; // "UMRA = Uganda Microfinance Regulatory Authority; ..." used to expand assistant queries
  contact: string;
  notes: string;
}

export interface Question {
  key: string;
  label: string;
  help: string;
  // yesno -> yes/no ; yesnomaybe -> yes/no/not-sure ; single -> the listed options
  kind: "yesno" | "yesnomaybe" | "single";
  options: { value: string; label: string }[];
}

export interface Cond {
  q: string; // question key
  is: string; // the answer that must be given
}

/** How an "applies to" audience label decides, for one member profile, whether an obligation applies. */
export interface Rule {
  mode: "always" | "all" | "any" | "never";
  conds: Cond[];
}

export interface ApplyFee {
  type: "application" | "licensing" | "annual";
  amount: number;
}

export interface ApplyClass {
  key: string;
  label: string;
  minCapital: number | null;
  fees: ApplyFee[];
}

export interface Requirement {
  id: string;
  phase: string;
  title: string;
  drawer: string; // which generic upload / form screen the member gets
  route: string; // "" = every route
  guidance: string;
  mandatory: boolean;
}

export interface Obligation {
  key: string;
  id: string;
  title: string;
  group: string;
  type: string;
  source: string;
  guidance: string;
  evidence: string;
  applies: string; // audience label: looked up in the programme's rules
  due: string; // ISO date set by FITSPA, "" when none
  status: "active" | "retired";
  custom: boolean;
  edited: boolean;
}

export interface EventDef {
  id: string;
  title: string;
  desc: string;
  obligationIds: string[];
  needs: Cond[]; // every condition must hold for the event to be offered to a member ([] = always offered)
}

export interface ControlDef {
  id: string;
  title: string;
  obligationIds: string[];
}

export interface Programme {
  id: string;
  regulatorId: string;
  name: string;
  blurb: string;
  status: "draft" | "published";
  phases: string[];
  classes: ApplyClass[];
  requirements: Requirement[];
  questions: Question[];
  rules: Record<string, Rule>; // audience label -> rule
  obligations: Obligation[];
  events: EventDef[];
  controls: ControlDef[];
  // The member's own screens exist for these two modules; generic = driven by the data above.
  screens: "dedicated" | "generic";
}

export interface DocItem {
  id: string;
  regulatorId: string;
  programmeId: string; // "" = regulator-wide
  title: string;
  kind: string;
  audience: Audience;
  fileName: string;
  sizeKb: number;
  status: "uploaded" | "indexing" | "indexed";
  chunks?: number; // passages created when the file is indexed for the assistant
  inAssistant: boolean;
  text: string; // searchable text the assistant retrieves from (sample for the demonstration)
  addedAt: string;
}

export interface AiSettings {
  enabled: boolean;
  visitors: boolean; // visitors without an account may ask the assistant
  members: boolean;
  useDocuments: boolean;
  useWeb: boolean; // regulator-site search on every question
  disclaimer: string;
}

export interface Member {
  id: string;
  name: string;
  programmeId: string;
  facts: Record<string, string>; // question key -> answer
  done: number;
  overdue: number;
  lastActive: string;
}

export interface LogEntry {
  at: string;
  text: string;
}

export interface AdminState {
  regulators: Regulator[];
  programmes: Programme[];
  documents: DocItem[];
  ai: AiSettings;
  members: Member[];
  log: LogEntry[];
}

export type Section = "overview" | "regulators" | "apply" | "comply" | "docsai" | "members" | "publish" | "activity";
