import { createClient } from "@/lib/supabase/server";
import RequirementsPathwayAdminClient from "./requirements-pathway-admin-client";

const BESPOKE_KEYS = ["nps", "digital_credit"] as const;

export default async function RequirementsPathwayAdminPage() {
  const supabase = await createClient();

  const [{ data: regulators }, { data: regulatorOptions }, ...counts] = await Promise.all([
    supabase.from("pathway_regulators").select("*").order("sort_order"),
    supabase.from("regulators").select("id, name").order("name"),
    ...BESPOKE_KEYS.flatMap((key) => [
      supabase.from("pathway_requirements").select("id", { count: "exact", head: true }).eq("pathway_key", key),
      supabase.from("pathway_fees").select("id", { count: "exact", head: true }).eq("pathway_key", key),
    ]),
  ]);

  const bespokeCounts: Record<string, { requirements: number; fees: number }> = {};
  BESPOKE_KEYS.forEach((key, i) => {
    bespokeCounts[key] = {
      requirements: counts[i * 2]?.count ?? 0,
      fees: counts[i * 2 + 1]?.count ?? 0,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Requirements Pathway</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Manage the regulators shown at <code>/requirements-pathway</code>. NPS and Digital Credit keep their own
        dedicated admin pages (linked below) so there is exactly one editing surface per regulator; any other
        regulator added here gets a fully generic wizard with no code changes.
      </p>
      <RequirementsPathwayAdminClient
        initialRegulators={regulators ?? []}
        regulatorOptions={regulatorOptions ?? []}
        bespokeCounts={bespokeCounts}
      />
    </div>
  );
}
