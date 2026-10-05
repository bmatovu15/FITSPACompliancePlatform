// Regulator programmes read from the database (tables prog_*). One shape serves every regulator, so a
// new regulator added by FITSPA staff needs no developer work: Comply and Apply screens render from this data.

export interface Cond {
  q: string; // profile question key
  is: string; // the answer that must be given
}

/** How an "applies to" audience label decides, for one member profile, whether an obligation applies. */
export interface Rule {
  mode: "always" | "all" | "any" | "never";
  conds: Cond[];
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  key: string;
  label: string;
  help: string;
  kind: "yesno" | "yesnomaybe" | "single";
  options: QuestionOption[];
  sort_order: number;
}

export interface ObligationRow {
  id: string;
  ref: string;
  title: string;
  grp: string;
  obligation_type: string;
  source: string;
  guidance: string;
  evidence: string;
  applies: string; // audience label, looked up in the programme's rules
  due_date: string | null;
  status: "active" | "retired";
  sort_order: number;
  extra: Record<string, unknown>;
}

export interface EventRow {
  id: string;
  title: string;
  description: string;
  obligation_refs: string[];
  needs: Cond[]; // every condition must hold for the event to be offered ([] = always)
  sort_order: number;
  extra: Record<string, unknown>;
}

export interface ControlRow {
  id: string;
  title: string;
  obligation_refs: string[];
  sort_order: number;
}

export interface ProgrammeRow {
  id: string;
  regulator_id: string;
  name: string;
  blurb: string;
  application_key: string | null;
  screens: "dedicated" | "generic";
  route: string | null;
  status: "draft" | "published";
  phases: string[];
  sort_order: number;
}

export interface RegulatorRow {
  id: string;
  name: string;
  short_name: string;
  sector: string | null;
  status: string;
  website: string;
  acronyms: string;
  notes: string | null;
}

export interface ProgrammeData {
  programme: ProgrammeRow;
  regulator: RegulatorRow | null;
  questions: Question[];
  rules: Record<string, Rule>;
  obligations: ObligationRow[];
  events: EventRow[];
  controls: ControlRow[];
}

export type Facts = Record<string, string>;
