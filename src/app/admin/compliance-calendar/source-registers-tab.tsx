"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SourceRegister } from "@/lib/types";

function makeEmptySource(catalogKey: string) {
  return {
    scope_type: "catalog",
    scope_key: catalogKey,
    file: "",
    document: "",
    source_level: "",
    use_in_map: "",
    relied_on: false,
    drive_link: "",
    sort_order: 0,
  };
}

export default function SourceRegistersTab({ initial, catalogKey }: { initial: SourceRegister[]; catalogKey: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>(() => makeEmptySource(catalogKey));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initial;
    return initial.filter((s) => [s.document, s.source_level, s.use_in_map].join(" ").toLowerCase().includes(term));
  }, [initial, search]);

  async function update(id: string, field: string, value: string | number | boolean | null) {
    await supabase.from("source_registers").update({ [field]: value }).eq("id", id);
    router.refresh();
  }

  async function addSource() {
    if (!form.document) return;
    await supabase.from("source_registers").insert({
      ...form,
      file: form.file || null,
      drive_link: form.drive_link || null,
      sort_order: Number(form.sort_order) || 0,
    });
    setForm(makeEmptySource(catalogKey));
    setAdding(false);
    router.refresh();
  }

  async function deleteSource(id: string) {
    if (!confirm("Delete this source register entry? This cannot be undone.")) return;
    await supabase.from("source_registers").delete().eq("id", id);
    router.refresh();
  }

  function toggle(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        The register of Acts, regulations and notices this catalog&apos;s obligations, tasks and controls were mapped
        from — scoped to <code>scope_type = &quot;catalog&quot;</code> and this catalog&apos;s key.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <input type="search" className="input max-w-xs" placeholder="Search sources…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add source"}</button>
      </div>

      {adding && (
        <div className="card mt-3 p-4 grid gap-2 sm:grid-cols-3">
          <input className="input sm:col-span-2" placeholder="Document" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          <input className="input" placeholder="Source level (e.g. Law)" value={form.source_level} onChange={(e) => setForm({ ...form, source_level: e.target.value })} />
          <input className="input sm:col-span-3" placeholder="Use in map" value={form.use_in_map} onChange={(e) => setForm({ ...form, use_in_map: e.target.value })} />
          <input className="input sm:col-span-2" placeholder="Drive link" value={form.drive_link} onChange={(e) => setForm({ ...form, drive_link: e.target.value })} />
          <input className="input" type="number" placeholder="Sort order" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          <label className="text-sm flex items-center gap-2 sm:col-span-3">
            <input type="checkbox" checked={form.relied_on} onChange={(e) => setForm({ ...form, relied_on: e.target.checked })} />
            Relied on
          </label>
          <button className="btn btn-primary sm:col-span-3" onClick={addSource}>Save source</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto card">
        <table className="data">
          <thead>
            <tr><th>Document</th><th>Level</th><th>Relied on</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td style={{ minWidth: 220 }}><input className="input" defaultValue={s.document ?? ""} onBlur={(e) => update(s.id, "document", e.target.value)} /></td>
                  <td><input className="input" defaultValue={s.source_level ?? ""} onBlur={(e) => update(s.id, "source_level", e.target.value)} /></td>
                  <td>
                    <input
                      type="checkbox"
                      defaultChecked={s.relied_on ?? false}
                      onChange={(e) => update(s.id, "relied_on", e.target.checked)}
                    />
                  </td>
                  <td className="flex gap-1">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(s.id)}>{expanded[s.id] ? "Hide" : "Details"}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteSource(s.id)}>Delete</button>
                  </td>
                </tr>
                {expanded[s.id] && (
                  <tr>
                    <td colSpan={4}>
                      <div className="grid gap-2 sm:grid-cols-2 p-2">
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          File
                          <input className="input mt-1" defaultValue={s.file ?? ""} onBlur={(e) => update(s.id, "file", e.target.value)} />
                        </label>
                        <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          Sort order
                          <input className="input mt-1" type="number" defaultValue={s.sort_order} onBlur={(e) => update(s.id, "sort_order", Number(e.target.value))} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Use in map
                          <textarea className="input mt-1" rows={2} defaultValue={s.use_in_map ?? ""} onBlur={(e) => update(s.id, "use_in_map", e.target.value)} />
                        </label>
                        <label className="text-xs sm:col-span-2" style={{ color: "var(--color-text-muted)" }}>
                          Drive link
                          <input className="input mt-1" defaultValue={s.drive_link ?? ""} onBlur={(e) => update(s.id, "drive_link", e.target.value)} />
                        </label>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="text-sm" style={{ color: "var(--color-text-muted)" }}>No sources match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
