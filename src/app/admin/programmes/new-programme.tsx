"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export default function NewProgramme({ regulators }: { regulators: { id: string; name: string }[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [regulatorId, setRegulatorId] = useState("");
  const [blurb, setBlurb] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim() || !regulatorId) return;
    setBusy(true);
    setMsg(null);
    const id = slug(name);
    const { error } = await supabase.from("prog_programmes").insert({
      id,
      regulator_id: regulatorId,
      name: name.trim(),
      blurb,
      application_key: id,
      screens: "generic",
      route: `/comply/${id}`,
      status: "draft",
      phases: ["business", "people", "policies", "finalise"],
    });
    setBusy(false);
    if (error) {
      setMsg(`Could not create the programme: ${error.message}`);
      return;
    }
    router.push(`/admin/programmes/${id}`);
  }

  if (!open) return <button className="btn btn-ghost mt-4" onClick={() => setOpen(true)}>+ Add a regulator programme</button>;
  return (
    <div className="card mt-4 p-4 grid gap-3 sm:grid-cols-2">
      <input className="input" placeholder="Programme name, e.g. Microfinance deposit-takers" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="input" value={regulatorId} onChange={(e) => setRegulatorId(e.target.value)}>
        <option value="">Regulator… (add it under Regulators first if missing)</option>
        {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <input className="input sm:col-span-2" placeholder="One-line description members will see" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim() || !regulatorId} onClick={create}>Create draft programme</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <p className="sm:col-span-2 text-sm" style={{ color: "var(--color-danger, #b00020)" }}>{msg}</p>}
    </div>
  );
}
