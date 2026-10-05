"use client";
import styles from "../fitspa-admin.module.css";
import { Empty } from "./shared";
import type { Ctx } from "./ctx";

export default function Activity({ ctx }: { ctx: Ctx }) {
  const log = ctx.state.log;
  return (
    <section className={styles.panel}>
      {log.length === 0 ? (
        <Empty>No changes yet. Anything you change in this demonstration is listed here with the time.</Empty>
      ) : (
        <ul className={styles.log}>
          {log.map((l, i) => (
            <li key={i}><time>{l.at}</time><span>FITSPA Admin (demo)</span><p>{l.text}</p></li>
          ))}
        </ul>
      )}
    </section>
  );
}
