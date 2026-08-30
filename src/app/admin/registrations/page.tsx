import { createClient } from "@/lib/supabase/server";
import RegistrationsClient from "./registrations-client";

export default async function RegistrationsPage() {
  const supabase = await createClient();
  const [{ data: regs }, { data: regulators }, { data: licences }] = await Promise.all([
    supabase.from("regulator_registrations").select("*").order("created_at", { ascending: false }),
    supabase.from("regulators").select("id,name").order("name"),
    supabase.from("licences").select("id,name,regulator_id").order("name"),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Regulator registry</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        The source of truth FITSPA maintains for real licence numbers. Signup and licence updates are
        validated against this table.
      </p>
      <RegistrationsClient initial={regs ?? []} regulators={regulators ?? []} licences={licences ?? []} />
    </div>
  );
}
