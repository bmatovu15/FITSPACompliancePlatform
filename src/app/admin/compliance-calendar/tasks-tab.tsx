"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APPLIES_TO_VALUES, type ComplianceCalendarTask } from "@/lib/types";
import type { RegulatorOption } from "./compliance-calendar-admin-client";

function makeEmptyTask(catalogKey: string) {
  return {
    obligation_external_id: "",
    regulator_id: "",
    catalog_key: catalogKey,
    catalog_year: new Date().getFullYear(),
    task: "",
    applies_to: "ALL",
    period: "",
    period_end: "",
    legal_due: "",
    lead_days: 0,
    internal_target: "",
    owner_role: "",
    reviewer_role: "",
    notes: "",
    source_link: "",
  };
}

export default function TasksTab({
  initial,
  regulators,
  catalogKey,
}: {
  initial: ComplianceCalendarTask[];
  regulators: RegulatorOption[];
  catalogKey: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(() => makeEmptyTask(catalogKey));

  const regulatorName = (id: string | null) => regulators.find((r) => r.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((t) =>
      [t.task, t.catalog_key, t.owner_role, t.obligation_external_id, regulatorName(t.regulator_id)]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [initial, search]);

  async function update(id: string, field: string, value: string | number | null) {
    await supabase.from("compliance_calendar_tasks").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addTask() {
    if (!form.task) return;
    await supabase.from("compliance_calendar_tasks").insert({
      ...form,
      regulator_id: form.regulator_id || null,
      catalog_year: form.catalog_year ? Number(form.catalog_year) : null,
      lead_days: form.lead_days ? Number(form.lead_days) : null,
      period_end: form.period_end || null,
      legal_due: form.legal_due || null,
    });
    setForm(makeEmptyTask(catalogKey));
    setAdding(false);
    router.refresh();
  }

  function toggle(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add task"}
        </button>
      </div>

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Obligation external ID" value={form.obligation_external_id} onChange={(e) => setForm({ ...form, obligation_external_id: e.target.value })} />
          <select className="input" value={form.regulator_id} onChange={(e) => setForm({ ...form, regulator_id: e.target.value })}>
            <option value="">Regulator…</option>
            {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="input" placeholder="Catalog key" value={form.catalog_key} onChange={(e) => setForm({ ...form, catalog_key: e.target.value })} />
          <input className="input" type="number" placeholder="Catalog year" value={form.catalog_year} onChange={(e) => setForm({ ...form, catalog_year: e.target.value })} />
          <select className="input" value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })}>
            {APPLIES_TO_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className="input" placeholder="Owner role" value={form.owner_role} onChange={(e) => setForm({ ...form, owner_role: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Task" value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} />
          <input className="input" placeholder="Period (e.g. Q1 2026)" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
          <input className="input" type="date" placeholder="Period end" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
          <input className="input" type="date" placeholder="Legal due" value={form.legal_due} onChange={(e) => setForm({ ...form, legal_due: e.target.value })} />
          <input className="input" type="number" placeholder="Lead days" value={form.lead_days} onChange={(e) => setForm({ ...form, lead_days: e.target.value })} />
          <input className="input" placeholder="Internal target" value={form.internal_target} onChange={(e) => setForm({ ...form, internal_target: e.target.value })} />
          <input className="input" placeholder="Reviewer role" value={form.reviewer_role} onChange={(e) => setForm({ ...form, reviewer_role: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Source link" value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addTask}>Save task</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr>
              <th>Task</th><th>Applies to</th><th>Catalog year</th><th>Period</th>
              <th>Legal due</th><th>Owner role</th><th>Regulator</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <Fragment key={t.id}>
                <tr>
                  <td style={{ minWidth: 220 }}>
                    <input className="input" defaultValue={t.task} onBlur={(e) => update(t.id, "task", e.target.value)} />
                  </td>
                  <td>
                    <select className="input" defaultValue={t.applies_to} onChange={(e) => update(t.id, "applies_to", e.target.value)}>
                      {APPLIES_TO_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{ width: 90 }}>
                    <input className="input" type="number" defaultValue={t.catalog_year ?? ""} onBlur={(e) => update(t.id, "catalog_year", e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td><input className="input" defaultValue={t.period ?? ""} onBlur={(e) => update(t.id, "period", e.target.value)} /></td>
                  <td><input className="input" type="date" defaultValue={t.legal_due ?? ""} onBlur={(e) => update(t.id, "legal_due", e.target.value || null)} /></td>
                  <td><input className="input" defaultValue={t.owner_role ?? ""} onBlur={(e) => update(t.id, "owner_role", e.target.value)} /></td>
                  <td>
                    <select className="input" defaultValue={t.regulator_id ?? ""} onChange={(e) => update(t.id, "regulator_id", e.target.value || null)}>
                      <option value="">—</option>
                      {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(t.id)}>{expanded[t.id] ? "Hide" : "Details"}</button></td>
                </tr>
                {expanded[t.id] && (
                  <tr>
                    <td colSpan={8}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Obligation external ID
                          <input className="input mt-1" defaultValue={t.obligation_external_id} onBlur={(e) => update(t.id, "obligation_external_id", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Catalog key
                          <input className="input mt-1" defaultValue={t.catalog_key} onBlur={(e) => update(t.id, "catalog_key", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Period end
                          <input className="input mt-1" type="date" defaultValue={t.period_end ?? ""} onBlur={(e) => update(t.id, "period_end", e.target.value || null)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Lead days
                          <input className="input mt-1" type="number" defaultValue={t.lead_days ?? ""} onBlur={(e) => update(t.id, "lead_days", e.target.value ? Number(e.target.value) : null)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Internal target
                          <input className="input mt-1" defaultValue={t.internal_target ?? ""} onBlur={(e) => update(t.id, "internal_target", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Reviewer role
                          <input className="input mt-1" defaultValue={t.reviewer_role ?? ""} onBlur={(e) => update(t.id, "reviewer_role", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Source link
                          <input className="input mt-1" defaultValue={t.source_link ?? ""} onBlur={(e) => update(t.id, "source_link", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Notes
                          <textarea className="input mt-1" rows={2} defaultValue={t.notes ?? ""} onBlur={(e) => update(t.id, "notes", e.target.value)} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No tasks match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
