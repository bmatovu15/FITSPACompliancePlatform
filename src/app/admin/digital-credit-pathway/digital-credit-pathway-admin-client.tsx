"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PathwayFee, PathwayRequirement } from "@/lib/types";

const LEVEL_OPTIONS = ["Yes", "No", "Conditional"] as const;
const PATHWAY_KEY = "digital_credit";

// ---------------------------------------------------------------------------
// This admin screen now reads/writes the generic `pathway_requirements` /
// `pathway_fees` tables (scoped to pathway_key='digital_credit') instead of
// the old bespoke digital_credit_requirements/digital_credit_fees tables.
// The flat money_lender/ndt_mfi fields the form/table below work with are
// adapted to/from `applicability` jsonb (keyed MONEY_LENDER/NDT_MFI) at the
// read and write boundary, so the rest of this UI is unchanged.
// ---------------------------------------------------------------------------

type FlatRequirement = {
  dbId: string;
  external_id: string;
  seq: number;
  phase: string;
  type: string;
  requirement: string;
  meaning: string;
  money_lender: string;
  ndt_mfi: string;
  timing: string;
  evidence: string;
  level: string;
  source: string;
  source_link: string;
  condition: string;
};

function toFlat(row: PathwayRequirement): FlatRequirement {
  const a = (row.applicability ?? {}) as Record<string, string>;
  return {
    dbId: row.id,
    external_id: row.external_id,
    seq: row.seq,
    phase: row.phase,
    type: row.item_type ?? "",
    requirement: row.requirement,
    meaning: row.meaning ?? "",
    money_lender: a.MONEY_LENDER ?? "No",
    ndt_mfi: a.NDT_MFI ?? "No",
    timing: row.timing ?? "",
    evidence: row.evidence ?? "",
    level: row.level ?? "",
    source: row.source ?? "",
    source_link: row.source_link ?? "",
    condition: row.condition ?? "",
  };
}

const emptyRequirement = {
  external_id: "",
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

type FlatFee = {
  dbId: string;
  sort_order: number;
  route: string;
  event: string;
  amount: number;
  status: string;
  note: string;
  source: string;
  source_link: string;
};

function toFlatFee(row: PathwayFee): FlatFee {
  return {
    dbId: row.id,
    sort_order: row.sort_order,
    route: row.route ?? "",
    event: row.event ?? "",
    amount: Number(row.amount ?? 0),
    status: row.status ?? "",
    note: row.note ?? "",
    source: row.source ?? "",
    source_link: row.source_link ?? "",
  };
}

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
  requirements: PathwayRequirement[];
  fees: PathwayFee[];
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
        {tab === "requirements" ? (
          <RequirementsTable initial={requirements.map(toFlat)} />
        ) : (
          <FeesTable initial={fees.map(toFlatFee)} />
        )}
      </div>
    </div>
  );
}

