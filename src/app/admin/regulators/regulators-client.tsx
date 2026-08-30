"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegulatorsClient({ initial }: { initial: any[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");

  async function add() {
    if (!name) return;
    await supabase.from("regulators").insert({ name, sector, status: "Active" });
    setName(""); setSector(""); setAdding(false);
    router.refresh();
  }

  async function update(id: string, field: string, value: string) {
    await supabase.from("regulators").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="overflow-x-auto card">
        <table className="data">
          <thead><tr><th>Name</th><th>Sector</th><th>Status</th></tr></thead>
          <tbody>
            {initial.map((r) => (
              <tr key={r.id}>
                <td><input className="input" defaultValue={r.name} onBlur={(e) => update(r.id, "name", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.sector ?? ""} onBlur={(e) => update(r.id, "sector", e.target.value)} /></td>
                <td>
                  <select className="input" defaultValue={r.status} onChange={(e) => update(r.id, "status", e.target.value)}>
                    <option>Active</option><option>Pending Approval</option><option>Rejected</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding ? (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Sector" value={sector} onChange={(e) => setSector(e.target.value)} />
          <div className="flex gap-2"><button className="btn btn-primary btn-sm" onClick={add}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button></div>
        </div>
      ) : (
        <button className="btn btn-ghost mt-3" onClick={() => setAdding(true)}>+ Add regulator</button>
      )}
    </div>
  );
}
