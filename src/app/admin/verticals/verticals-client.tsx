"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VerticalsClient({ initial }: { initial: any[] }) {
  const supabase = createClient();
  const router = useRouter();

  async function setStatus(id: string, status: string) {
    await supabase.from("fintech_verticals").update({ status }).eq("id", id);
    router.refresh();
  }

  const pending = initial.filter((v) => v.status === "pending");
  const rest = initial.filter((v) => v.status !== "pending");

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          Awaiting approval ({pending.length})
        </h2>
        <div className="mt-3 space-y-2">
          {pending.map((v) => (
            <div key={v.id} className="card flex items-center justify-between p-3">
              <span className="text-sm font-medium">{v.name}</span>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => setStatus(v.id, "active")}>Approve</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setStatus(v.id, "rejected")}>Reject</button>
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Nothing pending.</p>}
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>All verticals</h2>
        <div className="mt-3 overflow-x-auto card">
          <table className="data">
            <thead><tr><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              {rest.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td><span className={`badge ${v.status === "active" ? "badge-green" : "badge-red"}`}>{v.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