function RequirementsTable({ initial }: { initial: FlatRequirement[] }) {
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
      [r.requirement, r.meaning, r.phase, r.type, r.external_id].join(" ").toLowerCase().includes(term)
    );
  }, [initial, search]);

  async function update(row: FlatRequirement, field: string, value: string | number) {
    if (field === "money_lender" || field === "ndt_mfi") {
      const applicability = {
        MONEY_LENDER: field === "money_lender" ? value : row.money_lender,
        NDT_MFI: field === "ndt_mfi" ? value : row.ndt_mfi,
      };
      await supabase.from("pathway_requirements").update({ applicability }).eq("id", row.dbId);
    } else {
      const dbField = field === "type" ? "item_type" : field;
      await supabase.from("pathway_requirements").update({ [dbField]: value }).eq("id", row.dbId);
    }
    router.refresh();
  }

  async function addRequirement() {
    if (!form.requirement || !form.external_id) return;
    await supabase.from("pathway_requirements").insert({
      pathway_key: PATHWAY_KEY,
      external_id: form.external_id,
      seq: Number(form.seq) || 0,
      phase: form.phase,
      item_type: form.type,
      requirement: form.requirement,
      meaning: form.meaning,
      applicability: {
        MONEY_LENDER: form.money_lender,
        NDT_MFI: form.ndt_mfi,
      },
      timing: form.timing,
      evidence: form.evidence,
      level: form.level,
      source: form.source,
      source_link: form.source_link,
      condition: form.condition,
    });
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
          <input className="input" placeholder="External ID (e.g. R84)" value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} />
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
              <th>ID</th><th>Seq</th><th>Phase</th><th>Type</th><th>Requirement</th>
              <th>Money lender</th><th>NDT/MFI</th><th>Level</th><th>Source</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <Fragment key={r.dbId}>
                <tr>
                  <td className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{r.external_id}</td>
                  <td style={{ width: 64 }}>
                    <input className="input" type="number" defaultValue={r.seq} onBlur={(e) => update(r, "seq", Number(e.target.value))} />
                  </td>
                  <td><input className="input" defaultValue={r.phase} onBlur={(e) => update(r, "phase", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.type} onBlur={(e) => update(r, "type", e.target.value)} /></td>
                  <td style={{ minWidth: 220 }}>
                    <input className="input" defaultValue={r.requirement} onBlur={(e) => update(r, "requirement", e.target.value)} />
                  </td>
                  <td><LevelSelect value={r.money_lender} onChange={(v) => update(r, "money_lender", v)} /></td>
                  <td><LevelSelect value={r.ndt_mfi} onChange={(v) => update(r, "ndt_mfi", v)} /></td>
                  <td><input className="input" defaultValue={r.level ?? ""} onBlur={(e) => update(r, "level", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.source ?? ""} onBlur={(e) => update(r, "source", e.target.value)} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggle(r.dbId)}>{expanded[r.dbId] ? "Hide" : "Details"}</button></td>
                </tr>
                {expanded[r.dbId] && (
                  <tr>
                    <td colSpan={10}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Meaning
                          <textarea className="input mt-1" rows={3} defaultValue={r.meaning} onBlur={(e) => update(r, "meaning", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Condition
                          <textarea className="input mt-1" rows={3} defaultValue={r.condition ?? ""} onBlur={(e) => update(r, "condition", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Timing
                          <input className="input mt-1" defaultValue={r.timing ?? ""} onBlur={(e) => update(r, "timing", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Evidence
                          <input className="input mt-1" defaultValue={r.evidence ?? ""} onBlur={(e) => update(r, "evidence", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Source link
                          <input className="input mt-1" defaultValue={r.source_link ?? ""} onBlur={(e) => update(r, "source_link", e.target.value)} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No requirements match.</td></tr>
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

function FeesTable({ initial }: { initial: FlatFee[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(emptyFee);

  async function update(dbId: string, field: string, value: string | number) {
    await supabase.from("pathway_fees").update({ [field]: value }).eq("id", dbId);
    router.refresh();
  }

  async function addFee() {
    if (!form.route) return;
    await supabase.from("pathway_fees").insert({
      pathway_key: PATHWAY_KEY,
      sort_order: Number(form.sort_order) || 0,
      route: form.route,
      event: form.event,
      amount: Number(form.amount) || 0,
      status: form.status,
      note: form.note,
      source: form.source,
      source_link: form.source_link,
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
              <tr key={r.dbId}>
                <td style={{ width: 64 }}><input className="input" type="number" defaultValue={r.sort_order} onBlur={(e) => update(r.dbId, "sort_order", Number(e.target.value))} /></td>
                <td><input className="input" defaultValue={r.route} onBlur={(e) => update(r.dbId, "route", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.event} onBlur={(e) => update(r.dbId, "event", e.target.value)} /></td>
                <td><input className="input" type="number" defaultValue={r.amount} onBlur={(e) => update(r.dbId, "amount", Number(e.target.value))} /></td>
                <td><input className="input" defaultValue={r.status ?? ""} onBlur={(e) => update(r.dbId, "status", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.note ?? ""} onBlur={(e) => update(r.dbId, "note", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.source ?? ""} onBlur={(e) => update(r.dbId, "source", e.target.value)} /></td>
                <td><input className="input" defaultValue={r.source_link ?? ""} onBlur={(e) => update(r.dbId, "source_link", e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
