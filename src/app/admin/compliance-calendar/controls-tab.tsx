"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APPLIES_TO_VALUES, type ComplianceControl } from "@/lib/types";
import type { RegulatorOption } from "./compliance-calendar-admin-client";

const emptyControl = {
  regulator_id: "",
  catalog_key: "payments_compliance_assistant",
  domain: "",
  objective: "",
  operation: "",
  applies_to: "ALL",
  cadence: "",
  owner_role: "",
  reviewer_role: "",
  evidence: "",
  failure_response: "",
  legal_basis: "",
  source_link: "",
};

export default function ControlsTab({ initial, regulators }: { initial: ComplianceControl[]; regulators: RegulatorOption[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(emptyControl);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((c) => [c.domain, c.objective, c.owner_role].join(" ").toLowerCase().includes(term));
  }, [initial, search]);

  async function update(id: string, field: string, value: string | null) {
    await supabase.from("compliance_controls").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addControl() {
    if (!form.objective) return;
    await supabase.from("compliance_controls").insert({ ...form, regulator_id: form.regulator_id || null });
    setForm(emptyControl);
    setAdding(false);
    router.refresh();
  }

  function toggle(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" className="input max-w-xs" placeholder="Search controls…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add control"}</button>
      </div>

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <select className="input" value={form.regulator_id} onChange={(e) => setForm({ ...form, regulator_id: e.target.value })}>
            <option value="">Regulator…</option>
            {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="input" placeholder="Catalog key" value={form.catalog_key} onChange={(e) => setForm({ ...form, catalog_key: e.target.value })} />
          <input className="input" placeholder="Domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Objective" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Operation" value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })} />
          <select className="input" value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })}>
            {APPLIES_TO_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className="input" placeholder="Cadence" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })} />
          <input className="input" placeholder="Owner role" value={form.owner_role} onChange={(e) => setForm({ ...form, owner_role: e.target.value })} />
          <input className="input" placeholder="Reviewer role" value={form.reviewer_role} onChange={(e) => setForm({ ...form, reviewer_role: e.target.value })} />
          <input className="input" placeholder="Evidence" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Failure response" value={form.failure_response} onChange={(e) => setForm({ ...form, failure_response: e.target.value })} />
          <input className="input" placeholder="Legal basis" value={form.legal_basis} onChange={(e) => setForm({ ...form, legal_basis: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Source link" value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addControl}>Save control</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr><th>Domain</th><th>Objective</th><th>Applies to</th><th>Cadence</th><th>Owner role</th><th>Regulator</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td><input className="input" defaultValue={c.domain ?? ""} onBlur={(e) => update(c.id, "domain", e.target.value)} /></td>
                  <td style={{ minWidth: 220 }}><input className="input" defaultValue={c.objective} onBlur={(e) => update(c.id, "objective", e.target.value)} /></td>
                  <td>
                    <select className="input" defaultValue={c.applies_to} onChange={(e) => update(c.id, "applies_to", e.target.value)}>
                      {APPLIES_TO_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td><input className="input" defaultValue={c.cadence ?? ""} onBlur={(e) => update(c.id, "cadence", e.target.value)} /></td>
                  <td><input className="input" defaultValue={c.owner_role ?? ""} onBlur={(e) => update(c.id, "owner_role", e.target.value)} /></td>
                  <td>
                    <select className="input" defaultValue={c.regulator_id ?? ""} onChange={(e) => update(c.id, "regulator_id", e.target.value || null)}>
                      <option value="">—</option>
                      {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(c.id)}>{expanded[c.id] ? "Hide" : "Details"}</button></td>
                </tr>
                {expanded[c.id] && (
                  <tr>
                    <td colSpan={7}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Catalog key
                          <input className="input mt-1" defaultValue={c.catalog_key} onBlur={(e) => update(c.id, "catalog_key", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Reviewer role
                          <input className="input mt-1" defaultValue={c.reviewer_role ?? ""} onBlur={(e) => update(c.id, "reviewer_role", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Operation
                          <textarea className="input mt-1" rows={2} defaultValue={c.operation ?? ""} onBlur={(e) => update(c.id, "operation", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Evidence
                          <input className="input mt-1" defaultValue={c.evidence ?? ""} onBlur={(e) => update(c.id, "evidence", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Legal basis
                          <input className="input mt-1" defaultValue={c.legal_basis ?? ""} onBlur={(e) => update(c.id, "legal_basis", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Failure response
                          <textarea className="input mt-1" rows={2} defaultValue={c.failure_response ?? ""} onBlur={(e) => update(c.id, "failure_response", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Source link
                          <input className="input mt-1" defaultValue={c.source_link ?? ""} onBlur={(e) => update(c.id, "source_link", e.target.value)} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No controls match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
