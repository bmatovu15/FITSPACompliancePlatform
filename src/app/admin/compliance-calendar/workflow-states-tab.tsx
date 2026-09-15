"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ComplianceWorkflowState } from "@/lib/types";

export default function WorkflowStatesTab({ initial }: { initial: ComplianceWorkflowState[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ state: "", description: "", sort_order: 0 });

  async function update(originalState: string, field: string, value: string | number) {
    await supabase.from("compliance_workflow_states").update({ [field]: value }).eq("state", originalState);
    router.refresh();
  }

  async function addState() {
    if (!form.state) return;
    await supabase.from("compliance_workflow_states").insert({ ...form, sort_order: Number(form.sort_order) || 0 });
    setForm({ state: "", description: "", sort_order: 0 });
    setAdding(false);
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Defines the canonical status pipeline shown in the member calendar&apos;s workflow dropdown. Renaming a state here
        updates the label everywhere it is displayed; existing member task records keep their stored value, so rename with
        care.
      </p>
      <div className="flex justify-end mt-2">
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add workflow state"}</button>
      </div>
      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addState}>Save state</button>
        </div>
      )}
      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead><tr><th>State</th><th>Description</th><th>Sort order</th></tr></thead>
          <tbody>
            {initial.map((s) => (
              <tr key={s.state}>
                <td><input className="input" defaultValue={s.state} onBlur={(e) => update(s.state, "state", e.target.value)} /></td>
                <td><input className="input" defaultValue={s.description ?? ""} onBlur={(e) => update(s.state, "description", e.target.value)} /></td>
                <td style={{ width: 100 }}>
                  <input className="input" type="number" defaultValue={s.sort_order ?? 0} onBlur={(e) => update(s.state, "sort_order", Number(e.target.value))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
