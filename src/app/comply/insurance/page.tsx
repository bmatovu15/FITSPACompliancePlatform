import Link from "next/link";
import icStyles from "./insurance-compliance.module.css";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import { INSURANCE_CATALOG_KEY } from "@/lib/compliance-engine";
import InsuranceComplianceClient from "./insurance-compliance-client";
import type {
  ComplianceControl,
  ComplianceEvent,
  MemberComplianceProfile,
  MemberControlState,
  MemberLoggedEvent,
  Obligation,
  ComplianceCatalogFee,
} from "@/lib/types";

export const metadata = {
  title: "Insurance Compliance | FITSPA Compliance Platform",
  description:
    "Manage your ongoing Insurer, Broker, Agent or HMO insurance compliance obligations under the IRA's licensing guidelines — regulatory library, event-triggered clocks, continuous controls and fee schedule.",
};

const CATALOG_KEY = INSURANCE_CATALOG_KEY;

// FITSPA Compliance Platform-styled Insurance Comply workspace, mirroring the component
// architecture of /comply/digital-lending (see digital-lending-compliance-
// client.tsx) and reusing the same shared applicability engine
// (@/lib/compliance-engine). Unlike Digital Lending / Payments, the IRA
// source documents seeded for this catalog (licensing guidelines) do not
// publish a dated, gazetted compliance calendar, so this route has no
// `compliance_calendar_tasks` / `member_calendar_task_state` rows to fetch
// or persist against -- the Calendar tab instead derives a read-only,
// grouped-by-cadence view from the `obligations` table itself (see the
// client component). Reference tables that only make sense alongside a
// dated task workflow (compliance_workflow_states, compliance_reminder_
// rules, compliance_holidays) are likewise not fetched here.
export default async function InsuranceCompliancePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const [
    { data: profile },
    { data: events },
    { data: controls },
    { data: obligations },
    { data: catalogFees },
    { data: loggedEvents },
    { data: controlStates },
  ] = await Promise.all([
    supabase
      .from("member_compliance_profile")
      .select("*")
      .eq("member_id", member.id)
      .eq("catalog_key", CATALOG_KEY)
      .maybeSingle(),
    supabase.from("compliance_events").select("*").eq("catalog_key", CATALOG_KEY),
    supabase.from("compliance_controls").select("*").eq("catalog_key", CATALOG_KEY),
    supabase.from("obligations").select("*").eq("catalog_key", CATALOG_KEY),
    supabase.from("compliance_catalog_fees").select("*").eq("catalog_key", CATALOG_KEY).order("sort_order"),
    supabase
      .from("member_logged_events")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false }),
    supabase.from("member_control_state").select("*").eq("member_id", member.id),
  ]);

  return (
    <div className={icStyles.dcRoot} style={{ minHeight: "100vh", background: "#fff" }}>
      <header className={icStyles["dc-nav"]}>
        <Link className={icStyles["dc-brand"]} href="/" aria-label="FITSPA Compliance Platform home">
          <span className={icStyles["dc-brand-mark"]} aria-hidden="true"></span>FITSPA Compliance Platform
        </Link>
        <nav className={icStyles["dc-nav-links"]} aria-label="Primary">
          <button className={`${icStyles["dc-nav-link"]} ${icStyles.muted}`} type="button" disabled>
            Explore
          </button>
          <Link className={icStyles["dc-nav-link"]} href="/apply">Apply</Link>
          <Link className={`${icStyles["dc-nav-link"]} ${icStyles.active}`} href="/comply">Comply</Link>
          <Link className={icStyles["dc-nav-link"]} href="/assistant">AI Assistant</Link>
        </nav>
        <div className={icStyles["dc-nav-actions"]}>
          <Link className={icStyles["dc-nav-search"]} href="/lookup">Search a member</Link>
          <Link className={icStyles["dc-nav-register"]} href="/signup">Register</Link>
          <Link className={icStyles["dc-nav-back"]} href="/comply">← Compliance</Link>
        </div>
      </header>
      <InsuranceComplianceClient
        memberId={member.id}
        catalogKey={CATALOG_KEY}
        initialProfile={(profile as MemberComplianceProfile | null) ?? null}
        events={(events ?? []) as ComplianceEvent[]}
        controls={(controls ?? []) as ComplianceControl[]}
        obligations={(obligations ?? []) as Obligation[]}
        catalogFees={(catalogFees ?? []) as ComplianceCatalogFee[]}
        initialLoggedEvents={(loggedEvents ?? []) as MemberLoggedEvent[]}
        initialControlStates={(controlStates ?? []) as MemberControlState[]}
      />
    </div>
  );
}
