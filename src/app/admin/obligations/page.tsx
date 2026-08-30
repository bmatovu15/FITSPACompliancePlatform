import { createClient } from "@/lib/supabase/server";
import ObligationsClient from "./obligations-client";

export default async function ObligationsPage() {
  const supabase = await createClient();
  const [{ data: obligations }, { data: regulators }, { data: licences }] = await Promise.all([
    supabase.from("obligations").select("*, regulators(name)").order("created_at", { ascending: false }),
    supabase.from("regulators").select("id,name").order("name"),
    supabase.from("licences").select("id,name,regulator_id").order("name"),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Obligations</h1>
      <ObligationsClient initial={obligations ?? []} regulators={regulators ?? []} licences={licences ?? []} />
    </div>
  );
}
