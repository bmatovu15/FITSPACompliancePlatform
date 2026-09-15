"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { NpsFeeTier, NpsRequirement } from "@/lib/types";

const LEVEL_OPTIONS = ["Yes", "No", "Conditional"] as const;
const INSTRUMENT_OPTIONS = ["Yes", "No", "Conditional", "Information only"] as const;

const emptyRequirement = {
  seq: 0,
  phase: "",
  type: "",
  requirement: "",
  meaning: "",
  pso: "No",
  psp_other: "No",
  psp_emi: "No",
  instrument: "No",
  timing: "",
  evidence: "",
  level: "",
  source: "",
  source_link: "",
  condition: "",
};

const emptyFeeTier = {
  sort_order: 0,
  category: "",
  class: "",
  threshold: "",
  application_fee: 0,
  licensing_fee: 0,
  annual_fee: 0,
  min_capital: 0,
};

export default function NpsPathwayAdminClient({
  requirements,
  feeTiers,
}: {
  requirements: NpsRequirement[];
  feeTiers: NpsFeeTier[];
}) {
  const [tab, setTab] = useState<"requirements" | "fees">("requirements");
  return (
    <div className="mt-6">
      <div className="flex gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
        <button
          className={`btn btn-sm ${tab === "requirements" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("requirements")}
        >
          Requirements ({requirements.length})
        </button>
        <button className={`btn btn-sm ${tab === "fees" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("fees")}>
          Fee tiers ({feeTiers.length})
        </button>
      </div>
      <div className="mt-4">
        {tab === "requirements" ? <RequirementsTable initial={requirements} /> : <FeeTiersTable initial={feeTiers} />}
      </div>
    </div>
  );
}

function RequirementsTable({ initial }: { initial: NpsRequirement[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(emptyRequirement);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((r) =>
      [r.requirement, r.meaning, r.phase, r.type, r.id].join(" ").toLowerCase().includes(term)
    );
  }, [initial, search]);

  async function update(id: string, field: string, value: string | number) {
    await supabase.from("nps_requirements").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addRequirement() {
    if (!form.requirement) return;
    await supabase.from("nps_requirements").insert({ ...form, seq: Number(form.seq) || 0 });
    setForm(emptyRequirement);
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
          placeholder="Search requirements…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add requirement"}
        </button>
      </div>

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" type="number" placeholder="Seq" value={form.seq} onChange={(e) => setForm({ ...form, seq: e.target.value })} />
          <input className="input" placeholder="Phase" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
          <input className="input" placeholder="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Requirement" value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Meaning" value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
          <LevelSelect label="PSO" value={form.pso} onChange={(v) => setForm({ ...form, pso: v })} />
          <LevelSelect label="PSP (other)" value={form.psp_other} onChange={(v) => setForm({ ...form, psp_other: v })} />
          <LevelSelect label="PSP (EMI)" value={form.psp_emi} onChange={(v) => setForm({ ...form, psp_emi: v })} />
          <select className="input" value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })}>
            {INSTRUMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input className="input" placeholder="Timing" value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value })} />
          <input className="input" placeholder="Evidence" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
          <input className="input" placeholder="Level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
          <input className="input" placeholder="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <input className="input" placeholder="Source link" value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} />
          <input className="input" placeholder="Condition" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} />
          <button className="btn btn-primary sm:col-span-3" onClick={addRequirement}>Save requirement</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr>
              <th>Seq</th><th>Phase</th><th>Type</th><th>Requirement</th>
              <th>PSO</th><th>PSP other</th><th>PSP EMI</th><th>Instrument</th>
              <th>Level</th><th>Source</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td style={{ width: 64 }}>
                    <input className="input" type="number" defaultValue={r.seq} onBlur={(e) => update(r.id, "seq", Number(e.target.value))} />
                  </td>
                  <td><input className="input" defaultValue={r.phase} onBlur={(e) => update(r.id, "phase", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.type} onBlur={(e) => update(r.id, "type", e.target.value)} /></td>
                  <td style={{ minWidth: 220 }}>
                    <input className="input" defaultValue={r.requirement} onBlur={(e) => update(r.id, "requirement", e.target.value)} />
                  </td>
                  <td><LevelSelect value={r.pso} onChange={(v) => update(r.id, "pso", v)} /></td>
                  <td><LevelSelect value={r.psp_other} onChange={(v) => update(r.id, "psp_other", v)} /></td>
                  <td><LevelSelect value={r.psp_emi} onChange={(v) => update(r.id, "psp_emi", v)} /></td>
                  <td>
                    <select className="input" defaultValue={r.instrument} onChange={(e) => update(r.id, "instrument", e.target.value)}>
                      {INSTRUMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td><input className="input" defaultValue={r.level ?? ""} onBlur={(e) => update(r.id, "level", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.source ?? ""} onBlur={(e) => update(r.id, "source", e.target.value)} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(r.id)}>{expanded[r.id] ? "Hide" : "Details"}</button></td>
                </tr>
                {expanded[r.id] && (
                  <tr>
                    <td colSpan={11}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Meaning
                          <textarea className="input mt-1" rows={3} defaultValue={r.meaning} onBlur={(e) => update(r.id, "meaning", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Condition
                          <textarea className="input mt-1" rows={3} defaultValue={r.condition ?? ""} onBlur={(e) => update(r.id, "condition", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Timing
                          <input className="input mt-1" defaultValue={r.timing ?? ""} onBlur={(e) => update(r.id, "timing", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Evidence
                          <input className="input mt-1" defaultValue={r.evidence ?? ""} onBlur={(e) => update(r.id, "evidence", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Source link
                          <input className="input mt-1" defaultValue={r.source_link ?? ""} onBlur={(e) => update(r.id, "source_link", e.target.value)} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No requirements match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LevelSelect({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" defaultValue={value} onChange={(e) => onChange(e.target.value)} title={label}>
      {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function FeeTiersTable({ initial }: { initial: NpsFeeTier[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(emptyFeeTier);

  async function update(id: string, field: string, value: string | number) {
    await supabase.from("nps_fee_tiers").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addFeeTier() {
    if (!form.category) return;
    await supabase.from("nps_fee_tiers").insert({
      ...form,
      sort_order: Number(form.sort_order) || 0,
      application_fee: Number(form.application_fee) || 0,
      licensing_fee: Number(form.licensing_fee) || 0,
      annual_fee: Number(form.annual_fee) || 0,
      min_capital: Number(form.min_capital) || 0,
    });
    setForm(emptyFeeTier);
    setAdding(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add fee tier"}</button>
      </div>
      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-4">
          <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          <input className="input" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input className="input" placeholder="Class" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} />
          <input className="input" placeholder="Threshold" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
          <input className="input" type="number" placeholder="Application fee" value={form.application_fee} onChange={(e) => setForm({ ...form, application_fee: e.target.value })} />
          <input className="input" type="number" placeholder="Licensing fee" value={form.licensing_fee} onChange={(e) => setForm({ ...form, licensing_fee: e.target.value })} />
          <input className="input" type="number" placeholder="Annual fee" value={form.annual_fee} onChange={(e) => setForm({ ...form, annual_fee: e.target.value })} />
          <input className="input" type="number" placeholder="Min capital" value={form.min_capital} onChange={(e) => setForm({ ...form, min_capital: e.target.value })} />
          <button className="btn btn-primary sm:col-span-4" onClick={addFeeTier}>Save fee tier</button>
        </div>
      )}
      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr>
              <th>Order</th><th>Category</th><th>Class</th><th>Threshold</th>
              <th>Application fee</th><th>Licensing fee</th><th>Annual fee</th><th>Min capital</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((r) => (
              <tr key={r.id}>
                <td style={{ width: 64 }}><input className="input" type="number" defaultValue={r.sort_order} onBlur={(e) => update(r.id, "sort_order", Number(e.target.value))} /></td>
                <td><input className="input" defaultValue={r.category} onBlur={(e) => update(r.id, "category", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.class} onBlur={(e) => update(r.id, "class", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.threshold} onBlur={(e) => update(r.id, "threshold", e.target.value)} /></td>
                <td><input className="input" type="number" defaultValue={r.application_fee} onBlur={(e) => update(r.id, "application_fee", Number(e.target.value))} /></td>
                <td><input className="input" type="number" defaultValue={r.licensing_fee} onBlur={(e) => update(r.id, "licensing_fee", Number(e.target.value))} /></td>
                <td><input className="input" type="number" defaultValue={r.annual_fee} onBlur={(e) => update(r.id, "annual_fee", Number(e.target.value))} /></td>
                <td><input className="input" type="number" defaultValue={r.min_capital} onBlur={(e) => update(r.id, "min_capital", Number(e.target.value))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
