import { createClient } from "@/lib/supabase/server";
import NpsPathwayAdminClient from "./nps-pathway-admin-client";

export default async function NpsPathwayAdminPage() {
  const supabase = await createClient();
  const [{ data: requirements }, { data: feeTiers }] = await Promise.all([
    supabase.from("pathway_requirements").select("*").eq("pathway_key", "nps").order("seq"),
    supabase.from("pathway_fees").select("*").eq("pathway_key", "nps").order("sort_order"),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>NPS Licence Pathway</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Manage the checklist requirements and fee schedule that power the member-facing NPS Licence Pathway tool.
      </p>
      <NpsPathwayAdminClient requirements={requirements ?? []} feeTiers={feeTiers ?? []} />
    </div>
  );
}
