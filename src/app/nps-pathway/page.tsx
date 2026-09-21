import { createClient } from "@/lib/supabase/server";
import NpsPathwayClient, { type NpsItem, type NpsFeeTier } from "./nps-pathway-client";
import type { PathwayFee, PathwayRegulator, PathwayRequirement } from "@/lib/types";

export const metadata = {
  title: "NPS Licence Pathway — FITSPA Compliance Platform",
  description:
    "Bank of Uganda National Payment Systems Act licence pathway — a phase-by-phase requirements map with fees and minimum capital for your route.",
};

// Adapters: `pathway_requirements`/`pathway_fees` (the new generic,
// admin-extensible tables, canonical going forward) back into the exact flat
// shape NpsPathwayClient already expects, so that 1000+ line component needs
// zero changes to its core logic. See PathwayRequirement/PathwayFee in
// src/lib/types.ts for the source shape.
function toNpsItem(row: PathwayRequirement): NpsItem {
  const a = (row.applicability ?? {}) as Record<string, string>;
  return {
    id: row.external_id,
    seq: row.seq,
    phase: row.phase,
    type: row.item_type ?? "",
    requirement: row.requirement,
    meaning: row.meaning ?? "",
    pso: (a.PSO as NpsItem["pso"]) ?? "No",
    psp_other: (a.PSP_OTHER as NpsItem["psp_other"]) ?? "No",
    psp_emi: (a.PSP_EMI as NpsItem["psp_emi"]) ?? "No",
    instrument: (a.INSTRUMENT as NpsItem["instrument"]) ?? "No",
    timing: row.timing,
    evidence: row.evidence,
    level: row.level,
    source: row.source,
    source_link: row.source_link,
    condition: row.condition,
  };
}

function toNpsFeeTier(row: PathwayFee): NpsFeeTier {
  return {
    id: row.id,
    sort_order: row.sort_order,
    category: row.category ?? "",
    class: row.class ?? "",
    threshold: row.threshold ?? "",
    application_fee: Number(row.application_fee ?? 0),
    licensing_fee: Number(row.licensing_fee ?? 0),
    annual_fee: Number(row.annual_fee ?? 0),
    min_capital: Number(row.min_capital ?? 0),
  };
}

export default async function NpsPathwayPage() {
  const supabase = await createClient();
  const [{ data: items }, { data: fees }, { data: regulator }, { data: { user } }] = await Promise.all([
    supabase.from("pathway_requirements").select("*").eq("pathway_key", "nps").order("seq"),
    supabase.from("pathway_fees").select("*").eq("pathway_key", "nps").order("sort_order"),
    supabase.from("pathway_regulators").select("*").eq("key", "nps").maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const reg = regulator as PathwayRegulator | null;

  return (
    <NpsPathwayClient
      items={((items ?? []) as PathwayRequirement[]).map(toNpsItem)}
      fees={((fees ?? []) as PathwayFee[]).map(toNpsFeeTier)}
      isLoggedIn={!!user}
      copy={
        reg
          ? {
              heroStats: reg.hero_stats,
              wizardTitle: reg.wizard_title,
              wizardNote: reg.wizard_note,
              routesHeading: reg.routes_heading,
              routesNote: reg.routes_note,
              feesNote: reg.fees_note,
            }
          : undefined
      }
    />
  );
}
