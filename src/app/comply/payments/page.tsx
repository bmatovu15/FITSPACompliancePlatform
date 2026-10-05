import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import { PAYMENTS_CATALOG_KEY } from "@/lib/compliance-engine";
import { profileFromLegacy, type LegacyPaymentsProfile } from "@/lib/comply/payments-legacy";
import PaymentsComplianceClient from "./payments-compliance-client";

export const metadata = {
  title: "Payments Compliance | FITSPA Compliance Platform",
  description:
    "Stay on top of your Bank of Uganda payments compliance: what needs attention, recurring submissions, regulatory changes and events, and evidence.",
};

// The design's own masthead (one sticky bar + sticky tabs) replaces the site nav
// inside this module. All rules run in the client from a single workspace
// document stored in member_comply_workspace (module_key 'payments').
export default async function PaymentsCompliancePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("member_comply_workspace")
    .select("state, profile_set")
    .eq("member_id", member.id)
    .eq("module_key", "payments")
    .maybeSingle();

  let prefill = null;
  if (!workspace) {
    const { data: legacy } = await supabase
      .from("member_compliance_profile")
      .select("is_pso,is_psp,is_instrument,pso_class,pso_band,emi,emi_band,cards,agent,sfi,participant")
      .eq("member_id", member.id)
      .eq("catalog_key", PAYMENTS_CATALOG_KEY)
      .maybeSingle();
    prefill = profileFromLegacy(legacy as LegacyPaymentsProfile | null);
  }

  return (
    <>
      {/* Same font loading as the design prototype (hoisted to <head> by React). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"
        precedence="default"
      />
      <PaymentsComplianceClient
        member={{
          id: member.id,
          businessName: member.company_name,
          contactName: member.signup_contact_name,
          contactEmail: member.company_email,
        }}
        catalogKey={PAYMENTS_CATALOG_KEY}
        initialState={workspace?.state ?? null}
        prefillProfile={prefill}
      />
    </>
  );
}
