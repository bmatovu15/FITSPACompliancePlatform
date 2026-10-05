"use client";

import { useState } from "react";
import type { ApplyClassRow } from "@/lib/programmes/load";
import { Msg, muted, slug, useDb } from "./ui";

const FEE_TYPES = [
  { key: "application", label: "Application fee" },
  { key: "licensing", label: "Licence fee" },
  { key: "annual", label: "Annual fee" },
] as const;

function ClassEditor({ applicationKey, c, order }: { applicationKey: string; c: ApplyClassRow | null; order: number }) {
  const { supabase, exec, msg, busy } = useDb();
  const [label, setLabel] = useState(c?.label ?? "");
  const [description, setDescription] = useState(c?.description ?? "");
  const [minCapital, setMinCapital] = useState(c?.min_capital == null ? "" : String(c.min_capital));
  const [fees, setFees] = useState<Record<string, string>>(
    Object.fromEntries(FEE_TYPES.map((f) => [f.key, String(c?.fees.find((x) => x.fee_type === f.key)?.amount ?? "")])),
  );

  async function writeFees(classKey: string) {
    for (const f of FEE_TYPES) {
      const raw = fees[f.key];
      const existing = await supabase.from("licence_application_fee_tiers").select("id").eq("application_key", applicationKey).eq("class_key", classKey).eq("fee_type", f.key).limit(1);
      if (existing.error) return existing;
      const id = existing.data?.[0]?.id as string | undefined;
      if (raw === "" && !id) continue;
      const amount = raw === "" ? 0 : Number(raw);
      if (Number.isNaN(amount)) return { error: { message: `${f.label} must be a number` } };
      const r = id
        ? await supabase.from("licence_application_fee_tiers").update({ amount }).eq("id", id)
        : await supabase.from("licence_application_fee_tiers").insert({ application_key: applicationKey, class_key: classKey, fee_type: f.key, amount, sort_order: FEE_TYPES.findIndex((x) => x.key === f.key) });
      if (r.error) return r;
    }
    return { error: null };
  }

  function save() {
    const cap = minCapital === "" ? null : Number(minCapital);
    return exec(async () => {
      const classKey = c?.class_key ?? slug(label).replace(/-/g, "_");
      if (!classKey) return { error: { message: "Give the class a name" } };
      const base = { label: label.trim(), description: description.trim() || null, min_capital: cap };
      const r = c
        ? await supabase.from("licence_application_wizard_classes").update(base).eq("application_key", applicationKey).eq("class_key", classKey)
        : await supabase.from("licence_application_wizard_classes").insert({ ...base, application_key: applicationKey, class_key: classKey, sort_order: order });
      if (r.error) return r;
      const f = await writeFees(classKey);
      if (!f.error && !c) { setLabel(""); setDescription(""); setMinCapital(""); setFees({ application: "", licensing: "", annual: "" }); }
      return f;
    }, c ? "Class saved." : "Class added.");
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Licence class<input className="input mt-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Crowdfunding platform operator" /></label>
      <label className="text-sm sm:col-span-2">Who it is for<textarea className="input mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="text-sm">Minimum capital (UGX)<input className="input mt-1" inputMode="numeric" value={minCapital} onChange={(e) => setMinCapital(e.target.value)} /></label>
      {FEE_TYPES.map((f) => (
        <label key={f.key} className="text-sm">{f.label} (UGX)
          <input className="input mt-1" inputMode="numeric" value={fees[f.key]} onChange={(e) => setFees({ ...fees, [f.key]: e.target.value })} />
        </label>
      ))}
      <div className="sm:col-span-2"><button className="btn btn-primary btn-sm" disabled={busy || !label.trim()} onClick={save}>{c ? "Save class" : "Add class"}</button></div>
      <div className="sm:col-span-2"><Msg msg={msg} /></div>
    </div>
  );
}

export default function ClassesTab({ applicationKey, classes }: { applicationKey: string | null; classes: ApplyClassRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!applicationKey) return <div className="card p-4 text-sm">This programme has no application key yet.</div>;
  return (
    <div>
      <p className="text-sm" style={muted}>
        Licence classes are what an applicant chooses from on the Apply screen, with the fees they will pay. Changes go live immediately for the Apply screen of this programme.
        Classes cannot be deleted here; to stop offering one, ask FITSPA support.
      </p>
      <div className="mt-4 grid gap-3">
        {classes.map((c) => (
          <div key={c.class_key} className="card p-4">
            <button className="text-left w-full" onClick={() => setOpen(open === c.class_key ? null : c.class_key)}>
              <strong>{c.label}</strong>
              <div className="text-xs" style={muted}>
                {c.min_capital != null ? `Minimum capital UGX ${c.min_capital.toLocaleString("en-UG")} · ` : ""}
                {c.fees.length ? c.fees.map((f) => `${f.fee_type} ${f.amount.toLocaleString("en-UG")}`).join(" · ") : "no fees yet"}
              </div>
            </button>
            {open === c.class_key && <div className="mt-3"><ClassEditor applicationKey={applicationKey} c={c} order={classes.length} /></div>}
          </div>
        ))}
        {classes.length === 0 && <div className="card p-4 text-sm">No licence classes yet. Add the first below.</div>}
      </div>
      <div className="card mt-4 p-4">
        <h3 className="font-semibold mb-2">Add a licence class</h3>
        <ClassEditor applicationKey={applicationKey} c={null} order={classes.length} />
      </div>
    </div>
  );
}
