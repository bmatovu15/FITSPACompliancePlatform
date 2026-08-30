"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ObligationsClient({ initial, regulators, licences }: { initial: any[]; regulators: any[]; licences: any[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ title: "", regulator_id: "", licence_id: "", description: "", frequency: "", penalty: "", risk: "Medium" });

  const pending = initial.filter((o) => o.status === "Pending Approval");
  const rest = initial.filter((o) => o.status !== "Pending Approval");

  async function decide(id: string, status: string) {
    await supabase.from("obligations").update({ status }).eq("id", id);
    router.refresh();
  }

  async function addObligation() {
    if (!form.title || !form.regulator_id) return;
    await supabase.from("obligations").insert({ ...form, licence_id: form.licence_id || null, source: "admin", status: "Active" });
    setForm({ title: "", regulator_id: "", licence_id: "", description: "", frequency: "", penalty: "", risk: "Medium" });
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          AI-proposed, awaiting review ({pending.length})
        </h2>
        <div className="mt-3 space-y-2">
          {pending.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{o.regulators?.name}{o.legal_ref ? ` · ${o.legal_ref}` : ""}</p>
                  {o.description && <p className="mt-1 text-sm">{o.description}</p>}
                  <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {o.frequency ? `Frequency: ${o.frequency}` : ""} {o.penalty ? ` · Penalty: ${o.penalty}` : ""} {o.risk ? ` · Risk: ${o.risk}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="btn btn-primary btn-sm" onClick={() => decide(o.id, "Active")}>Approve &amp; publish</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => decide(o.id, "Rejected")}>Reject</button>
                </div>
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Nothing awaiting review.</p>}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>All obligations</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add obligation"}</button>
        </div>
        {adding && (
          <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className="input" value={form.regulator_id} onChange={(e) => setForm({ ...form, regulator_id: e.target.value })}>
              <option value="">Regulator…</option>
              {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select className="input" value={form.licence_id} onChange={(e) => setForm({ ...form, licence_id: e.target.value })}>
              <option value="">Licence (optional)…</option>
              {licences.filter((l) => l.regulator_id === form.regulator_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select className="input" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })}>
              <option>High</option><option>Medium</option><option>Low</option>
            </select>
            <input className="input" placeholder="Frequency (e.g. Annual)" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} />
            <input className="input" placeholder="Penalty" value={form.penalty} onChange={(e) => setForm({ ...form, penalty: e.target.value })} />
            <textarea className="input sm:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button className="btn btn-primary sm:col-span-2" onClick={addObligation}>Save &amp; publish</button>
          </div>
        )}
        <div className="mt-3 overflow-x-auto card">
          <table className="data">
            <thead><tr><th>Regulator</th><th>Title</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              {rest.map((o) => (
                <tr key={o.id}>
                  <td>{o.regulators?.name ?? "—"}</td>
                  <td>{o.title}</td>
                  <td>{o.status}</td>
                  <td>{o.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
