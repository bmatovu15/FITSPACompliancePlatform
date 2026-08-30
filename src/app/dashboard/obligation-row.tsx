"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ObligationRow({ obligation, isOwn }: { obligation: any; isOwn: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function markComplete() {
    setSaving(true);
    await supabase.from("obligations").update({ status: "Complete" }).eq("id", obligation.id);
    setSaving(false);
    router.refresh();
  }

  const badgeClass =
    obligation.status === "Active" ? "badge-amber" : obligation.status === "Complete" ? "badge-green" : "badge-gray";

  return (
    <>
      <tr className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <td>{obligation.regulators?.name ?? "—"}</td>
        <td>{obligation.title}</td>
        <td>{obligation.due_date ?? obligation.frequency ?? "—"}</td>
        <td><span className={`badge ${badgeClass}`}>{obligation.status}</span></td>
        <td className="text-xs" style={{ color: "var(--color-text-muted)" }}>{obligation.source}</td>
        <td>
          {isOwn && obligation.status !== "Complete" && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={(e) => { e.stopPropagation(); markComplete(); }}
            >
              Mark complete
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ background: "var(--color-bg)" }}>
            <div className="p-2 text-sm">
              {obligation.description && <p><strong>Description:</strong> {obligation.description}</p>}
              {obligation.legal_ref && <p><strong>Legal reference:</strong> {obligation.legal_ref}</p>}
              {obligation.penalty && <p><strong>Penalty if not met:</strong> {obligation.penalty}</p>}
              {obligation.requires_evidence && <p>Requires supporting evidence to be uploaded.</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
