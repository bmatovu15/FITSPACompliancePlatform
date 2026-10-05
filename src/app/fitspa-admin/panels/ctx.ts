import type { AdminState, Programme, Section } from "../admin-types";

export interface Ctx {
  state: AdminState;
  /** Apply a change to the whole demo state and record it in Activity. */
  update: (fn: (s: AdminState) => AdminState, message: string) => void;
  patchProgramme: (id: string, fn: (p: Programme) => Programme, message: string) => void;
  progId: string;
  setProgId: (id: string) => void;
  prog: Programme | undefined;
  go: (section: Section, opts?: { progId?: string; sub?: string }) => void;
  sub: string;
  setSub: (s: string) => void;
}

export function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `UGX ${n.toLocaleString("en-GB")}`;
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "item";
}
