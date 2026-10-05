"use client";

import { useState } from "react";
import type { RegulatorRow } from "@/lib/programmes/types";
import { Msg, muted, useDb } from "./ui";

export default function RegulatorTab({ regulator }: { regulator: RegulatorRow | null }) {
  const { supabase, exec, msg, busy } = useDb();
  const [f, setF] = useState({ name: regulator?.name ?? "", short_name: regulator?.short_name ?? "", sector: regulator?.sector ?? "", website: regulator?.website ?? "", acronyms: regulator?.acronyms ?? "", notes: regulator?.notes ?? "" });
  if (!regulator) return <div className="card p-4 text-sm">Regulator not found.</div>;
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const domains = f.website.split(/[,\s]+/).filter(Boolean);
  return (
    <div className="card p-4 grid gap-3">
      <p className="text-sm" style={muted}>
        These details tell the AI assistant which official website to trust for this regulator and how to read its acronyms, so new regulators work without code changes.
      </p>
      <label className="text-sm">Regulator name<input className="input mt-1" value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label className="text-sm">Short name (e.g. BoU, UCC, IRA)<input className="input mt-1" value={f.short_name} onChange={(e) => set("short_name", e.target.value)} /></label>
      <label className="text-sm">Sector<input className="input mt-1" value={f.sector} onChange={(e) => set("sector", e.target.value)} /></label>
      <label className="text-sm">Official website domain(s), comma separated, e.g. bou.or.ug
        <input className="input mt-1" value={f.website} onChange={(e) => set("website", e.target.value)} />
      </label>
      <label className="text-sm">Acronyms and terms the assistant should expand (one per line, e.g. NPS = National Payment Systems)
        <textarea className="input mt-1" rows={4} value={f.acronyms} onChange={(e) => set("acronyms", e.target.value)} />
      </label>
      <label className="text-sm">Internal notes<textarea className="input mt-1" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      {domains.length > 0 && <p className="text-xs" style={muted}>The assistant may search only: {domains.join(", ")}</p>}
      <div><button className="btn btn-primary btn-sm" disabled={busy || !f.name.trim()} onClick={() => exec(() => supabase.from("regulators").update({ ...f, website: f.website.trim(), notes: f.notes || null, sector: f.sector || null }).eq("id", regulator.id))}>Save regulator</button></div>
      <Msg msg={msg} />
    </div>
  );
}
