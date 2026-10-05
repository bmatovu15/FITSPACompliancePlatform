"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProgrammeRow } from "@/lib/programmes/types";
import type { ReadyItem } from "@/lib/programmes/readiness";
import { Msg, muted, useDb } from "./ui";

export default function OverviewTab({ programme, items, missingRequired }: { programme: ProgrammeRow; items: ReadyItem[]; missingRequired: number }) {
  const { supabase, exec, msg, busy } = useDb();
  const [name, setName] = useState(programme.name);
  const [blurb, setBlurb] = useState(programme.blurb);
  const [phases, setPhases] = useState(programme.phases.join(", "));
  const generic = programme.screens === "generic";
  const published = programme.status === "published";

  function saveDetails() {
    const list = phases.split(",").map((s) => s.trim()).filter(Boolean);
    return exec(() => supabase.from("prog_programmes").update({ name, blurb, phases: list, updated_at: new Date().toISOString() }).eq("id", programme.id));
  }
  function setStatus(status: "draft" | "published") {
    return exec(() => supabase.from("prog_programmes").update({ status, updated_at: new Date().toISOString() }).eq("id", programme.id), status === "published" ? "Published. Members and visitors can now see it." : "Back to draft. Hidden from members and visitors.");
  }

  return (
    <div className="grid gap-6">
      <section className="card p-4">
        <h2 className="text-lg font-semibold">Readiness checklist</h2>
        <p className="mt-1 text-sm" style={muted}>
          Required items must be done before a programme can be published. Optional items make it richer for members.
        </p>
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--color-border)" }}>
          {items.map((it) => (
            <li key={it.key} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div>
                <span className={`badge ${it.done ? "badge-green" : it.required ? "badge-red" : "badge-amber"}`}>{it.done ? "Done" : it.required ? "Required" : "Optional"}</span>{" "}
                <strong>{it.label}</strong>
                <div style={muted}>{it.detail}</div>
              </div>
              <Link className="btn btn-ghost btn-sm" href={`/admin/programmes/${programme.id}?tab=${it.tab}`}>Open</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="text-lg font-semibold">Publishing</h2>
        <p className="mt-1 text-sm" style={muted}>
          Status: <span className={`badge ${published ? "badge-green" : "badge-amber"}`}>{published ? "Published" : "Draft"}</span>
          {generic ? (published ? ` Live at /comply/${programme.id} and /apply/${programme.id}.` : " Hidden from members and visitors until published.") : " Dedicated screens are always live; this status only controls who can read the catalogue data."}
        </p>
        {generic && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!published && (
              <button className="btn btn-primary" disabled={busy || missingRequired > 0} onClick={() => setStatus("published")}>
                {missingRequired > 0 ? `Publish (${missingRequired} required item${missingRequired > 1 ? "s" : ""} missing)` : "Publish programme"}
              </button>
            )}
            {published && <button className="btn btn-ghost" disabled={busy} onClick={() => setStatus("draft")}>Unpublish (back to draft)</button>}
          </div>
        )}
        <Msg msg={msg} />
      </section>

      <section className="card p-4 grid gap-3">
        <h2 className="text-lg font-semibold">Programme details</h2>
        <label className="text-sm">Name<input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="text-sm">Short description (shown on the Comply and Apply hubs)
          <textarea className="input mt-1" rows={2} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
        </label>
        <label className="text-sm">Application phases (comma separated, in order)
          <input className="input mt-1" value={phases} onChange={(e) => setPhases(e.target.value)} />
        </label>
        <div><button className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={saveDetails}>Save details</button></div>
      </section>
    </div>
  );
}
