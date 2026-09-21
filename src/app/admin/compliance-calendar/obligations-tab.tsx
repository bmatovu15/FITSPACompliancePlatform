"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Obligation } from "@/lib/types";
import type { RegulatorOption } from "./compliance-calendar-admin-client";

const SEVERITY_VALUES = ["Critical", "High", "Medium"] as const;

// Which applies_* boolean columns are relevant to show/edit for each catalog.
// Add an entry here when a third catalog with its own applies_* columns ships.
const APPLIES_FIELDS_BY_CATALOG: Record<string, { field: string; label: string }[]> = {
  payments_compliance_assistant: [
    { field: "applies_pso", label: "PSO" },
    { field: "applies_psp", label: "PSP" },
    { field: "applies_emi", label: "EMI" },
    { field: "applies_instrument", label: "Instrument" },
    { field: "applies_agent", label: "Agent" },
    { field: "applies_cards", label: "Cards" },
    { field: "applies_sfi", label: "SFI" },
    { field: "applies_participant", label: "Participant" },
  ],
  digital_lending_compliance_assistant: [
    { field: "applies_money_lender", label: "Money lender" },
    { field: "applies_ndt_mfi", label: "NDT/MFI" },
    { field: "applies_personal_data", label: "Personal data" },
    { field: "applies_collateral", label: "Collateral" },
    { field: "applies_recovery_agents", label: "Recovery agents" },
    { field: "applies_fitspa_subscriber", label: "FITSPA subscriber" },
  ],
};

function appliesFieldsFor(catalogKey: string) {
  return APPLIES_FIELDS_BY_CATALOG[catalogKey] ?? APPLIES_FIELDS_BY_CATALOG.payments_compliance_assistant;
}

function makeEmptyObligation(catalogKey: string) {
  const base: Record<string, unknown> = {
    catalog_key: catalogKey,
    external_id: "",
    domain: "",
    title: "",
    cadence: "",
    legal_deadline: "",
    owner_role: "",
    severity: "Medium",
    authority: "",
    source: "admin",
    status: "Active",
    requires_evidence: false,
    applies_all: false,
  };
  appliesFieldsFor(catalogKey).forEach((f) => {
    base[f.field] = false;
  });
  return base;
}

export default function ObligationsTab({
  initial,
  catalogKey,
  regulators,
}: {
  initial: Obligation[];
  catalogKey: string;
  regulators: RegulatorOption[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(() => makeEmptyObligation(catalogKey));

  const appliesFields = appliesFieldsFor(catalogKey);
  const regulatorName = (id: string | null) => regulators.find((r) => r.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((o) =>
      [o.title, o.external_id, o.domain, o.authority].join(" ").toLowerCase().includes(term)
    );
  }, [initial, search]);

  async function update(id: string, field: string, value: string | boolean | null) {
    await supabase.from("obligations").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addObligation() {
    if (!form.title) return;
    await supabase.from("obligations").insert({
      ...form,
      external_id: form.external_id || null,
    });
    setForm(makeEmptyObligation(catalogKey));
    setAdding(false);
    router.refresh();
  }

  function toggle(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        The catalog-scoped reference obligations behind this calendar&apos;s tasks, events and controls (joined via
        <code> obligation_external_id</code>). This is separate from the member/licence obligations managed under
        Admin → Obligations.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <input type="search" className="input max-w-xs" placeholder="Search obligations…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add obligation"}</button>
      </div>

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="External ID" value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} />
          <input className="input" placeholder="Domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          <select className="input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            {SEVERITY_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <textarea className="input sm:col-span-3" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="Cadence" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })} />
          <input className="input" placeholder="Legal deadline" value={form.legal_deadline} onChange={(e) => setForm({ ...form, legal_deadline: e.target.value })} />
          <input className="input" placeholder="Owner role" value={form.owner_role} onChange={(e) => setForm({ ...form, owner_role: e.target.value })} />
          <input className="input sm:col-span-3" placeholder="Authority" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
          <div className="sm:col-span-3 flex flex-wrap gap-3 items-center">
            <label className="text-sm flex items-center gap-1">
              <input type="checkbox" checked={form.applies_all} onChange={(e) => setForm({ ...form, applies_all: e.target.checked })} />
              Applies to all
            </label>
            {appliesFields.map((f) => (
              <label key={f.field} className="text-sm flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={!!form[f.field]}
                  onChange={(e) => setForm({ ...form, [f.field]: e.target.checked })}
                />
                {f.label}
              </label>
            ))}
          </div>
          <button className="btn btn-primary sm:col-span-3" onClick={addObligation}>Save obligation</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr><th>Title</th><th>Domain</th><th>Cadence</th><th>Severity</th><th>Authority</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <Fragment key={o.id}>
                <tr>
                  <td style={{ minWidth: 220 }}><input className="input" defaultValue={o.title} onBlur={(e) => update(o.id, "title", e.target.value)} /></td>
                  <td><input className="input" defaultValue={o.domain ?? ""} onBlur={(e) => update(o.id, "domain", e.target.value)} /></td>
                  <td><input className="input" defaultValue={o.cadence ?? ""} onBlur={(e) => update(o.id, "cadence", e.target.value)} /></td>
                  <td>
                    <select className="input" defaultValue={o.severity ?? "Medium"} onChange={(e) => update(o.id, "severity", e.target.value)}>
                      {SEVERITY_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td><input className="input" defaultValue={o.authority ?? ""} onBlur={(e) => update(o.id, "authority", e.target.value)} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(o.id)}>{expanded[o.id] ? "Hide" : "Details"}</button></td>
                </tr>
                {expanded[o.id] && (
                  <tr>
                    <td colSpan={6}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          External ID
                          <input className="input mt-1" defaultValue={o.external_id ?? ""} onBlur={(e) => update(o.id, "external_id", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Legal deadline
                          <input className="input mt-1" defaultValue={o.legal_deadline ?? ""} onBlur={(e) => update(o.id, "legal_deadline", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Owner role
                          <input className="input mt-1" defaultValue={o.owner_role ?? ""} onBlur={(e) => update(o.id, "owner_role", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Regulator
                          <input className="input mt-1" defaultValue={regulatorName(o.regulator_id)} disabled />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Description
                          <textarea className="input mt-1" rows={2} defaultValue={o.description ?? ""} onBlur={(e) => update(o.id, "description", e.target.value)} />
                        </label>
                        <div className="sm:col-span-2 flex flex-wrap gap-3 items-center mt-1">
                          <label className="text-xs flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
                            <input type="checkbox" defaultChecked={o.applies_all} onChange={(e) => update(o.id, "applies_all", e.target.checked)} />
                            Applies to all
                          </label>
                          {appliesFields.map((f) => (
                            <label key={f.field} className="text-xs flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
                              <input
                                type="checkbox"
                                defaultChecked={!!(o as unknown as Record<string, boolean>)[f.field]}
                                onChange={(e) => update(o.id, f.field, e.target.checked)}
                              />
                              {f.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No obligations match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
