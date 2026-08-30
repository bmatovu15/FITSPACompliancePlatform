import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import ObligationRow from "./obligation-row";

export default async function DashboardPage() {
  const member = await requireMember();
  const supabase = await createClient();
  const year = new Date().getFullYear().toString();

  const { data: memberLicences } = await supabase
    .from("member_licences")
    .select("licence_id, licences(name, regulator_id, regulators(name))")
    .eq("member_id", member.id);

  const licenceIds = (memberLicences ?? []).map((ml: any) => ml.licence_id);

  const { data: allObligations } = await supabase
    .from("obligations")
    .select("*, regulators(name)")
    .or(`member_id.eq.${member.id},member_id.is.null`)
    .in("licence_id", licenceIds.length ? licenceIds : ["00000000-0000-0000-0000-000000000000"]);

  const obligations = (allObligations ?? []).filter(
    (o: any) => o.member_id === member.id || licenceIds.includes(o.licence_id)
  );

  const thisYear = obligations.filter((o: any) => (o.policy_year ?? o.due_date?.slice(0, 4)) === year);
  const counts = {
    active: thisYear.filter((o: any) => o.status === "Active").length,
    complete: thisYear.filter((o: any) => o.status === "Complete").length,
    pending: thisYear.filter((o: any) => o.status === "Pending Approval").length,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
        Welcome back, {member.company_name}
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-3xl font-bold" style={{ color: "var(--color-primary)" }}>{counts.active}</p>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Active obligations, {year}</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold" style={{ color: "var(--color-accent)" }}>{counts.complete}</p>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Completed this year</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold">{counts.pending}</p>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Pending review</p>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-semibold">{year} compliance obligations</h2>
      <ObligationList obligations={thisYear} memberId={member.id} />

      <h2 className="mt-10 text-lg font-semibold">All obligations</h2>
      <ObligationList obligations={obligations} memberId={member.id} />
    </div>
  );
}

function ObligationList({ obligations, memberId }: { obligations: any[]; memberId: string }) {
  if (obligations.length === 0) {
    return <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>Nothing here yet.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto card">
      <table className="data">
        <thead>
          <tr>
            <th>Regulator</th>
            <th>Obligation</th>
            <th>Deadline</th>
            <th>Status</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {obligations.map((o) => (
            <ObligationRow key={o.id} obligation={o} isOwn={o.member_id === memberId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
