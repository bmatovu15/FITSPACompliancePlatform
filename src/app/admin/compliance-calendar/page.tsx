import { createClient } from "@/lib/supabase/server";
import ComplianceCalendarAdminClient from "./compliance-calendar-admin-client";

export default async function ComplianceCalendarAdminPage() {
  const supabase = await createClient();
  const [
    { data: tasks },
    { data: events },
    { data: controls },
    { data: workflowStates },
    { data: reminderRules },
    { data: holidays },
    { data: regulators },
  ] = await Promise.all([
    supabase.from("compliance_calendar_tasks").select("*").order("catalog_year", { ascending: false }).order("task"),
    supabase.from("compliance_events").select("*").order("trigger_name"),
    supabase.from("compliance_controls").select("*").order("domain"),
    supabase.from("compliance_workflow_states").select("*").order("sort_order"),
    supabase.from("compliance_reminder_rules").select("*").order("sort_order"),
    supabase.from("compliance_holidays").select("*").order("holiday_date"),
    supabase.from("regulators").select("id,name").order("name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Compliance Calendar</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Manage the reference tables (annual tasks, one-off events, ongoing controls, workflow states, reminder rules and
        declared holidays) that power the member-facing Compliance Calendar.
      </p>
      <ComplianceCalendarAdminClient
        tasks={tasks ?? []}
        events={events ?? []}
        controls={controls ?? []}
        workflowStates={workflowStates ?? []}
        reminderRules={reminderRules ?? []}
        holidays={holidays ?? []}
        regulators={regulators ?? []}
      />
    </div>
  );
}
