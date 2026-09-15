"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DigitalCreditFee, DigitalCreditRequirement } from "@/lib/types";

const LEVEL_OPTIONS = ["Yes", "No", "Conditional"] as const;

const emptyRequirement = {
  seq: 0,
  phase: "",
  type: "",
  requirement: "",
  meaning: "",
  money_lender: "No",
  ndt_mfi: "No",
  timing: "",
  evidence: "",
  level: "",
  source: "",
  source_link: "",
  condition: "",
};

const emptyFee = {
  sort_order: 0,
  route: "",
  event: "",
  amount: 0,
  status: "",
  note: "",
  source: "",
  source_link: "",
};

export default function DigitalCreditPathwayAdminClient({
  requirements,
  fees,
}: {
  requirements: DigitalCreditRequirement[];
  fees: DigitalCreditFee[];
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
          Fees ({fees.length})
        </button>
      </div>
      <div className="mt-4">
        {tab === "requirements" ? <RequirementsTable initial={requirements} /> : <FeesTable initial={fees} />}
      </div>
    </div>
  );
}

function RequirementsTable({ initial }: { initial: DigitalCreditRequirement[] }) {
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
    await supabase.from("digital_credit_requirements").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addRequirement() {
    if (!form.requirement) return;
    await supabase.from("digital_credit_requirements").insert({ ...form, seq: Number(form.seq) || 0 });
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
          <LevelSelect label="Money lender" value={form.money_lender} onChange={(v) => setForm({ ...form, money_lender: v })} />
          <LevelSelect label="NDT/MFI" value={form.ndt_mfi} onChange={(v) => setForm({ ...form, ndt_mfi: v })} />
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
              <th>Money lender</th><th>NDT/MFI</th><th>Level</th><th>Source</th><th></th>
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
                  <td><LevelSelect value={r.money_lender} onChange={(v) => update(r.id, "money_lender", v)} /></td>
                  <td><LevelSelect value={r.ndt_mfi} onChange={(v) => update(r.id, "ndt_mfi", v)} /></td>
                  <td><input className="input" defaultValue={r.level ?? ""} onBlur={(e) => update(r.id, "level", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.source ?? ""} onBlur={(e) => update(r.id, "source", e.target.value)} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(r.id)}>{expanded[r.id] ? "Hide" : "Details"}</button></td>
                </tr>
                {expanded[r.id] && (
                  <tr>
                    <td colSpan={9}>
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
              <tr><td colSpan={9} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No requirements match.</td></tr>
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

function FeesTable({ initial }: { initial: DigitalCreditFee[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(emptyFee);

  async function update(id: string, field: string, value: string | number) {
    await supabase.from("digital_credit_fees").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addFee() {
    if (!form.route) return;
    await supabase.from("digital_credit_fees").insert({
      ...form,
      sort_order: Number(form.sort_order) || 0,
      amount: Number(form.amount) || 0,
    });
    setForm(emptyFee);
    setAdding(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add fee"}</button>
      </div>
      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-4">
          <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          <input className="input" placeholder="Route" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} />
          <input className="input" placeholder="Event" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} />
          <input className="input" type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="input" placeholder="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <input className="input" placeholder="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Source link" value={form.source_link} onChange={(e) => setForm({ ...form, source_link: e.target.value })} />
          <button className="btn btn-primary sm:col-span-4" onClick={addFee}>Save fee</button>
        </div>
      )}
      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr>
              <th>Order</th><th>Route</th><th>Event</th><th>Amount</th><th>Status</th><th>Note</th><th>Source</th><th>Source link</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((r) => (
              <tr key={r.id}>
                <td style={{ width: 64 }}><input className="input" type="number" defaultValue={r.sort_order} onBlur={(e) => update(r.id, "sort_order", Number(e.target.value))} /></td>
                <td><input className="input" defaultValue={r.route} onBlur={(e) => update(r.id, "route", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.event} onBlur={(e) => update(r.id, "event", e.target.value)} /></td>
                <td><input className="input" type="number" defaultValue={r.amount} onBlur={(e) => update(r.id, "amount", Number(e.target.value))} /></td>
                <td><input className="input" defaultValue={r.status ?? ""} onBlur={(e) => update(r.id, "status", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.note ?? ""} onBlur={(e) => update(r.id, "note", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.source ?? ""} onBlur={(e) => update(r.id, "source", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.source_link ?? ""} onBlur={(e) => update(r.id, "source_link", e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
