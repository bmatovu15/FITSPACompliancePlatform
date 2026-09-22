import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import { getMemberCatalogAccess } from "@/lib/member-catalog-access";
import type {
  ComplianceCalendarTask,
  ComplianceCatalog,
  ComplianceControl,
  ComplianceEvent,
  MemberCalendarTaskState,
  MemberComplianceProfile,
} from "@/lib/types";
import {
  appliesTo,
  parseISODate,
  todayDate,
  daysBetween,
  fmtDateShort,
  profileFromRow,
  profileSummaryText,
} from "@/lib/compliance-engine";

type TaskRow = {
  t: ComplianceCalendarTask;
  due: Date | null;
  remaining: number | null;
  statusTag: "overdue" | "soon" | "scheduled";
  workflow: string;
};

type CatalogDashboard = {
  catalog: ComplianceCatalog;
  profileSet: boolean;
  profileSummary: string | null;
  applicableCount: number;
  overdue: TaskRow[];
  soon: TaskRow[];
  controlsCount: number;
  eventsCount: number;
};

// The member's Overview now shows a per-assistant dashboard -- the same
// stat tiles (scheduled filings / overdue / due soon / continuous controls)
// as each Compliance Assistant's own Dashboard tab, computed here from the
// member's saved profile for that catalog -- instead of the old
// regulator/licence-based obligation widget. A catalog the member hasn't
// set a profile for yet shows a prompt into the wizard rather than stats.
export default async function DashboardPage() {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: catalogRows } = await supabase.from("compliance_catalogs").select("*").order("sort_order");
  const allCatalogs = (catalogRows ?? []) as ComplianceCatalog[];
  const { allowed: catalogs, fellBackToAll } = await getMemberCatalogAccess(supabase, member.id, allCatalogs);

  const { data: profileRows } = await supabase
    .from("member_compliance_profile")
    .select("*")
    .eq("member_id", member.id);
  const profilesByCatalog = new Map<string, MemberComplianceProfile>();
  (profileRows ?? []).forEach((p) => profilesByCatalog.set((p as MemberComplianceProfile).catalog_key, p as MemberComplianceProfile));

  const catalogData: CatalogDashboard[] = await Promise.all(
    catalogs.map(async (catalog): Promise<CatalogDashboard> => {
      const profileRow = profilesByCatalog.get(catalog.catalog_key) ?? null;
      const profileSet = !!profileRow?.profile_set;

      if (!profileSet) {
        return {
          catalog,
          profileSet: false,
          profileSummary: null,
          applicableCount: 0,
          overdue: [],
          soon: [],
          controlsCount: 0,
          eventsCount: 0,
        };
      }

      const [{ data: tasksRaw }, { data: eventsRaw }, { data: controlsRaw }, { data: taskStatesRaw }] = await Promise.all([
        supabase.from("compliance_calendar_tasks").select("*").eq("catalog_key", catalog.catalog_key),
        supabase.from("compliance_events").select("*").eq("catalog_key", catalog.catalog_key),
        supabase.from("compliance_controls").select("*").eq("catalog_key", catalog.catalog_key),
        supabase.from("member_calendar_task_state").select("*").eq("member_id", member.id),
      ]);

      const profile = profileFromRow(profileRow);
      const taskStateByTaskId = new Map(
        ((taskStatesRaw ?? []) as MemberCalendarTaskState[]).map((s) => [s.task_id, s])
      );

      const applicable: TaskRow[] = ((tasksRaw ?? []) as ComplianceCalendarTask[])
        .filter((t) => appliesTo(t.applies_to, profile, catalog.catalog_key))
        .map((t) => {
          const due = parseISODate(t.legal_due);
          const remaining = due ? daysBetween(due, todayDate()) : null;
          const statusTag: TaskRow["statusTag"] =
            remaining === null ? "scheduled" : remaining < 0 ? "overdue" : remaining <= 30 ? "soon" : "scheduled";
          const workflow = taskStateByTaskId.get(t.id)?.workflow ?? "Scheduled";
          return { t, due, remaining, statusTag, workflow };
        });

      const overdue = applicable
        .filter((x) => x.statusTag === "overdue" && x.workflow !== "Closed")
        .sort((a, b) => (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity));
      const soon = applicable
        .filter((x) => x.statusTag === "soon" && x.workflow !== "Closed")
        .sort((a, b) => (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity));

      const controlsCount = ((controlsRaw ?? []) as ComplianceControl[]).filter((c) =>
        appliesTo(c.applies_to, profile, catalog.catalog_key)
      ).length;
      const eventsCount = ((eventsRaw ?? []) as ComplianceEvent[]).filter((e) =>
        appliesTo(e.applies_to, profile, catalog.catalog_key)
      ).length;

      return {
        catalog,
        profileSet: true,
        profileSummary: profileSummaryText(profile, catalog.catalog_key),
        applicableCount: applicable.length,
        overdue,
        soon,
        controlsCount,
        eventsCount,
      };
    })
  );

  const anySetUp = catalogData.some((d) => d.profileSet);

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
        Welcome back, {member.company_name}
      </h1>

      {!anySetUp && (
        <div className="mt-6 card p-6">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            You haven&apos;t set up a compliance assistant yet. Answer a short profile wizard for the route that
            applies to you, and this page will show your filing calendar, overdue items and continuous controls.
          </p>
          <Link className="btn btn-primary mt-3" href="/dashboard/compliance-pathway">
            Start the Compliance Pathway Wizard →
          </Link>
        </div>
      )}

      {fellBackToAll && (
        <p
          className="mt-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          No licence is on file for your account yet, so every compliance assistant is shown below. Once FITSPA
          records your licence, this page will only show the assistant(s) that match your regulator.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {catalogData.map(({ catalog, profileSet, profileSummary, applicableCount, overdue, soon, controlsCount, eventsCount }) => (
          <section key={catalog.catalog_key} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {catalog.seal_text && <span className="badge badge-gray">{catalog.seal_text}</span>}
                  <h2 className="text-lg font-semibold">{catalog.title}</h2>
                </div>
                {profileSet && profileSummary && (
                  <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {profileSummary}
                  </p>
                )}
              </div>
              <Link
                className="btn btn-ghost btn-sm"
                href={`/dashboard/compliance-pathway?catalog=${catalog.catalog_key}`}
              >
                {profileSet ? "Open assistant →" : "Set up →"}
              </Link>
            </div>

            {!profileSet ? (
              <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Not set up yet — answer this assistant&apos;s profile wizard to see what applies to you.
              </p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <StatTile label={`Scheduled filings applicable`} value={applicableCount} />
                  <StatTile label="Overdue" value={overdue.length} tone={overdue.length ? "danger" : "ok"} />
                  <StatTile label="Due within 30 days" value={soon.length} tone={soon.length ? "warn" : "ok"} />
                  <StatTile
                    label="Continuous controls tracked"
                    value={controlsCount}
                    note={`${eventsCount} event-triggered clock${eventsCount === 1 ? "" : "s"} also apply`}
                  />
                </div>

                {overdue.length > 0 && (
                  <MiniList title="Overdue right now" items={overdue} catalogKey={catalog.catalog_key} isOverdue />
                )}
                {soon.length > 0 && (
                  <MiniList title="Due within 30 days" items={soon} catalogKey={catalog.catalog_key} isOverdue={false} />
                )}
              </>
            )}
          </section>
        ))}

        {catalogData.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            No compliance assistants are published yet.
          </p>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const color =
    tone === "danger" ? "#a3372f" : tone === "warn" ? "#93590b" : "var(--color-primary)";
  return (
    <div className="card p-4" style={tone === "danger" ? { borderColor: "#a3372f" } : tone === "warn" ? { borderColor: "#c8952f" } : undefined}>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      {note && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {note}
        </p>
      )}
    </div>
  );
}

function MiniList({
  title,
  items,
  catalogKey,
  isOverdue,
}: {
  title: string;
  items: TaskRow[];
  catalogKey: string;
  isOverdue: boolean;
}) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 space-y-2">
        {items.slice(0, 5).map((x) => {
          const dueLabel =
            x.remaining === null ? "—" : isOverdue ? `${Math.abs(x.remaining)}d overdue` : `in ${x.remaining}d`;
          return (
            <Link
              key={x.t.id}
              href={`/dashboard/compliance-pathway?catalog=${catalogKey}`}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:opacity-80"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span
                className="font-mono text-xs shrink-0"
                style={{ width: "6rem", color: isOverdue ? "#a3372f" : "#93590b", fontWeight: 600 }}
              >
                {dueLabel}
              </span>
              <span className="flex-1">
                {x.t.task}{" "}
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  — due {fmtDateShort(x.due)}
                </span>
              </span>
              <span className="text-xs" style={{ color: "var(--color-accent)" }}>
                Open →
              </span>
            </Link>
          );
        })}
        {items.length > 5 && (
          <Link
            href={`/dashboard/compliance-pathway?catalog=${catalogKey}`}
            className="block text-xs"
            style={{ color: "var(--color-accent)" }}
          >
            +{items.length - 5} more in the calendar →
          </Link>
        )}
      </div>
    </div>
  );
}
