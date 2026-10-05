import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import { DIGITAL_LENDING_CATALOG_KEY } from "@/lib/compliance-engine";
import BeaconNav from "@/components/beacon-nav";
import DigitalLendingComplianceClient from "./digital-lending-compliance-client";
import type { LegacyProfileRow } from "@/lib/comply/digital-engine";

export const metadata = {
  title: "Digital Lending Compliance | FITSPA Compliance Platform",
  description:
    "Manage your ongoing Money Lender or NDTMFI digital lending compliance obligations — dated occurrences, event-driven work, continuous controls and evidence.",
};

// Digital Lending Compliance workspace (Money Lender / NDTMFI, MRD-MoFPED).
// A faithful port of the FITSPA Compliance Platform design prototype: the workspace is one state
// document (profile -> generated dated occurrences, logged events, control
// reviews, evidence, activity) persisted in public.member_comply_workspace
// (module_key = 'digital_lending'); evidence files live in the private
// compliance-evidence bucket. The module draws its own FITSPA Compliance Platform masthead
// (landing / setup / workspace), so there is no site nav above it.
export default async function DigitalLendingCompliancePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("member_comply_workspace")
    .select("state")
    .eq("member_id", member.id)
    .eq("module_key", "digital_lending")
    .maybeSingle();

  // Members who used the previous tracker have an old member_compliance_profile
  // row: when there is no workspace yet, use it to pre-fill the setup screen.
  let legacyProfile: LegacyProfileRow | null = null;
  if (!workspace) {
    const { data } = await supabase
      .from("member_compliance_profile")
      .select("route, money_lender, ndt_mfi, issue_date, fye_date, pdpo_status, pdpo_expiry, collateral, custody, recovery_agents, crossborder, advice, fitspa_subscriber")
      .eq("member_id", member.id)
      .eq("catalog_key", DIGITAL_LENDING_CATALOG_KEY)
      .maybeSingle();
    legacyProfile = (data as LegacyProfileRow | null) ?? null;
  }

  return (
    <>
    <BeaconNav active="comply" backHref="/comply" backLabel="← Compliance" />
    <DigitalLendingComplianceClient
      memberId={member.id}
      catalogKey={DIGITAL_LENDING_CATALOG_KEY}
      initialState={workspace?.state ?? null}
      legacyProfile={legacyProfile}
      businessName={member.company_name}
      contactName={member.signup_contact_name}
      contactEmail={member.company_email}
    />
    </>
  );
}
