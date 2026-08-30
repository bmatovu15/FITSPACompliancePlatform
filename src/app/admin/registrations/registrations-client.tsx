"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegistrationsClient({ initial, regulators, licences }: { initial: any[]; regulators: any[]; licences: any[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [regulatorId, setRegulatorId] = useState("");
  const [licenceId, setLicenceId] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [companyName, setCompanyName] = useState("");

  const regName = (id: string) => regulators.find((r) => r.id === id)?.name ?? "—";
  const licName = (id: string | null) => licences.find((l) => l.id === id)?.name ?? "Any";

  async function add() {
    if (!regulatorId || !licenceNumber || !companyName) return;
    await supabase.from("regulator_registrations").insert({
      regulator_id: regulatorId, licence_id: licenceId || null, licence_number: licenceNumber, registered_company_name: companyName,
    });
    setRegulatorId(""); setLicenceId(""); setLicenceNumber(""); setCompanyName(""); setAdding(false);
    router.refresh();
  }

  async function remove(id: string) {
    await supabase.from("regulator_registrations").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="overflow-x-auto card">
        <table className="data">
          <thead><tr><th>Regulator</th><th>Licence</th><th>Licence #</th><th>Registered company</th><th></th></tr></thead>
          <tbody>
            {initial.map((r) => (
              <tr key={r.id}>
                <td>{regName(r.regulator_id)}</td>
                <td>{licName(r.licence_id)}</td>
                <td>{r.licence_number}</td>
                <td>{r.registered_company_name}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => remove(r.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding ? (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-2">
          <select className="input" value={regulatorId} onChange={(e) => setRegulatorId(e.target.value)}>
            <option value="">Regulator…</option>
            {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input" value={licenceId} onChange={(e) => setLicenceId(e.target.value)}>
            <option value="">Licence (optional)…</option>
            {licences.filter((l) => l.regulator_id === regulatorId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input className="input" placeholder="Licence number" value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} />
          <input className="input" placeholder="Registered company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <div className="flex gap-2 sm:col-span-2"><button className="btn btn-primary btn-sm" onClick={add}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button></div>
        </div>
      ) : (
        <button className="btn btn-ghost mt-3" onClick={() => setAdding(true)}>+ Add registry entry</button>
      )}
    </div>
  );
}
