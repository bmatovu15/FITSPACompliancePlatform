import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import ComplianceCalendarClient from "./compliance-calendar-client";
import type {
  ComplianceCalendarTask,
  ComplianceCatalog,
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
  title: "Compliance calendar — FITSPA Compliance Platform",
  description:
    "Your annual filing calendar, event-triggered clocks and continuous controls under your applicable regulatory framework, filtered to your licence profile.",
};

export default async function ComplianceCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ catalog?: string; year?: string }>;
}) {
  const { catalog: catalogParam, year: yearParam } = await searchParams;
  const member = await requireMember();
  const supabase = await createClient();

  const { data: catalogRows } = await supabase
    .from("compliance_catalogs")
    .select("*")
    .order("sort_order");
  const catalogs = (catalogRows ?? []) as ComplianceCatalog[];
  const selectedCatalog = catalogs.find((c) => c.catalog_key === catalogParam) ?? catalogs[0] ?? null;
  const CATALOG_KEY = selectedCatalog?.catalog_key ?? "payments_compliance_assistant";

  const [
    { data: profile },
    { data: calendarTasksRaw },
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

  const allTasks = (calendarTasksRaw ?? []) as ComplianceCalendarTask[];
  const years = Array.from(
    new Set(allTasks.map((t) => t.catalog_year).filter((y): y is number => y != null))
  ).sort((a, b) => a - b);
  const defaultYear = years.length ? years[years.length - 1] : null;
  const parsedYearParam = yearParam ? Number(yearParam) : NaN;
  const selectedYear = years.includes(parsedYearParam) ? parsedYearParam : defaultYear;
  // Tasks with no catalog_year are treated as evergreen/undated and always shown
  // alongside whichever year is selected.
  const calendarTasks =
    selectedYear == null ? allTasks : allTasks.filter((t) => t.catalog_year == null || t.catalog_year === selectedYear);

  return (
    <div>
      {catalogs.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {catalogs.map((c) => (
            <Link
              key={c.catalog_key}
              href={`/dashboard/compliance-calendar?catalog=${c.catalog_key}`}
              className={`btn btn-sm ${c.catalog_key === CATALOG_KEY ? "btn-primary" : "btn-ghost"}`}
            >
              {c.title}
              {c.seal_text && (
                <span className="ml-1 text-xs" style={{ opacity: 0.7 }}>
                  ({c.seal_text})
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
      {years.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Year:
          </span>
          {years.map((y) => (
            <Link
              key={y}
              href={`/dashboard/compliance-calendar?catalog=${CATALOG_KEY}&year=${y}`}
              className={`btn btn-sm ${y === selectedYear ? "btn-primary" : "btn-ghost"}`}
            >
              {y}
            </Link>
          ))}
        </div>
      )}
      <ComplianceCalendarClient
        memberId={member.id}
        catalogKey={CATALOG_KEY}
        catalogTitle={selectedCatalog?.title ?? "Compliance calendar"}
        catalogSeal={selectedCatalog?.seal_text ?? null}
        selectedYear={selectedYear}
        initialProfile={(profile as MemberComplianceProfile | null) ?? null}
        calendarTasks={calendarTasks}
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
