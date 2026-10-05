"use client";
import styles from "../fitspa-admin.module.css";
import { readiness, readyScore } from "../admin-readiness";
import { Empty, ProgrammeBar } from "./shared";
import type { Ctx } from "./ctx";

export default function Publish({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const p = ctx.prog;
  const live = state.programmes.filter((x) => x.status === "published");
  const items = p ? readiness(state, p) : [];
  const sc = readyScore(items);
  const reg = p ? state.regulators.find((r) => r.id === p.regulatorId) : undefined;
  const publicDocs = state.documents.filter((d) => d.audience === "public" && live.some((x) => x.regulatorId === d.regulatorId));
  const canPublish = !!p && sc.requiredMissing.length === 0;

  return (
    <section className={styles.panel}>
      {p ? (
        <>
          <ProgrammeBar ctx={ctx} note="Check it is complete, then publish. Unpublishing hides it again at once." />
          <div className={styles.publishCard}>
            <div>
              <p className={styles.eyebrow}>{reg?.short} · {p.status === "published" ? "LIVE" : "DRAFT"}</p>
              <h2 className={styles.h2}>{p.name}</h2>
              <p className={styles.lead}>{sc.done} of {sc.total} items done ({sc.pct}%). {sc.requiredMissing.length ? `${sc.requiredMissing.length} required item(s) still missing.` : "Everything required is in place."}</p>
            </div>
            <div className={styles.actionsRow}>
              {p.status === "draft" ? (
                <button className={styles.primary} type="button" disabled={!canPublish}
                  onClick={() => ctx.update((s) => ({ ...s, programmes: s.programmes.map((x) => (x.id === p.id ? { ...x, status: "published" } : x)), regulators: s.regulators.map((r) => (r.id === p.regulatorId ? { ...r, status: "active" } : r)) }), `Published ${p.name} — it now appears on the Apply and Comply pages for members and visitors`)}>
                  Publish to members and visitors
                </button>
              ) : (
                <button className={styles.secondary} type="button" onClick={() => ctx.update((s) => ({ ...s, programmes: s.programmes.map((x) => (x.id === p.id ? { ...x, status: "draft" } : x)) }), `Unpublished ${p.name} — hidden from the Apply and Comply pages`)}>Unpublish</button>
              )}
            </div>
          </div>
          <ul className={styles.checklist}>
            {items.map((it) => (
              <li key={it.key} className={it.done ? styles.ckOk : it.required ? styles.ckMissing : styles.ckOpt}>
                <span className={styles.ckMark} aria-hidden="true">{it.done ? "✓" : it.required ? "!" : "–"}</span>
                <span><b>{it.label}</b><small>{it.detail}{!it.done && !it.required ? " · optional" : ""}</small></span>
                <button type="button" className={styles.linkBtn} onClick={() => ctx.go(it.section, { sub: it.sub })}>{it.done ? "Review" : "Fix"}</button>
              </li>
            ))}
          </ul>
        </>
      ) : <Empty>No programmes yet.</Empty>}

      <h2 className={styles.h2}>The public site, as a visitor sees it</h2>
      <div className={styles.previewGrid}>
        <div className={styles.previewBox}>
          <p className={styles.eyebrow}>APPLY · WHAT ARE YOU APPLYING FOR?</p>
          {live.length === 0 ? <Empty>Nothing published yet.</Empty> : live.map((x) => (
            <div key={x.id} className={styles.hubCard}>
              <b>{x.name.split(" (")[0]}</b>
              <small>{state.regulators.find((r) => r.id === x.regulatorId)?.short} · {x.classes.length} licence classes · {x.requirements.length} requirements</small>
              <span>Start application →</span>
            </div>
          ))}
        </div>
        <div className={styles.previewBox}>
          <p className={styles.eyebrow}>COMPLY · CHOOSE YOUR REGULATOR</p>
          {live.length === 0 ? <Empty>Nothing published yet.</Empty> : live.map((x) => (
            <div key={x.id} className={styles.hubCard}>
              <b>{x.name.split(" (")[0]}</b>
              <small>{x.obligations.filter((o) => o.status === "active").length} obligations · {x.events.length} events · {x.controls.length} control areas</small>
              <span>Open compliance →</span>
            </div>
          ))}
        </div>
        <div className={styles.previewBox}>
          <p className={styles.eyebrow}>DOCUMENT LIBRARY (PUBLIC)</p>
          {publicDocs.length === 0 ? <Empty>No public documents.</Empty> : publicDocs.slice(0, 6).map((d) => (
            <div key={d.id} className={styles.hubCard}><b>{d.title}</b><small>{state.regulators.find((r) => r.id === d.regulatorId)?.short} · {d.kind}</small></div>
          ))}
          {publicDocs.length > 6 && <p className={styles.small}>and {publicDocs.length - 6} more</p>}
        </div>
        <div className={styles.previewBox}>
          <p className={styles.eyebrow}>AI ASSISTANT</p>
          {!state.ai.enabled || !state.ai.visitors ? <Empty>Not available to visitors.</Empty> : live.map((x) => {
            const r = state.regulators.find((y) => y.id === x.regulatorId);
            const n = state.documents.filter((d) => d.regulatorId === x.regulatorId && d.audience === "public" && d.inAssistant && d.status === "indexed").length;
            return <div key={x.id} className={styles.hubCard}><b>{r?.short}</b><small>{n > 0 ? `Answers from ${n} documents` : r?.website ? `Website only (${r.website})` : "Not covered"}</small></div>;
          })}
        </div>
      </div>

      <h2 className={styles.h2}>Who can reach what</h2>
      <div className={styles.table} role="table">
        <div className={`${styles.tr} ${styles.th} ${styles.trAcc}`} role="row"><span>Feature</span><span>Visitor</span><span>Member</span><span>FITSPA staff</span></div>
        {[
          ["Apply: choose a regulator and licence class, see fees", "Yes", "Yes", "Yes"],
          ["Apply: save and submit an application", "Create an account", "Yes", "Review"],
          ["Comply: obligations, calendar and events", "No", "Yes, their own", "All members"],
          ["Public documents and the document library", "Yes", "Yes", "Manage"],
          ["Members-only documents", "No", "Yes", "Manage"],
          ["AI assistant", state.ai.enabled && state.ai.visitors ? "Yes (public sources)" : "Off", state.ai.enabled && state.ai.members ? "Yes (incl. members-only)" : "Off", "Test and configure"],
          ["This admin console", "No", "No", "Yes"],
        ].map(([f, v, m, s]) => (
          <div key={f} className={`${styles.tr} ${styles.trAcc}`} role="row"><span><b>{f}</b></span><span>{v}</span><span>{m}</span><span>{s}</span></div>
        ))}
      </div>
    </section>
  );
}
