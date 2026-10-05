import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listProgrammes, loadProgramme, loadReadinessCounts } from "@/lib/programmes/load";
import { readiness, readyScore } from "@/lib/programmes/readiness";
import NewProgramme from "./new-programme";

export const metadata = { title: "Programmes | FITSPA Admin" };

export default async function ProgrammesPage() {
  const supabase = await createClient();
  const progs = await listProgrammes();
  const { data: regs } = await supabase.from("regulators").select("id,name").order("name");

  const rows = await Promise.all(
    progs.map(async (p) => {
      const data = await loadProgramme(p.id);
      const counts = await loadReadinessCounts(p);
      const items = data ? readiness({ data, ...counts }) : [];
      return { p, data, score: readyScore(items) };
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Regulator programmes</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        A programme is everything one regulator needs on the platform: its licence application (Apply), its ongoing
        obligations (Comply), its documents and what the AI assistant knows. Fill in each section here and the member
        and visitor screens appear without any developer work. A programme stays hidden until every required item is done and you publish it.
      </p>

      <div className="mt-6 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr><th>Programme</th><th>Regulator</th><th>Screens</th><th>Obligations</th><th>Readiness</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map(({ p, data, score }) => (
              <tr key={p.id}>
                <td><Link className="underline" href={`/admin/programmes/${p.id}`}>{p.name}</Link></td>
                <td>{p.regulator?.name ?? "—"}</td>
                <td>{p.screens === "dedicated" ? "Dedicated" : "Generic (from admin data)"}</td>
                <td>{data ? data.obligations.filter((o) => o.status === "active").length : 0}</td>
                <td>{score.done}/{score.total} ({score.pct}%){score.requiredMissing.length ? ` · ${score.requiredMissing.length} required missing` : ""}</td>
                <td><span className={`badge ${p.status === "published" ? "badge-green" : "badge-amber"}`}>{p.status === "published" ? "Published" : "Draft"}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}>No programmes yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <NewProgramme regulators={regs ?? []} />
    </div>
  );
}
