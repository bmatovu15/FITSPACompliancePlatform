import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PathwayRegulator } from "@/lib/types";
import styles from "./requirements-pathway.module.css";

export const metadata = {
  title: "Requirements Pathway Wizard — FITSPA Compliance Platform",
  description:
    "Answer a few questions about your business and get a tailored, phase-by-phase licence-readiness checklist with fees for your regulator — no login required.",
};

// A regulator's wizard is considered published, and gets a working link on
// this hub, when its status matches the "Active" convention used elsewhere
// in this schema (see the `regulators`/`licences` status columns). Anything
// else (e.g. "Pending Approval", "Rejected") is shown greyed out with no
// link, per the spec's "skip/grey it out rather than linking to a broken
// wizard" -- the schema doc's literal wording ("published") doesn't match
// the seeded data's status vocabulary, so this is the closest equivalent.
function isPublished(status: string) {
  return status === "Active";
}

function hrefFor(key: string) {
  if (key === "nps") return "/nps-pathway";
  if (key === "digital_credit") return "/digital-credit-pathway";
  return `/requirements-pathway/${key}`;
}

export default async function RequirementsPathwayHubPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("pathway_regulators").select("*").order("sort_order");
  const regulators = (data ?? []) as PathwayRegulator[];

  return (
    <div className={styles.pathwayRoot}>
      {/* No separate sticky masthead here -- the site's own header above
          already carries the FITSPA brand and nav, so a second bar just
          duplicated it (and was the source of a stacking-order bug where
          the nav dropdown got painted underneath it). The wizard/app
          screens further down the flow keep their masthead since it
          carries live route/progress controls, not just branding. */}
      <div className={styles["hub-wrap"]}>
        <section className={styles["hub-hero"]}>
          <div className={styles["hub-eyebrow"]}>FITSPA REQUIREMENTS PATHWAY WIZARD · NO LOGIN REQUIRED</div>
          <h1 className={styles["hub-title"]}>Find out exactly what your licence application needs.</h1>
          <p className={styles["hub-dek"]}>
            Pick your regulator below. Answer a few questions about your planned activity, and each tool builds a
            filtered, phase-by-phase checklist of every document, decision and approval required — with the fees
            that apply to your route. Progress is saved in your browser only; nothing is submitted anywhere.
          </p>
        </section>

        <div className={styles["regulator-grid"]}>
          {regulators.map((r) => {
            const published = isPublished(r.status);
            const stats = r.hero_stats ?? [];
            const cardInner = (
              <>
                <div className={styles["regulator-card-head"]}>
                  <div className={styles.seal}>{r.seal_text || r.title.slice(0, 3).toUpperCase()}</div>
                  <h2 className={styles["regulator-title"]}>{r.title}</h2>
                </div>
                {r.eyebrow && <p className={styles["regulator-eyebrow"]}>{r.eyebrow}</p>}
                {r.subtitle && <p className={styles["regulator-subtitle"]}>{r.subtitle}</p>}
                {stats.length > 0 && (
                  <div className={styles["regulator-stats"]}>
                    {stats.map((s, i) => (
                      <div key={i}>
                        <strong>{s.value}</strong>
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
                {!published && <p className={styles["regulator-status-note"]}>Not yet published</p>}
              </>
            );

            return published ? (
              <Link key={r.key} href={hrefFor(r.key)} className={styles["regulator-card"]}>
                {cardInner}
              </Link>
            ) : (
              <div key={r.key} className={`${styles["regulator-card"]} ${styles.disabled}`} aria-disabled="true">
                {cardInner}
              </div>
            );
          })}
          {regulators.length === 0 && <div className={styles["empty-state"]}>No pathways published yet.</div>}
        </div>

        <p className={styles["source-note"]}>
          Each pathway is a working tool to help map licence-application readiness — not a substitute for legal
          advice or direct confirmation with the relevant regulator.
        </p>
      </div>
    </div>
  );
}
