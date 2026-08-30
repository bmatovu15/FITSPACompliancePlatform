"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MembersClient({
  members, memberLicences, licences, regulators,
}: { members: any[]; memberLicences: any[]; licences: any[]; regulators: any[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newLicenceId, setNewLicenceId] = useState("");
  const [newNumber, setNewNumber] = useState("");

  const regName = (id: string) => regulators.find((r) => r.id === id)?.name ?? "—";
  const licName = (id: string) => licences.find((l) => l.id === id)?.name ?? "—";

  async function setMemberStatus(id: string, status: string) {
    await supabase.from("members").update({ status }).eq("id", id);
    router.refresh();
  }

  async function setLicenceField(id: string, field: string, value: any) {
    await supabase.from("member_licences").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addLicence(memberId: string) {
    if (!newLicenceId || !newNumber) return;
    await supabase.from("member_licences").insert({ member_id: memberId, licence_id: newLicenceId, licence_number: newNumber, status: "Pending", verified: false });
    setNewLicenceId(""); setNewNumber("");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      {members.map((m) => {
        const mine = memberLicences.filter((ml) => ml.member_id === m.id);
        const isOpen = expanded === m.id;
        return (
          <div key={m.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 cursor-pointer" onClick={() => setExpanded(isOpen ? null : m.id)}>
              <div>
                <p className="font-medium">{m.company_name}</p>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{m.company_email} · {m.fitspa_member_id ?? "no FITSPA ID"}</p>
              </div>
              <select className="input w-auto" value={m.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setMemberStatus(m.id, e.target.value)}>
                <option value="pending_activation">Pending activation</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            {isOpen && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
                <table className="data">
                  <thead><tr><th>Regulator</th><th>Licence</th><th>Number</th><th>Status</th><th>Verified</th></tr></thead>
                  <tbody>
                    {mine.map((ml) => (
                      <tr key={ml.id}>
                        <td>{regName(licences.find((l) => l.id === ml.licence_id)?.regulator_id)}</td>
                        <td>{licName(ml.licence_id)}</td>
                        <td><input className="input" defaultValue={ml.licence_number ?? ""} onBlur={(e) => setLicenceField(ml.id, "licence_number", e.target.value)} /></td>
                        <td>
                          <select className="input" defaultValue={ml.status} onChange={(e) => setLicenceField(ml.id, "status", e.target.value)}>
                            {["Active", "Pending", "Expired", "Suspended"].map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="checkbox" checked={ml.verified} onChange={(e) => setLicenceField(ml.id, "verified", e.target.checked)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select className="input w-auto" value={newLicenceId} onChange={(e) => setNewLicenceId(e.target.value)}>
                    <option value="">Add licence…</option>
                    {licences.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <input className="input w-auto" placeholder="Licence #" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
                  <button className="btn btn-primary btn-sm" onClick={() => addLicence(m.id)}>Link licence</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
