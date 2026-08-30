import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import LicencesClient from "./licences-client";

export default async function LicencesPage() {
  const member = await requireMember();
  const supabase = await createClient();
  const [{ data: mine }, { data: allLicences }, { data: regulators }] = await Promise.all([
    supabase.from("member_licences").select("*, licences(name, regulator_id)").eq("member_id", member.id),
    supabase.from("licences").select("id,regulator_id,name,status").eq("status", "Active").order("name"),
    supabase.from("regulators").select("id,name").eq("status", "Active").order("name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>My licences</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Keep your licence numbers, status, and renewal dates up to date. Verification against
        FITSPA's regulator registry is confirmed by a FITSPA officer.
      </p>
      <LicencesClient
        memberLicences={mine ?? []}
        allLicences={allLicences ?? []}
        regulators={regulators ?? []}
      />
    </div>
  );
}
