"use client";
import styles from "../fitspa-admin.module.css";
import type { Ctx } from "./ctx";

export function Stat({ n, label, note }: { n: number | string; label: string; note: string }) {
  return (
    <div className={styles.stat}>
      <b>{n}</b>
      <span>{label}</span>
      <small>{note}</small>
    </div>
  );
}

export function SubTabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className={styles.subtabs} role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className={`${styles.subtab} ${value === t.key ? styles.subtabOn : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ProgrammeBar({ ctx, note }: { ctx: Ctx; note?: string }) {
  const { state, progId, setProgId } = ctx;
  return (
    <div className={styles.progBar}>
      <label>
        Regulator programme
        <select className={styles.input} value={progId} onChange={(e) => setProgId(e.target.value)} aria-label="Regulator programme">
          {state.programmes.map((p) => {
            const r = state.regulators.find((x) => x.id === p.regulatorId);
            return (
              <option key={p.id} value={p.id}>
                {r?.short ?? "?"} · {p.name}{p.status === "draft" ? " (draft)" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {note && <span className={styles.progNote}>{note}</span>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function NoProgramme({ ctx }: { ctx: Ctx }) {
  return (
    <section className={styles.panel}>
      <Empty>No regulator programme yet. Add a regulator first.</Empty>
      <div className={styles.actionsRow}>
        <button className={styles.primary} type="button" onClick={() => ctx.go("regulators")}>Add a regulator</button>
      </div>
    </section>
  );
}
