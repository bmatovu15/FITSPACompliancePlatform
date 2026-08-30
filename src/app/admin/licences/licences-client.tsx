"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LicencesClient({ initial, regulators }: { initial: any[]; regulators: any[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [regulatorId, setRegulatorId] = useState("");
  const [description, setDescription] = useState("");

  const regName = (id: string) => regulators.find((r) => r.id === id)?.name ?? "—";

  async function add() {
    if (!name || !regulatorId) return;
    await supabase.from("licences").insert({ name, regulator_id: regulatorId, description, status: "Active" });
    setName(""); setDescription(""); setAdding(false);
    router.refresh();
  }

  async function update(id: string, field: string, value: string) {
    await supabase.from("licences").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="overflow-x-auto card">
        <table className="data">
          <thead><tr><th>Name</th><th>Regulator</th><th>Status</th></tr></thead>
          <tbody>
            {initial.map((l) => (
              <tr key={l.id}>
                <td><input className="input" defaultValue={l.name} onBlur={(e) => update(l.id, "name", e.target.value)} /></td>
                <td>{regName(l.regulator_id)}</td>
                <td>
                  <select className="input" defaultValue={l.status} onChange={(e) => update(l.id, "status", e.target.value)}>
                    <option>Active</option><option>Retired</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding ? (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Licence name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={regulatorId} onChange={(e) => setRegulatorId(e.target.value)}>
            <option value="">Regulator…</option>
            {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="input" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2"><button className="btn btn-primary btn-sm" onClick={add}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button></div>
        </div>
      ) : (
        <button className="btn btn-ghost mt-3" onClick={() => setAdding(true)}>+ Add licence</button>
      )}
    </div>
  );
}
