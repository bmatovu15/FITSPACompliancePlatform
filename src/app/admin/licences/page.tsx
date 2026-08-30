import { createClient } from "@/lib/supabase/server";
import LicencesClient from "./licences-client";

export default async function AdminLicencesPage() {
  const supabase = await createClient();
  const [{ data: licences }, { data: regulators }] = await Promise.all([
    supabase.from("licences").select("*").order("name"),
    supabase.from("regulators").select("id,name").order("name"),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Licences</h1>
      <LicencesClient initial={licences ?? []} regulators={regulators ?? []} />
    </div>
  );
}
