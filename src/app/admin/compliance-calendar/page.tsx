import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ComplianceCalendarAdminClient from "./compliance-calendar-admin-client";
import type { ComplianceCatalog } from "@/lib/types";

export default async function ComplianceCalendarAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ catalog?: string }>;
}) {
  const { catalog: catalogParam } = await searchParams;
  const supabase = await createClient();

  const { data: catalogRows } = await supabase.from("compliance_catalogs").select("*").order("sort_order");
  const catalogs = (catalogRows ?? []) as ComplianceCatalog[];
  const selectedCatalog = catalogs.find((c) => c.catalog_key === catalogParam) ?? catalogs[0] ?? null;
  const CATALOG_KEY = selectedCatalog?.catalog_key ?? "";

  const [
    { data: tasks },
    { data: events },
    { data: controls },
    { data: workflowStates },
    { data: reminderRules },
    { data: holidays },
    { data: regulators },
    { data: fees },
    { data: sourceRegisters },
    { data: obligations },
  ] = await Promise.all([
    supabase
      .from("compliance_calendar_tasks")
      .select("*")
      .eq("catalog_key", CATALOG_KEY)
      .order("catalog_year", { ascending: false })
      .order("task"),
    supabase.from("compliance_events").select("*").eq("catalog_key", CATALOG_KEY).order("trigger_name"),
    supabase.from("compliance_controls").select("*").eq("catalog_key", CATALOG_KEY).order("domain"),
    // These two reference tables have no catalog_key column — they are shared/global across all catalogs.
    supabase.from("compliance_workflow_states").select("*").order("sort_order"),
    supabase.from("compliance_reminder_rules").select("*").order("sort_order"),
    supabase.from("compliance_holidays").select("*").order("holiday_date"),
    supabase.from("regulators").select("id,name").order("name"),
    supabase.from("compliance_catalog_fees").select("*").eq("catalog_key", CATALOG_KEY).order("sort_order"),
    supabase
      .from("source_registers")
      .select("*")
      .eq("scope_type", "catalog")
      .eq("scope_key", CATALOG_KEY)
      .order("sort_order"),
    supabase.from("obligations").select("*").eq("catalog_key", CATALOG_KEY).order("external_id"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Compliance Calendar</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Manage the reference tables (annual tasks, one-off events, ongoing controls, workflow states, reminder rules,
        declared holidays, fees, source registers and reference obligations) that power the member-facing Compliance
        Calendar.
      </p>

      {catalogs.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {catalogs.map((c) => (
            <Link
              key={c.catalog_key}
              href={`/admin/compliance-calendar?catalog=${c.catalog_key}`}
              className={`btn btn-sm ${c.catalog_key === CATALOG_KEY ? "btn-primary" : "btn-ghost"}`}
            >
              {c.title}
            </Link>
          ))}
        </div>
      )}

      <ComplianceCalendarAdminClient
        catalogKey={CATALOG_KEY}
        tasks={tasks ?? []}
        events={events ?? []}
        controls={controls ?? []}
        workflowStates={workflowStates ?? []}
        reminderRules={reminderRules ?? []}
        holidays={holidays ?? []}
        regulators={regulators ?? []}
        fees={fees ?? []}
        sourceRegisters={sourceRegisters ?? []}
        obligations={obligations ?? []}
      />
    </div>
  );
}
