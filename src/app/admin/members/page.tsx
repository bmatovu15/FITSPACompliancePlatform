import { createClient } from "@/lib/supabase/server";
import MembersClient from "./members-client";

export default async function MembersPage() {
  const supabase = await createClient();
  const [{ data: members }, { data: memberLicences }, { data: licences }, { data: regulators }] = await Promise.all([
    supabase.from("members").select("*").order("created_at", { ascending: false }),
    supabase.from("member_licences").select("*"),
    supabase.from("licences").select("id,name,regulator_id").order("name"),
    supabase.from("regulators").select("id,name").order("name"),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Members &amp; licences</h1>
      <MembersClient
        members={members ?? []}
        memberLicences={memberLicences ?? []}
        licences={licences ?? []}
        regulators={regulators ?? []}
      />
    </div>
  );
}
