"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ComplianceHoliday } from "@/lib/types";

const emptyHoliday = { holiday_date: "", name: "", type: "" };

export default function HolidaysTab({ initial }: { initial: ComplianceHoliday[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyHoliday);

  async function update(id: string, field: string, value: string) {
    await supabase.from("compliance_holidays").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addHoliday() {
    if (!form.holiday_date || !form.name) return;
    await supabase.from("compliance_holidays").insert(form);
    setForm(emptyHoliday);
    setAdding(false);
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        This is where an admin adds next year&apos;s declared holidays, used to push deadlines that fall on a holiday to
        the next business day.
      </p>
      <div className="flex justify-end mt-2">
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add holiday"}</button>
      </div>
      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" type="date" placeholder="Date" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} />
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addHoliday}>Save holiday</button>
        </div>
      )}
      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead><tr><th>Date</th><th>Name</th><th>Type</th></tr></thead>
          <tbody>
            {initial.map((h) => (
              <tr key={h.id}>
                <td style={{ width: 160 }}><input className="input" type="date" defaultValue={h.holiday_date} onBlur={(e) => update(h.id, "holiday_date", e.target.value)} /></td>
                <td><input className="input" defaultValue={h.name} onBlur={(e) => update(h.id, "name", e.target.value)} /></td>
                <td><input className="input" defaultValue={h.type ?? ""} onBlur={(e) => update(h.id, "type", e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
