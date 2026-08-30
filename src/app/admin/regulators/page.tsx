import { createClient } from "@/lib/supabase/server";
import RegulatorsClient from "./regulators-client";

export default async function RegulatorsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("regulators").select("*").order("name");
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Regulators</h1>
      <RegulatorsClient initial={data ?? []} />
    </div>
  );
}
