import { createClient } from "@/lib/supabase/server";

export default async function AdminOverview() {
  const supabase = await createClient();
  const [{ count: members }, { count: regulators }, { count: licences }, { count: pendingObligations }, { count: pendingVerticals }, { count: docs }] = await Promise.all([
    supabase.from("members").select("*", { count: "exact", head: true }),
    supabase.from("regulators").select("*", { count: "exact", head: true }),
    supabase.from("licences").select("*", { count: "exact", head: true }),
    supabase.from("obligations").select("*", { count: "exact", head: true }).eq("status", "Pending Approval"),
    supabase.from("fintech_verticals").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("documents").select("*", { count: "exact", head: true }),
  ]);

  const cards = [
    { label: "Members", value: members },
    { label: "Regulators", value: regulators },
    { label: "Licences", value: licences },
    { label: "Documents indexed", value: docs },
    { label: "Obligations awaiting review", value: pendingObligations },
    { label: "Verticals awaiting approval", value: pendingVerticals },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Admin overview</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <p className="text-3xl font-bold" style={{ color: "var(--color-primary)" }}>{c.value ?? 0}</p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
