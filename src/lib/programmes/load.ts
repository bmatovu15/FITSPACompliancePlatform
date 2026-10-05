// Server-side loaders. They use the signed-in user's Supabase session, so row level security decides what
// is visible: everyone sees published programmes, staff also see drafts.
import { createClient } from "@/lib/supabase/server";
import type {
  ControlRow, EventRow, ObligationRow, ProgrammeData, ProgrammeRow, Question, RegulatorRow, Rule,
} from "./types";

const REG_COLS = "id,name,short_name,sector,status,website,acronyms,notes";

export async function listProgrammes(opts: { publishedOnly?: boolean } = {}): Promise<(ProgrammeRow & { regulator: RegulatorRow | null })[]> {
  const supabase = await createClient();
  let q = supabase.from("prog_programmes").select("*").order("sort_order").order("name");
  if (opts.publishedOnly) q = q.eq("status", "published");
  const { data: progs } = await q;
  const rows = (progs ?? []) as ProgrammeRow[];
  if (!rows.length) return [];
  const { data: regs } = await supabase.from("regulators").select(REG_COLS).in("id", Array.from(new Set(rows.map((r) => r.regulator_id))));
  const byId = new Map(((regs ?? []) as RegulatorRow[]).map((r) => [r.id, r]));
  return rows.map((r) => ({ ...r, regulator: byId.get(r.regulator_id) ?? null }));
}

export async function loadProgramme(id: string): Promise<ProgrammeData | null> {
  const supabase = await createClient();
  const { data: programme } = await supabase.from("prog_programmes").select("*").eq("id", id).maybeSingle();
  if (!programme) return null;
  const [reg, qs, auds, obs, evs, ctls] = await Promise.all([
    supabase.from("regulators").select(REG_COLS).eq("id", (programme as ProgrammeRow).regulator_id).maybeSingle(),
    supabase.from("prog_questions").select("*").eq("programme_id", id).order("sort_order"),
    supabase.from("prog_audiences").select("*").eq("programme_id", id),
    supabase.from("prog_obligations").select("*").eq("programme_id", id).order("sort_order"),
    supabase.from("prog_events").select("*").eq("programme_id", id).order("sort_order"),
    supabase.from("prog_controls").select("*").eq("programme_id", id).order("sort_order"),
  ]);
  const rules: Record<string, Rule> = {};
  for (const a of (auds.data ?? []) as { label: string; mode: Rule["mode"]; conds: Rule["conds"] }[]) {
    rules[a.label] = { mode: a.mode, conds: a.conds ?? [] };
  }
  return {
    programme: programme as ProgrammeRow,
    regulator: (reg.data as RegulatorRow | null) ?? null,
    questions: (qs.data ?? []) as Question[],
    rules,
    obligations: (obs.data ?? []) as ObligationRow[],
    events: (evs.data ?? []) as EventRow[],
    controls: (ctls.data ?? []) as ControlRow[],
  };
}

export interface ApplyClassRow {
  class_key: string;
  label: string;
  description: string | null;
  min_capital: number | null;
  sort_order: number;
  fees: { fee_type: string; amount: number; note: string | null }[];
}

export interface ApplyTemplateRow {
  id: string;
  external_id: string | null;
  phase: string;
  seq: number;
  title: string;
  copy: string | null;
  drawer_type: string;
  route_key: string | null;
  guide_what: string | null;
  guide_do: string | null;
  guide_evidence: string | null;
  source_label: string | null;
  source_url: string | null;
  workspace_hidden: boolean | null;
}

/** Classes with their fees, for the generic Apply screen and the admin editor. */
export async function loadApplyClasses(applicationKey: string): Promise<ApplyClassRow[]> {
  const supabase = await createClient();
  const [cls, fees] = await Promise.all([
    supabase.from("licence_application_wizard_classes").select("class_key,label,description,min_capital,sort_order").eq("application_key", applicationKey).order("sort_order"),
    supabase.from("licence_application_fee_tiers").select("class_key,fee_type,amount,note").eq("application_key", applicationKey).order("sort_order"),
  ]);
  const feeRows = (fees.data ?? []) as { class_key: string; fee_type: string; amount: number; note: string | null }[];
  return ((cls.data ?? []) as Omit<ApplyClassRow, "fees">[]).map((c) => ({
    ...c,
    min_capital: c.min_capital == null ? null : Number(c.min_capital),
    fees: feeRows.filter((f) => f.class_key === c.class_key).map((f) => ({ fee_type: f.fee_type, amount: Number(f.amount), note: f.note })),
  }));
}

export async function loadApplyTemplates(applicationKey: string): Promise<ApplyTemplateRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("licence_application_templates")
    .select("id,external_id,phase,seq,title,copy,drawer_type,route_key,guide_what,guide_do,guide_evidence,source_label,source_url,workspace_hidden")
    .eq("application_key", applicationKey)
    .order("phase")
    .order("seq");
  return (data ?? []) as ApplyTemplateRow[];
}

/** Counts used by the readiness checklist. */
export async function loadReadinessCounts(p: ProgrammeRow) {
  const supabase = await createClient();
  const key = p.application_key;
  const classes = key ? await loadApplyClasses(key) : [];
  const templates = key ? await loadApplyTemplates(key) : [];
  const { data: docs } = await supabase.from("documents").select("id,index_status,status").eq("regulator_id", p.regulator_id);
  const documents = (docs ?? []) as { id: string; index_status: string | null; status: string | null }[];
  return {
    classCount: classes.length,
    classesWithoutApplicationFee: classes.filter((c) => !c.fees.some((f) => f.fee_type === "application")).length,
    requirementCount: templates.length,
    requirementPhases: new Set(templates.map((t) => t.phase)).size,
    documentCount: documents.length,
    indexedDocumentCount: documents.filter((d) => d.index_status === "Indexed" || d.index_status === "indexed").length,
  };
}
