import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import ComplianceCalendarClient from "./compliance-calendar-client";
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
  NpsFeeTier,
  Obligation,
} from "@/lib/types";

const CATALOG_KEY = "payments_compliance_assistant";

export const metadata = {
  title: "Compliance calendar — FITSPA Compliance Platform",
  description:
    "Your annual filing calendar, event-triggered clocks and continuous controls under the National Payment Systems framework, filtered to your licence profile.",
};

export default async function ComplianceCalendarPage() {
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
    { data: feeTiers },
    { data: taskStates },
    { data: loggedEvents },
    { data: controlStates },
  ] = await Promise.all([
    supabase
      .from("member_compliance_profile")
      .select("*")
      .eq("member_id", member.id)
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
    supabase.from("nps_fee_tiers").select("*").order("sort_order"),
    supabase.from("member_calendar_task_state").select("*").eq("member_id", member.id),
    supabase
      .from("member_logged_events")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false }),
    supabase.from("member_control_state").select("*").eq("member_id", member.id),
  ]);

  return (
    <ComplianceCalendarClient
      memberId={member.id}
      initialProfile={(profile as MemberComplianceProfile | null) ?? null}
      calendarTasks={(calendarTasks ?? []) as ComplianceCalendarTask[]}
      events={(events ?? []) as ComplianceEvent[]}
      controls={(controls ?? []) as ComplianceControl[]}
      workflowStates={(workflowStates ?? []) as ComplianceWorkflowState[]}
      reminderRules={(reminderRules ?? []) as ComplianceReminderRule[]}
      holidays={(holidays ?? []) as ComplianceHoliday[]}
      obligations={(obligations ?? []) as Obligation[]}
      feeTiers={(feeTiers ?? []) as NpsFeeTier[]}
      initialTaskStates={(taskStates ?? []) as MemberCalendarTaskState[]}
      initialLoggedEvents={(loggedEvents ?? []) as MemberLoggedEvent[]}
      initialControlStates={(controlStates ?? []) as MemberControlState[]}
    />
  );
}
