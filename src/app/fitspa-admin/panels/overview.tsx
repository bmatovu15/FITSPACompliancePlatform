"use client";
import styles from "../fitspa-admin.module.css";
import { readiness, readyScore } from "../admin-readiness";
import { Stat } from "./shared";
import type { Ctx } from "./ctx";
import type { Section } from "../admin-types";

const SHORT: Record<string, string> = {
  regulator: "Profile", classes: "Classes & fees", requirements: "Requirements", questions: "Questions", obligations: "Obligations",
  rules: "Rules", deadlines: "Deadlines", events: "Events", controls: "Controls", documents: "Documents", ai: "AI",
};

export default function Overview({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const activeObs = state.programmes.reduce((n, p) => n + p.obligations.filter((o) => o.status === "active").length, 0);
  const reqs = state.programmes.reduce((n, p) => n + p.requirements.length, 0);
  const live = state.programmes.filter((p) => p.status === "published").length;
  return (
    <section className={styles.panel}>
      <div className={styles.stats}>
        <Stat n={state.regulators.length} label="Regulators" note={`${state.programmes.length} with an Apply and Comply programme`} />
        <Stat n={`${live} / ${state.programmes.length}`} label="Programmes published" note="Visible to members and visitors" />
        <Stat n={activeObs} label="Active obligations" note={`${reqs} application requirements`} />
        <Stat n={state.documents.length} label="Documents" note={`${state.members.length} sample members`} />
      </div>

      <h2 className={styles.h2}>Is everything covered for each regulator?</h2>
      <p className={styles.lead}>
        One row per regulator programme, one column per thing a regulator needs. A tick means FITSPA has entered it here, so members and
        visitors get it; “Add” is still needed; a dash is optional. Click any cell to go and fix or add it.
      </p>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th>Programme</th>
              {Object.values(SHORT).map((s) => <th key={s}>{s}</th>)}
              <th>Ready</th>
            </tr>
          </thead>
          <tbody>
            {state.programmes.map((p) => {
              const items = readiness(state, p);
              const sc = readyScore(items);
              const reg = state.regulators.find((r) => r.id === p.regulatorId);
              return (
                <tr key={p.id}>
                  <th scope="row">
                    <b>{reg?.short}</b>
                    <small>{p.name}</small>
                    <i className={`${styles.pill} ${p.status === "published" ? styles.pillOn : styles.pillOff}`}>{p.status === "published" ? "Published" : "Draft"}</i>
                  </th>
                  {items.map((it) => (
                    <td key={it.key}>
                      <button
                        type="button"
                        className={`${styles.cell} ${it.done ? styles.cellOk : it.required ? styles.cellMissing : styles.cellOpt}`}
                        title={`${it.label}: ${it.detail}`}
                        onClick={() => ctx.go(it.section, { progId: p.id, sub: it.sub })}
                      >
                        {it.done ? "✓" : it.required ? "Add" : "–"}
                      </button>
                    </td>
                  ))}
                  <td><b>{sc.pct}%</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className={styles.h2}>Adding a new regulator, start to finish</h2>
      <ol className={styles.flow8}>
        {[
          ["Regulators", "Add the regulator: name, website for the assistant, and the acronyms it uses.", "regulators"],
          ["Apply", "Licence classes, minimum capital and fees, then the application requirements by phase.", "apply"],
          ["Comply", "Profile questions, obligations, who each applies to, due dates, events and control areas.", "comply"],
          ["Documents & AI", "Upload the Acts, regulations and forms. The assistant reads them and cites them.", "docsai"],
          ["Members", "Test with a sample member and see exactly which obligations reach them.", "members"],
          ["Publish & preview", "Check the readiness list, publish, and look at the public site as a visitor.", "publish"],
        ].map(([t, d, s]) => (
          <li key={t}>
            <b>{t}</b>
            <span>{d}</span>
            <button type="button" className={styles.linkBtn} onClick={() => ctx.go(s as Section)}>Open</button>
          </li>
        ))}
      </ol>

      <h2 className={styles.h2}>How an obligation reaches a member</h2>
      <ol className={styles.flow}>
        <li><b>The member answers once</b><span>Their licence profile: the questions you define in Comply → Profile questions.</span></li>
        <li><b>Each obligation names an audience</b><span>For example “Licensee using agents”. You set it when you add or edit the obligation.</span></li>
        <li><b>Each audience has a rule</b><span>For example Uses agents = Yes. You edit these in Comply → Applicability rules.</span></li>
        <li><b>The member&rsquo;s universe is built</b><span>Their Comply pages list every active obligation whose rule their answers satisfy. Change a rule and it changes for everyone.</span></li>
      </ol>
    </section>
  );
}
