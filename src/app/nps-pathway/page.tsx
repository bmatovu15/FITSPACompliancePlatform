import { createClient } from "@/lib/supabase/server";
import NpsPathwayClient, { type NpsItem, type NpsFeeTier } from "./nps-pathway-client";

export const metadata = {
  title: "NPS Licence Pathway — FITSPA Compliance Platform",
  description:
    "Bank of Uganda National Payment Systems Act licence pathway — a phase-by-phase requirements map with fees and minimum capital for your route.",
};

export default async function NpsPathwayPage() {
  const supabase = await createClient();
  const [{ data: items }, { data: fees }] = await Promise.all([
    supabase.from("nps_requirements").select("*").order("seq"),
    supabase.from("nps_fee_tiers").select("*").order("sort_order"),
  ]);

  return (
    <NpsPathwayClient
      items={(items ?? []) as NpsItem[]}
      fees={(fees ?? []) as NpsFeeTier[]}
    />
  );
}
