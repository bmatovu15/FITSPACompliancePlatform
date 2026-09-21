"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APPLIES_TO_VALUES, type ComplianceEvent } from "@/lib/types";
import type { RegulatorOption } from "./compliance-calendar-admin-client";

function makeEmptyEvent(catalogKey: string) {
  return {
    obligation_external_id: "",
    regulator_id: "",
    catalog_key: catalogKey,
    trigger_name: "",
    applies_to: "ALL",
    legal_clock: "",
    response: "",
    owner_role: "",
    escalation: "",
    evidence: "",
    source_citation: "",
    source_link: "",
    notes: "",
  };
}

export default function EventsTab({
  initial,
  regulators,
  catalogKey,
}: {
  initial: ComplianceEvent[];
  regulators: RegulatorOption[];
  catalogKey: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(() => makeEmptyEvent(catalogKey));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((e) => [e.trigger_name, e.catalog_key, e.owner_role].join(" ").toLowerCase().includes(term));
  }, [initial, search]);

  async function update(id: string, field: string, value: string | null) {
    await supabase.from("compliance_events").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addEvent() {
    if (!form.trigger_name) return;
    await supabase.from("compliance_events").insert({ ...form, regulator_id: form.regulator_id || null, obligation_external_id: form.obligation_external_id || null });
    setForm(makeEmptyEvent(catalogKey));
    setAdding(false);
    router.refresh();
  }

  function toggle(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" className="input max-w-xs" placeholder="Search events…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add event"}</button>
      </div>

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Obligation external ID" value={form.obligation_external_id} onChange={(e) => setForm({ ...form, obligation_external_id: e.target.value })} />
          <select className="input" value={form.regulator_id} onChange={(e) => setForm({ ...form, regulator_id: e.target.value })}>
            <option value="">Regulator…</option>
            {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="input" placeholder="Catalog key" value={form.catalog_key} onChange={(e) => setForm({ ...form, catalog_key: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Trigger name" value={form.trigger_name} onChange={(e) => setForm({ ...form, trigger_name: e.target.value })} />
          <select className="input" value={form.applies_to} onChange={(e) => setForm({ ...form, applies_to: e.target.value })}>
            {APPLIES_TO_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className="input" placeholder="Legal clock" value={form.legal_clock} onChange={(e) => setForm({ ...form, legal_clock: e.target.value })} />
          <input className="input" placeholder="Owner role" value={form.owner_role} onChange={(e) => setForm({ ...form, owner_role: e.target.value })} />
          <input className="input" placeholder="Escalation" value={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Response" value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} />
          <input className="input" placeholder="Evidence" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
          <input className="input" placeholder="Source citation" value={form.source_citation} onChange={(e) => setForm({ ...form, source_citation: e.target.value })} />
          <input className="input" placeholder="Source link" value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addEvent}>Save event</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr><th>Trigger</th><th>Applies to</th><th>Legal clock</th><th>Owner role</th><th>Regulator</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <Fragment key={e.id}>
                <tr>
                  <td style={{ minWidth: 220 }}><input className="input" defaultValue={e.trigger_name} onBlur={(ev) => update(e.id, "trigger_name", ev.target.value)} /></td>
                  <td>
                    <select className="input" defaultValue={e.applies_to} onChange={(ev) => update(e.id, "applies_to", ev.target.value)}>
                      {APPLIES_TO_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td><input className="input" defaultValue={e.legal_clock ?? ""} onBlur={(ev) => update(e.id, "legal_clock", ev.target.value)} /></td>
                  <td><input className="input" defaultValue={e.owner_role ?? ""} onBlur={(ev) => update(e.id, "owner_role", ev.target.value)} /></td>
                  <td>
                    <select className="input" defaultValue={e.regulator_id ?? ""} onChange={(ev) => update(e.id, "regulator_id", ev.target.value || null)}>
                      <option value="">—</option>
                      {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(e.id)}>{expanded[e.id] ? "Hide" : "Details"}</button></td>
                </tr>
                {expanded[e.id] && (
                  <tr>
                    <td colSpan={6}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Obligation external ID
                          <input className="input mt-1" defaultValue={e.obligation_external_id ?? ""} onBlur={(ev) => update(e.id, "obligation_external_id", ev.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Catalog key
                          <input className="input mt-1" defaultValue={e.catalog_key} onBlur={(ev) => update(e.id, "catalog_key", ev.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Response
                          <textarea className="input mt-1" rows={2} defaultValue={e.response ?? ""} onBlur={(ev) => update(e.id, "response", ev.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Escalation
                          <input className="input mt-1" defaultValue={e.escalation ?? ""} onBlur={(ev) => update(e.id, "escalation", ev.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Evidence
                          <input className="input mt-1" defaultValue={e.evidence ?? ""} onBlur={(ev) => update(e.id, "evidence", ev.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Source citation
                          <input className="input mt-1" defaultValue={e.source_citation ?? ""} onBlur={(ev) => update(e.id, "source_citation", ev.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Source link
                          <input className="input mt-1" defaultValue={e.source_link ?? ""} onBlur={(ev) => update(e.id, "source_link", ev.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Notes
                          <textarea className="input mt-1" rows={2} defaultValue={e.notes ?? ""} onBlur={(ev) => update(e.id, "notes", ev.target.value)} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No events match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
