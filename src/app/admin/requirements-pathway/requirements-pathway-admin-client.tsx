"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PathwayFee, PathwayRegulator, PathwayRequirement } from "@/lib/types";

const LEVEL_OPTIONS = ["Yes", "No", "Conditional", "Information only"] as const;
const STATUS_OPTIONS = ["Active", "Pending Approval", "Rejected"] as const;
const BESPOKE: Record<string, { label: string; href: string }> = {
  nps: { label: "NPS Licence Pathway", href: "/admin/nps-pathway" },
  digital_credit: { label: "Digital Credit Licence Pathway", href: "/admin/digital-credit-pathway" },
};

type BespokeCounts = Record<string, { requirements: number; fees: number }>;

const emptyNewRegulator = {
  key: "",
  title: "",
  seal_text: "",
  eyebrow: "",
  subtitle: "",
  hero_title: "",
  hero_dek: "",
  hero_stats: "[]",
  routes: "[]",
  fee_shape: "tiered" as "tiered" | "flat",
  source_note: "",
  sort_order: 0,
  status: "Active",
  wizard_title: "",
  wizard_note: "",
  routes_heading: "",
  routes_note: "",
  fees_note: "",
  regulator_id: "",
};

export default function RequirementsPathwayAdminClient({
  initialRegulators,
  regulatorOptions,
  bespokeCounts,
}: {
  initialRegulators: PathwayRegulator[];
  regulatorOptions: { id: string; name: string }[];
  bespokeCounts: BespokeCounts;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(initialRegulators[0]?.key ?? null);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState<any>(emptyNewRegulator);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => initialRegulators.find((r) => r.key === selectedKey) ?? null,
    [initialRegulators, selectedKey]
  );

  async function createRegulator() {
    setError(null);
    if (!newForm.key.trim() || !newForm.title.trim()) {
      setError("Key and title are required.");
      return;
    }
    let heroStats: unknown;
    let routes: unknown;
    try {
      heroStats = JSON.parse(newForm.hero_stats || "[]");
      routes = JSON.parse(newForm.routes || "[]");
    } catch {
      setError("Hero stats and routes must be valid JSON.");
      return;
    }
    const { error: err } = await supabase.from("pathway_regulators").insert({
      key: newForm.key.trim(),
      title: newForm.title,
      seal_text: newForm.seal_text || null,
      eyebrow: newForm.eyebrow || null,
      subtitle: newForm.subtitle || null,
      hero_title: newForm.hero_title || null,
      hero_dek: newForm.hero_dek || null,
      hero_stats: heroStats,
      routes,
      fee_shape: newForm.fee_shape,
      source_note: newForm.source_note || null,
      sort_order: Number(newForm.sort_order) || 0,
      status: newForm.status,
      wizard_title: newForm.wizard_title || null,
      wizard_note: newForm.wizard_note || null,
      routes_heading: newForm.routes_heading || null,
      routes_note: newForm.routes_note || null,
      fees_note: newForm.fees_note || null,
      regulator_id: newForm.regulator_id || null,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setSelectedKey(newForm.key.trim());
    setNewForm(emptyNewRegulator);
    setAdding(false);
    router.refresh();
  }

  async function updateField(field: string, value: unknown) {
    if (!selected) return;
    await supabase.from("pathway_regulators").update({ [field]: value }).eq("key", selected.key);
    router.refresh();
  }

  function updateJsonField(field: "hero_stats" | "routes", raw: string) {
    try {
      const parsed = JSON.parse(raw);
      updateField(field, parsed);
      setError(null);
    } catch {
      setError(`${field === "hero_stats" ? "Hero stats" : "Routes"} must be valid JSON — change not saved.`);
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside>
        <div className="flex flex-col gap-1">
          {initialRegulators.map((r) => (
            <button
              key={r.key}
              className={`btn btn-sm justify-start ${selectedKey === r.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setSelectedKey(r.key)}
            >
              {r.title}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm mt-3 w-full" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ New regulator"}
        </button>
      </aside>

      <div>
        {error && (
          <div className="card p-3 mb-4 text-sm" style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)" }}>
            {error}
          </div>
        )}

        {adding && (
          <div className="card p-4 mb-6">
            <h2 className="font-semibold mb-3" style={{ fontFamily: "var(--font-serif)" }}>New regulator</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <LabeledInput label="Key (slug, immutable, e.g. crb)" value={newForm.key} onChange={(v) => setNewForm({ ...newForm, key: v })} />
              <LabeledInput label="Title" value={newForm.title} onChange={(v) => setNewForm({ ...newForm, title: v })} />
              <LabeledInput label="Seal text (e.g. BoU)" value={newForm.seal_text} onChange={(v) => setNewForm({ ...newForm, seal_text: v })} />
              <LabeledInput label="Eyebrow" value={newForm.eyebrow} onChange={(v) => setNewForm({ ...newForm, eyebrow: v })} />
              <LabeledInput label="Subtitle" value={newForm.subtitle} onChange={(v) => setNewForm({ ...newForm, subtitle: v })} />
              <LabeledInput label="Sort order" type="number" value={newForm.sort_order} onChange={(v) => setNewForm({ ...newForm, sort_order: v })} />
              <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Fee shape
                <select className="input mt-1" value={newForm.fee_shape} onChange={(e) => setNewForm({ ...newForm, fee_shape: e.target.value })}>
                  <option value="tiered">Tiered (category/class/threshold)</option>
                  <option value="flat">Flat (route/event/amount)</option>
                </select>
              </label>
              <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Status
                <select className="input mt-1" value={newForm.status} onChange={(e) => setNewForm({ ...newForm, status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                Linked regulator (optional, from Regulators table)
                <select className="input mt-1" value={newForm.regulator_id} onChange={(e) => setNewForm({ ...newForm, regulator_id: e.target.value })}>
                  <option value="">—</option>
                  {regulatorOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <LabeledTextarea label="Hero title" value={newForm.hero_title} onChange={(v) => setNewForm({ ...newForm, hero_title: v })} span2 />
              <LabeledTextarea label="Hero dek" value={newForm.hero_dek} onChange={(v) => setNewForm({ ...newForm, hero_dek: v })} span2 />
              <LabeledTextarea label="Source note" value={newForm.source_note} onChange={(v) => setNewForm({ ...newForm, source_note: v })} span2 />
              <LabeledTextarea label="Wizard title" value={newForm.wizard_title} onChange={(v) => setNewForm({ ...newForm, wizard_title: v })} />
              <LabeledTextarea label="Wizard note" value={newForm.wizard_note} onChange={(v) => setNewForm({ ...newForm, wizard_note: v })} />
              <LabeledTextarea label="Routes heading" value={newForm.routes_heading} onChange={(v) => setNewForm({ ...newForm, routes_heading: v })} />
              <LabeledTextarea label="Routes note" value={newForm.routes_note} onChange={(v) => setNewForm({ ...newForm, routes_note: v })} />
              <LabeledTextarea label="Fees note" value={newForm.fees_note} onChange={(v) => setNewForm({ ...newForm, fees_note: v })} span2 />
              <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                Hero stats (JSON array of &#123;value,label&#125;) — advanced
                <textarea className="input mt-1 font-mono" rows={3} value={newForm.hero_stats} onChange={(e) => setNewForm({ ...newForm, hero_stats: e.target.value })} />
              </label>
              <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                Routes (JSON array, v2 schema — see platform-rebuild-strategy notes) — advanced
                <textarea className="input mt-1 font-mono" rows={8} value={newForm.routes} onChange={(e) => setNewForm({ ...newForm, routes: e.target.value })} />
              </label>
            </div>
            <button className="btn btn-primary mt-3" onClick={createRegulator}>Save regulator</button>
          </div>
        )}

        {!selected ? (
          <div className="card p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {initialRegulators.length === 0 ? "No regulators yet — add one to get started." : "Select a regulator."}
          </div>
        ) : (
          <RegulatorDetail
            key={selected.key}
            regulator={selected}
            regulatorOptions={regulatorOptions}
            updateField={updateField}
            updateJsonField={updateJsonField}
            bespokeCounts={bespokeCounts}
          />
        )}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
      {label}
      <input className="input mt-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  span2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  span2?: boolean;
}) {
  return (
    <label className={`text-xs ${span2 ? "sm:col-span-2" : ""}`} style={{ color: "var(--color-text-muted)" }}>
      {label}
      <textarea className="input mt-1" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function RegulatorDetail({
  regulator,
  regulatorOptions,
  updateField,
  updateJsonField,
  bespokeCounts,
}: {
  regulator: PathwayRegulator;
  regulatorOptions: { id: string; name: string }[];
  updateField: (field: string, value: unknown) => void;
  updateJsonField: (field: "hero_stats" | "routes", raw: string) => void;
  bespokeCounts: BespokeCounts;
}) {
  const isBespoke = regulator.key in BESPOKE;

  return (
    <div>
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
            {regulator.title} <span className="text-xs font-normal font-mono" style={{ color: "var(--color-text-muted)" }}>({regulator.key})</span>
          </h2>
          <Link href={`/requirements-pathway/${regulator.key}`} className="btn btn-ghost btn-sm" target="_blank">
            View public page ↗
          </Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <FieldText label="Title" defaultValue={regulator.title} onBlurSave={(v) => updateField("title", v)} />
          <FieldText label="Seal text" defaultValue={regulator.seal_text ?? ""} onBlurSave={(v) => updateField("seal_text", v || null)} />
          <FieldText label="Eyebrow" defaultValue={regulator.eyebrow ?? ""} onBlurSave={(v) => updateField("eyebrow", v || null)} />
          <FieldText label="Subtitle" defaultValue={regulator.subtitle ?? ""} onBlurSave={(v) => updateField("subtitle", v || null)} />
          <FieldText label="Sort order" type="number" defaultValue={regulator.sort_order} onBlurSave={(v) => updateField("sort_order", Number(v) || 0)} />
          <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Status
            <select className="input mt-1" defaultValue={regulator.status} onChange={(e) => updateField("status", e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Fee shape
            <select className="input mt-1" defaultValue={regulator.fee_shape} onChange={(e) => updateField("fee_shape", e.target.value)}>
              <option value="tiered">Tiered (category/class/threshold)</option>
              <option value="flat">Flat (route/event/amount)</option>
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Linked regulator
            <select className="input mt-1" defaultValue={regulator.regulator_id ?? ""} onChange={(e) => updateField("regulator_id", e.target.value || null)}>
              <option value="">—</option>
              {regulatorOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <FieldTextarea label="Hero title" defaultValue={regulator.hero_title ?? ""} onBlurSave={(v) => updateField("hero_title", v || null)} span2 />
          <FieldTextarea label="Hero dek" defaultValue={regulator.hero_dek ?? ""} onBlurSave={(v) => updateField("hero_dek", v || null)} span2 />
          <FieldTextarea label="Source note" defaultValue={regulator.source_note ?? ""} onBlurSave={(v) => updateField("source_note", v || null)} span2 />
          <FieldTextarea label="Wizard title" defaultValue={regulator.wizard_title ?? ""} onBlurSave={(v) => updateField("wizard_title", v || null)} />
          <FieldTextarea label="Wizard note" defaultValue={regulator.wizard_note ?? ""} onBlurSave={(v) => updateField("wizard_note", v || null)} />
          <FieldTextarea label="Routes heading" defaultValue={regulator.routes_heading ?? ""} onBlurSave={(v) => updateField("routes_heading", v || null)} />
          <FieldTextarea label="Routes note" defaultValue={regulator.routes_note ?? ""} onBlurSave={(v) => updateField("routes_note", v || null)} />
          <FieldTextarea label="Fees note" defaultValue={regulator.fees_note ?? ""} onBlurSave={(v) => updateField("fees_note", v || null)} span2 />
          <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
            Hero stats (JSON array of &#123;value,label&#125;) — advanced
            <textarea
              className="input mt-1 font-mono"
              rows={3}
              defaultValue={JSON.stringify(regulator.hero_stats ?? [], null, 2)}
              onBlur={(e) => updateJsonField("hero_stats", e.target.value)}
            />
          </label>
          <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
            Routes (JSON array, v2 schema: key/tag/label/description/column?/feeCategory?/feeRouteLabel?/subquestions?) — advanced
            <textarea
              className="input mt-1 font-mono"
              rows={12}
              defaultValue={JSON.stringify(regulator.routes ?? [], null, 2)}
              onBlur={(e) => updateJsonField("routes", e.target.value)}
            />
          </label>
        </div>
      </div>

      {isBespoke ? (
        <BespokeSummary regulatorKey={regulator.key} counts={bespokeCounts[regulator.key]} />
      ) : (
        <OtherRegulatorCrud regulator={regulator} />
      )}
    </div>
  );
}

function FieldText({
  label,
  defaultValue,
  onBlurSave,
  type = "text",
}: {
  label: string;
  defaultValue: string | number;
  onBlurSave: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
      {label}
      <input className="input mt-1" type={type} defaultValue={defaultValue} onBlur={(e) => onBlurSave(e.target.value)} />
    </label>
  );
}

function FieldTextarea({
  label,
  defaultValue,
  onBlurSave,
  span2,
}: {
  label: string;
  defaultValue: string;
  onBlurSave: (v: string) => void;
  span2?: boolean;
}) {
  return (
    <label className={`text-xs ${span2 ? "sm:col-span-2" : ""}`} style={{ color: "var(--color-text-muted)" }}>
      {label}
      <textarea className="input mt-1" rows={2} defaultValue={defaultValue} onBlur={(e) => onBlurSave(e.target.value)} />
    </label>
  );
}

function BespokeSummary({ regulatorKey, counts }: { regulatorKey: string; counts?: { requirements: number; fees: number } }) {
  const info = BESPOKE[regulatorKey];
  return (
    <div className="card p-4">
      <p className="text-sm mb-2">
        <strong>{counts?.requirements ?? 0}</strong> requirements · <strong>{counts?.fees ?? 0}</strong> fee rows
      </p>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {info?.label} has its own dedicated admin page — requirements and fees are edited there, not here, so there
        is exactly one editing surface for this regulator.
      </p>
      <Link href={info?.href ?? "#"} className="btn btn-primary btn-sm mt-3">
        Edit {info?.label} requirements &amp; fees on its dedicated admin page →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full CRUD for any regulator that isn't nps/digital_credit: requirements
// (with a dynamically-built applicability editor, one select per route
// column found in this regulator's `routes` jsonb) and fees (rendered with
// the right column set for its fee_shape).
// ---------------------------------------------------------------------------

function collectColumns(routes: PathwayRegulator["routes"]): string[] {
  const cols = new Set<string>();
  (routes ?? []).forEach((r) => {
    if (r.column) cols.add(r.column);
    (r.subquestions ?? []).forEach((sq) => {
      sq.options.forEach((o) => {
        if (o.column) cols.add(o.column);
      });
    });
  });
  return Array.from(cols);
}

function OtherRegulatorCrud({ regulator }: { regulator: PathwayRegulator }) {
  const supabase = createClient();
  const [tab, setTab] = useState<"requirements" | "fees">("requirements");
  const [requirements, setRequirements] = useState<PathwayRequirement[]>([]);
  const [fees, setFees] = useState<PathwayFee[]>([]);
  const [loading, setLoading] = useState(true);

  const columns = useMemo(() => collectColumns(regulator.routes), [regulator.routes]);

  async function reload() {
    setLoading(true);
    const [{ data: reqs }, { data: feeRows }] = await Promise.all([
      supabase.from("pathway_requirements").select("*").eq("pathway_key", regulator.key).order("seq"),
      supabase.from("pathway_fees").select("*").eq("pathway_key", regulator.key).order("sort_order"),
    ]);
    setRequirements((reqs ?? []) as PathwayRequirement[]);
    setFees(
      ((feeRows ?? []) as any[]).map((r) => ({
        ...r,
        application_fee: r.application_fee === null ? null : Number(r.application_fee),
        licensing_fee: r.licensing_fee === null ? null : Number(r.licensing_fee),
        annual_fee: r.annual_fee === null ? null : Number(r.annual_fee),
        min_capital: r.min_capital === null ? null : Number(r.min_capital),
        amount: r.amount === null ? null : Number(r.amount),
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regulator.key]);

  return (
    <div>
      <div className="flex gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
        <button className={`btn btn-sm ${tab === "requirements" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("requirements")}>
          Requirements ({requirements.length})
        </button>
        <button className={`btn btn-sm ${tab === "fees" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("fees")}>
          Fees ({fees.length})
        </button>
      </div>
      <div className="mt-4">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
        ) : tab === "requirements" ? (
          <RequirementsCrud pathwayKey={regulator.key} columns={columns} initial={requirements} reload={reload} />
        ) : (
          <FeesCrud pathwayKey={regulator.key} feeShape={regulator.fee_shape} initial={fees} reload={reload} />
        )}
      </div>
    </div>
  );
}

function emptyApplicability(columns: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  columns.forEach((c) => (a[c] = "No"));
  return a;
}

function RequirementsCrud({
  pathwayKey,
  columns,
  initial,
  reload,
}: {
  pathwayKey: string;
  columns: string[];
  initial: PathwayRequirement[];
  reload: () => Promise<void>;
}) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({
    external_id: "",
    seq: 0,
    phase: "",
    item_type: "",
    requirement: "",
    meaning: "",
    applicability: emptyApplicability(columns),
    timing: "",
    evidence: "",
    level: "",
    source: "",
    source_link: "",
    condition: "",
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((r) =>
      [r.requirement, r.meaning ?? "", r.phase, r.item_type ?? "", r.external_id].join(" ").toLowerCase().includes(term)
    );
  }, [initial, search]);

  async function update(row: PathwayRequirement, field: string, value: unknown) {
    if (field === "applicability_col") return; // not used directly; see updateApplicability
    await supabase.from("pathway_requirements").update({ [field]: value }).eq("id", row.id);
    await reload();
  }

  async function updateApplicability(row: PathwayRequirement, column: string, value: string) {
    const applicability = { ...(row.applicability ?? {}), [column]: value };
    await supabase.from("pathway_requirements").update({ applicability }).eq("id", row.id);
    await reload();
  }

  async function addRequirement() {
    if (!form.requirement || !form.external_id) return;
    await supabase.from("pathway_requirements").insert({
      pathway_key: pathwayKey,
      external_id: form.external_id,
      seq: Number(form.seq) || 0,
      phase: form.phase,
      item_type: form.item_type,
      requirement: form.requirement,
      meaning: form.meaning,
      applicability: form.applicability,
      timing: form.timing,
      evidence: form.evidence,
      level: form.level,
      source: form.source,
      source_link: form.source_link,
      condition: form.condition,
    });
    setForm({
      external_id: "",
      seq: 0,
      phase: "",
      item_type: "",
      requirement: "",
      meaning: "",
      applicability: emptyApplicability(columns),
      timing: "",
      evidence: "",
      level: "",
      source: "",
      source_link: "",
      condition: "",
    });
    setAdding(false);
    await reload();
  }

  async function remove(row: PathwayRequirement) {
    if (typeof window !== "undefined" && !window.confirm(`Delete requirement ${row.external_id}?`)) return;
    await supabase.from("pathway_requirements").delete().eq("id", row.id);
    await reload();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" className="input max-w-xs" placeholder="Search requirements…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add requirement"}</button>
      </div>

      {columns.length === 0 && (
        <p className="text-xs mt-2" style={{ color: "var(--color-accent)" }}>
          This regulator&apos;s Routes JSON doesn&apos;t define any route columns yet — set that up above first so
          applicability can be edited per route.
        </p>
      )}

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="External ID (e.g. R01)" value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} />
          <input className="input" type="number" placeholder="Seq" value={form.seq} onChange={(e) => setForm({ ...form, seq: e.target.value })} />
          <input className="input" placeholder="Phase" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
          <input className="input" placeholder="Item type" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Requirement" value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} />
          <textarea className="input sm:col-span-3" placeholder="Meaning" value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
          {columns.map((col) => (
            <label key={col} className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {col}
              <select className="input mt-1" value={form.applicability[col] ?? "No"} onChange={(e) => setForm({ ...form, applicability: { ...form.applicability, [col]: e.target.value } })}>
                {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
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
              {columns.map((c) => <th key={c}>{c}</th>)}
              <th>Level</th><th>Source</th><th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>{r.external_id}</td>
                  <td style={{ width: 64 }}><input className="input" type="number" defaultValue={r.seq} onBlur={(e) => update(r, "seq", Number(e.target.value))} /></td>
                  <td><input className="input" defaultValue={r.phase} onBlur={(e) => update(r, "phase", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.item_type ?? ""} onBlur={(e) => update(r, "item_type", e.target.value)} /></td>
                  <td style={{ minWidth: 220 }}><input className="input" defaultValue={r.requirement} onBlur={(e) => update(r, "requirement", e.target.value)} /></td>
                  {columns.map((col) => (
                    <td key={col}>
                      <select className="input" defaultValue={r.applicability?.[col] ?? "No"} onChange={(e) => updateApplicability(r, col, e.target.value)}>
                        {LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  ))}
                  <td><input className="input" defaultValue={r.level ?? ""} onBlur={(e) => update(r, "level", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.source ?? ""} onBlur={(e) => update(r, "source", e.target.value)} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}>{expanded[r.id] ? "Hide" : "Details"}</button></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>Delete</button></td>
                </tr>
                {expanded[r.id] && (
                  <tr>
                    <td colSpan={9 + columns.length}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Meaning
                          <textarea className="input mt-1" rows={3} defaultValue={r.meaning ?? ""} onBlur={(e) => update(r, "meaning", e.target.value)} />
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
              <tr><td colSpan={9 + columns.length} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No requirements match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeesCrud({
  pathwayKey,
  feeShape,
  initial,
  reload,
}: {
  pathwayKey: string;
  feeShape: "tiered" | "flat";
  initial: PathwayFee[];
  reload: () => Promise<void>;
}) {
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const tieredEmpty = { sort_order: 0, category: "", class: "", threshold: "", application_fee: 0, licensing_fee: 0, annual_fee: 0, min_capital: 0 };
  const flatEmpty = { sort_order: 0, route: "", event: "", amount: 0, status: "", note: "", source: "", source_link: "" };
  const [form, setForm] = useState<any>(feeShape === "tiered" ? tieredEmpty : flatEmpty);

  async function update(row: PathwayFee, field: string, value: unknown) {
    await supabase.from("pathway_fees").update({ [field]: value }).eq("id", row.id);
    await reload();
  }

  async function remove(row: PathwayFee) {
    if (typeof window !== "undefined" && !window.confirm("Delete this fee row?")) return;
    await supabase.from("pathway_fees").delete().eq("id", row.id);
    await reload();
  }

  async function addFee() {
    if (feeShape === "tiered") {
      if (!form.category) return;
      await supabase.from("pathway_fees").insert({
        pathway_key: pathwayKey,
        sort_order: Number(form.sort_order) || 0,
        category: form.category,
        class: form.class,
        threshold: form.threshold,
        application_fee: Number(form.application_fee) || 0,
        licensing_fee: Number(form.licensing_fee) || 0,
        annual_fee: Number(form.annual_fee) || 0,
        min_capital: Number(form.min_capital) || 0,
      });
      setForm(tieredEmpty);
    } else {
      if (!form.route) return;
      await supabase.from("pathway_fees").insert({
        pathway_key: pathwayKey,
        sort_order: Number(form.sort_order) || 0,
        route: form.route,
        event: form.event,
        amount: Number(form.amount) || 0,
        status: form.status,
        note: form.note,
        source: form.source,
        source_link: form.source_link,
      });
      setForm(flatEmpty);
    }
    setAdding(false);
    await reload();
  }

  return (
    <div>
      <div className="flex justify-end">
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add fee"}</button>
      </div>

      {adding && feeShape === "tiered" && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-4">
          <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          <input className="input" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input className="input" placeholder="Class" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} />
          <input className="input" placeholder="Threshold" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
          <input className="input" type="number" placeholder="Application fee" value={form.application_fee} onChange={(e) => setForm({ ...form, application_fee: e.target.value })} />
          <input className="input" type="number" placeholder="Licensing fee" value={form.licensing_fee} onChange={(e) => setForm({ ...form, licensing_fee: e.target.value })} />
          <input className="input" type="number" placeholder="Annual fee" value={form.annual_fee} onChange={(e) => setForm({ ...form, annual_fee: e.target.value })} />
          <input className="input" type="number" placeholder="Min capital" value={form.min_capital} onChange={(e) => setForm({ ...form, min_capital: e.target.value })} />
          <button className="btn btn-primary sm:col-span-4" onClick={addFee}>Save fee tier</button>
        </div>
      )}
      {adding && feeShape === "flat" && (
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
        {feeShape === "tiered" ? (
          <table className="data">
            <thead>
              <tr><th>Order</th><th>Category</th><th>Class</th><th>Threshold</th><th>Application fee</th><th>Licensing fee</th><th>Annual fee</th><th>Min capital</th><th></th></tr>
            </thead>
            <tbody>
              {initial.map((r) => (
                <tr key={r.id}>
                  <td style={{ width: 64 }}><input className="input" type="number" defaultValue={r.sort_order} onBlur={(e) => update(r, "sort_order", Number(e.target.value))} /></td>
                  <td><input className="input" defaultValue={r.category ?? ""} onBlur={(e) => update(r, "category", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.class ?? ""} onBlur={(e) => update(r, "class", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.threshold ?? ""} onBlur={(e) => update(r, "threshold", e.target.value)} /></td>
                  <td><input className="input" type="number" defaultValue={r.application_fee ?? 0} onBlur={(e) => update(r, "application_fee", Number(e.target.value))} /></td>
                  <td><input className="input" type="number" defaultValue={r.licensing_fee ?? 0} onBlur={(e) => update(r, "licensing_fee", Number(e.target.value))} /></td>
                  <td><input className="input" type="number" defaultValue={r.annual_fee ?? 0} onBlur={(e) => update(r, "annual_fee", Number(e.target.value))} /></td>
                  <td><input className="input" type="number" defaultValue={r.min_capital ?? 0} onBlur={(e) => update(r, "min_capital", Number(e.target.value))} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="data">
            <thead>
              <tr><th>Order</th><th>Route</th><th>Event</th><th>Amount</th><th>Status</th><th>Note</th><th>Source</th><th>Source link</th><th></th></tr>
            </thead>
            <tbody>
              {initial.map((r) => (
                <tr key={r.id}>
                  <td style={{ width: 64 }}><input className="input" type="number" defaultValue={r.sort_order} onBlur={(e) => update(r, "sort_order", Number(e.target.value))} /></td>
                  <td><input className="input" defaultValue={r.route ?? ""} onBlur={(e) => update(r, "route", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.event ?? ""} onBlur={(e) => update(r, "event", e.target.value)} /></td>
                  <td><input className="input" type="number" defaultValue={r.amount ?? 0} onBlur={(e) => update(r, "amount", Number(e.target.value))} /></td>
                  <td><input className="input" defaultValue={r.status ?? ""} onBlur={(e) => update(r, "status", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.note ?? ""} onBlur={(e) => update(r, "note", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.source ?? ""} onBlur={(e) => update(r, "source", e.target.value)} /></td>
                  <td><input className="input" defaultValue={r.source_link ?? ""} onBlur={(e) => update(r, "source_link", e.target.value)} /></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => remove(r)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
