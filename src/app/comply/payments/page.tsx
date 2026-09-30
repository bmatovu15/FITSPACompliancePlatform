import Link from "next/link";
import pcStyles from "./payments-compliance.module.css";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import { PAYMENTS_CATALOG_KEY } from "@/lib/compliance-engine";
import PaymentsComplianceClient from "./payments-compliance-client";
import type {
  ComplianceCalendarTask,
  ComplianceCatalogFee,
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
} from "@/lib/types";

export const metadata = {
  title: "Payments Compliance | FITSPA Compliance Platform",
  description:
    "Manage your ongoing Bank of Uganda payments compliance obligations — filing calendar, event-triggered clocks, continuous controls and fee schedule.",
};

const CATALOG_KEY = PAYMENTS_CATALOG_KEY;

// Beacon-styled replacement for the Payments half of
// /dashboard/compliance-pathway (see strategy/beacon-template-redesign-plan.md).
// Same Supabase-backed data model and applicability engine
// (@/lib/compliance-engine), restyled to the uploaded "Beacon — Payments
// Compliance Assistant" prototype (/tmp/beacon-compliance-src.html). This
// route is payments-only: no catalog switcher, no year switcher (the source
// prototype's calendar has no year selector either — it lists all dated
// occurrences grouped by month). The old /dashboard/compliance-pathway page
// is left untouched; it is retired separately once this route is verified.
export default async function PaymentsCompliancePage() {
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
    <div className={pcStyles.pcRoot} style={{ minHeight: "100vh", background: "#fff" }}>
      <header className={pcStyles["pc-nav"]}>
        <Link className={pcStyles["pc-brand"]} href="/" aria-label="FITSPA Compliance Platform home">
          <span className={pcStyles["pc-brand-mark"]} aria-hidden="true"></span>FITSPA Compliance Platform
        </Link>
        <nav className={pcStyles["pc-nav-links"]} aria-label="Primary">
          <button className={`${pcStyles["pc-nav-link"]} ${pcStyles.muted}`} type="button" disabled>
            Explore
          </button>
          <Link className={pcStyles["pc-nav-link"]} href="/apply">Apply</Link>
          <Link className={`${pcStyles["pc-nav-link"]} ${pcStyles.active}`} href="/comply">Comply</Link>
          <Link className={pcStyles["pc-nav-link"]} href="/assistant">AI Assistant</Link>
        </nav>
        <div className={pcStyles["pc-nav-actions"]}>
          <Link className={pcStyles["pc-nav-search"]} href="/lookup">Search a member</Link>
          <Link className={pcStyles["pc-nav-register"]} href="/signup">Register</Link>
          <Link className={pcStyles["pc-nav-back"]} href="/comply">← Compliance</Link>
        </div>
      </header>
      <PaymentsComplianceClient
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
