import Link from "next/link";
import dcStyles from "./digital-lending-compliance.module.css";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import { DIGITAL_LENDING_CATALOG_KEY } from "@/lib/compliance-engine";
import DigitalLendingComplianceClient from "./digital-lending-compliance-client";
import type {
  ComplianceCalendarTask,
  ComplianceControl,
  ComplianceEvent,
  ComplianceHoliday,
  ComplianceReminderRule,
  ComplianceWorkflowState,
  MemberCalendarTaskState,
  MemberComplianceProfile,
  MemberControlState,
  MemberLoggedEvent,
  Obligation,
  ComplianceCatalogFee,
} from "@/lib/types";

export const metadata = {
  title: "Digital Lending Compliance | FITSPA Compliance Platform",
  description:
    "Manage your ongoing Money Lender or NDTMFI digital lending compliance obligations — filing calendar, event-triggered clocks, continuous controls and fee schedule.",
};

const CATALOG_KEY = DIGITAL_LENDING_CATALOG_KEY;

// Beacon-styled replacement for the Digital Lending half of
// /dashboard/compliance-pathway (see strategy/beacon-template-redesign-plan.md
// and strategy/regulatory-onboarding-manual.md). Same Supabase-backed data
// model and applicability engine (@/lib/compliance-engine), restyled to the
// uploaded "Beacon — Digital Lending Compliance" prototype. This route is
// digital-lending-only: no catalog switcher, no year switcher (the source
// prototype's calendar has no year selector either -- it lists all dated
// occurrences grouped by month).
export default async function DigitalLendingCompliancePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const [
    { data: profile },
    { data: calendarTasks },
    { data: events },
    { data: controls },
    { data: workflowStates },
    { data: reminderRules },
    { data: holidays },
    { data: obligations },
    { data: catalogFees },
    { data: taskStates },
    { data: loggedEvents },
    { data: controlStates },
  ] = await Promise.all([
    supabase
      .from("member_compliance_profile")
      .select("*")
      .eq("member_id", member.id)
      .eq("catalog_key", CATALOG_KEY)
      .maybeSingle(),
    supabase
      .from("compliance_calendar_tasks")
      .select("*")
      .eq("catalog_key", CATALOG_KEY)
      .order("legal_due", { ascending: true, nullsFirst: false }),
    supabase.from("compliance_events").select("*").eq("catalog_key", CATALOG_KEY),
    supabase.from("compliance_controls").select("*").eq("catalog_key", CATALOG_KEY),
    supabase.from("compliance_workflow_states").select("*").order("sort_order"),
    supabase.from("compliance_reminder_rules").select("*").order("sort_order"),
    supabase.from("compliance_holidays").select("*").order("holiday_date"),
    supabase.from("obligations").select("*").eq("catalog_key", CATALOG_KEY),
    supabase.from("compliance_catalog_fees").select("*").eq("catalog_key", CATALOG_KEY).order("sort_order"),
    supabase.from("member_calendar_task_state").select("*").eq("member_id", member.id),
    supabase
      .from("member_logged_events")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false }),
    supabase.from("member_control_state").select("*").eq("member_id", member.id),
  ]);

  return (
    <div className={dcStyles.dcRoot} style={{ minHeight: "100vh", background: "#fff" }}>
      <header className={dcStyles["dc-nav"]}>
        <Link className={dcStyles["dc-brand"]} href="/" aria-label="FITSPA Compliance Platform home">
          <span className={dcStyles["dc-brand-mark"]} aria-hidden="true"></span>FITSPA Compliance Platform
        </Link>
        <nav className={dcStyles["dc-nav-links"]} aria-label="Primary">
          <button className={`${dcStyles["dc-nav-link"]} ${dcStyles.muted}`} type="button" disabled>
            Explore
          </button>
          <Link className={dcStyles["dc-nav-link"]} href="/apply">Apply</Link>
          <Link className={`${dcStyles["dc-nav-link"]} ${dcStyles.active}`} href="/comply">Comply</Link>
          <Link className={dcStyles["dc-nav-link"]} href="/assistant">AI Assistant</Link>
        </nav>
        <div className={dcStyles["dc-nav-actions"]}>
          <Link className={dcStyles["dc-nav-search"]} href="/lookup">Search a member</Link>
          <Link className={dcStyles["dc-nav-register"]} href="/signup">Register</Link>
          <Link className={dcStyles["dc-nav-back"]} href="/comply">← Compliance</Link>
        </div>
      </header>
      <DigitalLendingComplianceClient
        memberId={member.id}
        catalogKey={CATALOG_KEY}
        initialProfile={(profile as MemberComplianceProfile | null) ?? null}
        calendarTasks={(calendarTasks ?? []) as ComplianceCalendarTask[]}
        events={(events ?? []) as ComplianceEvent[]}
        controls={(controls ?? []) as ComplianceControl[]}
        workflowStates={(workflowStates ?? []) as ComplianceWorkflowState[]}
        reminderRules={(reminderRules ?? []) as ComplianceReminderRule[]}
        holidays={(holidays ?? []) as ComplianceHoliday[]}
        obligations={(obligations ?? []) as Obligation[]}
        catalogFees={(catalogFees ?? []) as ComplianceCatalogFee[]}
        initialTaskStates={(taskStates ?? []) as MemberCalendarTaskState[]}
        initialLoggedEvents={(loggedEvents ?? []) as MemberLoggedEvent[]}
        initialControlStates={(controlStates ?? []) as MemberControlState[]}
      />
    </div>
  );
}
