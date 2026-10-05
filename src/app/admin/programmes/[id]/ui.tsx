"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Result = { error: { message: string } | null };

/** Shared save helper for every admin tab: runs a Supabase write, shows the outcome, refreshes server data. */
export function useDb() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function exec(fn: () => PromiseLike<Result>, ok = "Saved.") {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await fn();
      if (error) setMsg(`Error: ${error.message}`);
      else {
        setMsg(ok);
        router.refresh();
      }
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setBusy(false);
    }
  }
  return { supabase, exec, msg, busy, setMsg };
}

export function Msg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const bad = msg.startsWith("Error");
  return (
    <p className="mt-2 text-sm" role="status" style={{ color: bad ? "var(--color-danger, #a3372f)" : "var(--color-text-muted)" }}>
      {msg}
    </p>
  );
}

export function ReadOnlyBanner({ what }: { what: string }) {
  return (
    <div className="card p-4 mb-4 text-sm" style={{ background: "#fbedd9", color: "#93590b" }}>
      This programme has dedicated, hand-built member screens. The {what} shown here is a read-only copy of what those
      screens use. To change it, change it in the platform content (it will then be reflected here). Programmes created
      here with generic screens are fully editable.
    </div>
  );
}

export const muted = { color: "var(--color-text-muted)" } as const;

export function slug(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
