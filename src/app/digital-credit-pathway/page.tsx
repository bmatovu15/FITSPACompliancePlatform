import { createClient } from "@/lib/supabase/server";
import DigitalCreditPathwayClient, {
  type DigitalCreditItem,
  type DigitalCreditFee,
} from "./digital-credit-pathway-client";
import type { PathwayFee, PathwayRegulator, PathwayRequirement } from "@/lib/types";

export const metadata = {
  title: "Digital Credit Licence Pathway — FITSPA Compliance Platform",
  description:
    "UMRA Tier 4 Microfinance Institutions and Money Lenders Act digital credit licence pathway — a phase-by-phase requirements map with fees for your route.",
};

// Adapters: `pathway_requirements`/`pathway_fees` (the new generic,
// admin-extensible tables, canonical going forward) back into the exact flat
// shape DigitalCreditPathwayClient already expects, so that 900+ line
// component needs zero changes to its core logic. See
// PathwayRequirement/PathwayFee in src/lib/types.ts for the source shape.
function toDigitalCreditItem(row: PathwayRequirement): DigitalCreditItem {
  const a = (row.applicability ?? {}) as Record<string, string>;
  return {
    id: row.external_id,
    seq: row.seq,
    phase: row.phase,
    type: row.item_type ?? "",
    requirement: row.requirement,
    meaning: row.meaning ?? "",
    money_lender: (a.MONEY_LENDER as DigitalCreditItem["money_lender"]) ?? "No",
    ndt_mfi: (a.NDT_MFI as DigitalCreditItem["ndt_mfi"]) ?? "No",
    timing: row.timing,
    evidence: row.evidence,
    level: row.level,
    source: row.source,
    source_link: row.source_link,
    condition: row.condition,
  };
}

function toDigitalCreditFee(row: PathwayFee): DigitalCreditFee {
  return {
    id: row.id,
    sort_order: row.sort_order,
    route: row.route ?? "",
    event: row.event ?? "",
    amount: Number(row.amount ?? 0),
    status: row.status,
    note: row.note,
    source: row.source,
    source_link: row.source_link,
  };
}

export default async function DigitalCreditPathwayPage() {
  const supabase = await createClient();
  const [{ data: items }, { data: fees }, { data: regulator }, { data: { user } }] = await Promise.all([
    supabase.from("pathway_requirements").select("*").eq("pathway_key", "digital_credit").order("seq"),
    supabase.from("pathway_fees").select("*").eq("pathway_key", "digital_credit").order("sort_order"),
    supabase.from("pathway_regulators").select("*").eq("key", "digital_credit").maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const reg = regulator as PathwayRegulator | null;

  return (
    <DigitalCreditPathwayClient
      items={((items ?? []) as PathwayRequirement[]).map(toDigitalCreditItem)}
      fees={((fees ?? []) as PathwayFee[]).map(toDigitalCreditFee)}
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
