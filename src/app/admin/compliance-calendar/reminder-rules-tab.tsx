"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ComplianceReminderRule } from "@/lib/types";

const emptyRule = { sort_order: 0, rule: "", legal_clock: "", pattern: "", escalation: "", completion: "" };

export default function ReminderRulesTab({ initial }: { initial: ComplianceReminderRule[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(emptyRule);

  async function update(id: string, field: string, value: string | number) {
    await supabase.from("compliance_reminder_rules").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addRule() {
    if (!form.rule) return;
    await supabase.from("compliance_reminder_rules").insert({ ...form, sort_order: Number(form.sort_order) || 0 });
    setForm(emptyRule);
    setAdding(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add reminder rule"}</button>
      </div>
      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Rule" value={form.rule} onChange={(e) => setForm({ ...form, rule: e.target.value })} />
          <input className="input" placeholder="Legal clock" value={form.legal_clock} onChange={(e) => setForm({ ...form, legal_clock: e.target.value })} />
          <input className="input" placeholder="Pattern" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
          <input className="input" placeholder="Escalation" value={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.value })} />
          <input className="input sm:col-span-3" placeholder="Completion" value={form.completion} onChange={(e) => setForm({ ...form, completion: e.target.value })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addRule}>Save rule</button>
        </div>
      )}
      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead><tr><th>Order</th><th>Rule</th><th>Legal clock</th><th>Pattern</th><th>Escalation</th><th>Completion</th></tr></thead>
          <tbody>
            {initial.map((r) => (
              <tr key={r.id}>
                <td style={{ width: 64 }}><input className="input" type="number" defaultValue={r.sort_order ?? 0} onBlur={(e) => update(r.id, "sort_order", Number(e.target.value))} /></td>
                <td><input className="input" defaultValue={r.rule} onBlur={(e) => update(r.id, "rule", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.legal_clock ?? ""} onBlur={(e) => update(r.id, "legal_clock", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.pattern ?? ""} onBlur={(e) => update(r.id, "pattern", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.escalation ?? ""} onBlur={(e) => update(r.id, "escalation", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.completion ?? ""} onBlur={(e) => update(r.id, "completion", e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
