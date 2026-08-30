"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LicencesClient({
  memberLicences, allLicences, regulators,
}: { memberLicences: any[]; allLicences: any[]; regulators: any[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newLicenceId, setNewLicenceId] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [saving, setSaving] = useState(false);

  const regName = (id: string) => regulators.find((r) => r.id === id)?.name ?? "—";

  async function updateField(id: string, field: string, value: string) {
    await supabase.from("member_licences").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addLicence() {
    if (!newLicenceId || !newNumber) return;
    setSaving(true);
    await supabase.rpc("add_member_licence", { p_licence_id: newLicenceId, p_licence_number: newNumber });
    setSaving(false);
    setAdding(false);
    setNewLicenceId("");
    setNewNumber("");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      {memberLicences.map((ml) => (
        <div key={ml.id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{ml.licences?.name}</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{regName(ml.licences?.regulator_id)}</p>
            </div>
            <span className={`badge ${ml.verified ? "badge-green" : "badge-amber"}`}>
              {ml.verified ? "Verified" : "Pending verification"}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Licence number</label>
              <input className="input" defaultValue={ml.licence_number ?? ""} onBlur={(e) => updateField(ml.id, "licence_number", e.target.value)} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" defaultValue={ml.status} onChange={(e) => updateField(ml.id, "status", e.target.value)}>
                {["Active", "Pending", "Expired", "Suspended"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Expiry date</label>
              <input className="input" type="date" defaultValue={ml.expiry_date ?? ""} onChange={(e) => updateField(ml.id, "expiry_date", e.target.value)} />
            </div>
          </div>
          {ml.verification_note && (
            <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>{ml.verification_note}</p>
          )}
        </div>
      ))}

      {adding ? (
        <div className="card p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Licence</label>
              <select className="input" value={newLicenceId} onChange={(e) => setNewLicenceId(e.target.value)}>
                <option value="">Select…</option>
                {allLicences.map((l) => <option key={l.id} value={l.id}>{l.name} — {regName(l.regulator_id)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Licence number</label>
              <input className="input" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={addLicence}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" onClick={() => setAdding(true)}>+ Add another licence</button>
      )}
    </div>
  );
}
