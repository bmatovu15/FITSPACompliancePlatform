"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ComplianceCatalogFee } from "@/lib/types";

function makeEmptyFee(catalogKey: string) {
  return {
    catalog_key: catalogKey,
    route_or_layer: "",
    fee_or_requirement: "",
    amount: "",
    when_due: "",
    treatment: "",
    source: "",
    sort_order: 0,
  };
}

export default function FeesTab({ initial, catalogKey }: { initial: ComplianceCatalogFee[]; catalogKey: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(() => makeEmptyFee(catalogKey));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((f) =>
      [f.route_or_layer, f.fee_or_requirement, f.when_due].join(" ").toLowerCase().includes(term)
    );
  }, [initial, search]);

  async function update(id: number, field: string, value: string | number | null) {
    await supabase.from("compliance_catalog_fees").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addFee() {
    if (!form.fee_or_requirement) return;
    await supabase.from("compliance_catalog_fees").insert({
      ...form,
      sort_order: Number(form.sort_order) || 0,
    });
    setForm(makeEmptyFee(catalogKey));
    setAdding(false);
    router.refresh();
  }

  async function deleteFee(id: number) {
    if (!confirm("Delete this fee row? This cannot be undone.")) return;
    await supabase.from("compliance_catalog_fees").delete().eq("id", id);
    router.refresh();
  }

  function toggle(id: number) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" className="input max-w-xs" placeholder="Search fees…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add fee"}</button>
      </div>

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Route / layer" value={form.route_or_layer} onChange={(e) => setForm({ ...form, route_or_layer: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Fee / requirement" value={form.fee_or_requirement} onChange={(e) => setForm({ ...form, fee_or_requirement: e.target.value })} />
          <input className="input" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="input" placeholder="When due" value={form.when_due} onChange={(e) => setForm({ ...form, when_due: e.target.value })} />
          <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Treatment" value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} />
          <input className="input sm:col-span-3" placeholder="Source (link or citation)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addFee}>Save fee</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr><th>Route / layer</th><th>Fee / requirement</th><th>Amount</th><th>When due</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <Fragment key={f.id}>
                <tr>
                  <td><input className="input" defaultValue={f.route_or_layer ?? ""} onBlur={(e) => update(f.id, "route_or_layer", e.target.value)} /></td>
                  <td style={{ minWidth: 220 }}><input className="input" defaultValue={f.fee_or_requirement} onBlur={(e) => update(f.id, "fee_or_requirement", e.target.value)} /></td>
                  <td><input className="input" defaultValue={f.amount ?? ""} onBlur={(e) => update(f.id, "amount", e.target.value)} /></td>
                  <td><input className="input" defaultValue={f.when_due ?? ""} onBlur={(e) => update(f.id, "when_due", e.target.value)} /></td>
                  <td className="flex gap-1">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(f.id)}>{expanded[f.id] ? "Hide" : "Details"}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteFee(f.id)}>Delete</button>
                  </td>
                </tr>
                {expanded[f.id] && (
                  <tr>
                    <td colSpan={5}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Treatment
                          <textarea className="input mt-1" rows={2} defaultValue={f.treatment ?? ""} onBlur={(e) => update(f.id, "treatment", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Source
                          <input className="input mt-1" defaultValue={f.source ?? ""} onBlur={(e) => update(f.id, "source", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Sort order
                          <input className="input mt-1" type="number" defaultValue={f.sort_order} onBlur={(e) => update(f.id, "sort_order", Number(e.target.value))} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No fees match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
