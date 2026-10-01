import Link from "next/link";
import styles from "./apply-hub.module.css";
import ApplyExpertPanel from "./apply-expert-panel";

export const metadata = {
  title: "Apply | FITSPA Compliance Platform",
  description: "Prepare and manage your Payments, Digital Lending, or Insurance licence application.",
};

// Ports `screen-apply-hub` from the uploaded Beacon template 1:1 (§9, Phase 1
// of strategy/beacon-template-redesign-plan.md). The Payments and Digital
// Lending application flows themselves are Phase 3/4 work -- until then
// these two cards lead to a short "being built" page rather than a broken
// link, per the accepted Phase 1 tradeoff in §7 of the plan.
export default function ApplyHubPage() {
  return (
    <div className={styles.ahRoot}>
      <header className={styles["ah-nav"]}>
        <Link className={styles["ah-brand"]} id="ah-brand-home" href="/" aria-label="FITSPA Compliance Platform home">
          <span className={styles["ah-brand-mark"]} aria-hidden="true"></span>FITSPA Compliance Platform
        </Link>
        <nav className={styles["ah-nav-links"]} aria-label="Primary">
          <button className={`${styles["ah-nav-link"]} ${styles.muted}`} type="button" disabled>
            Explore
          </button>
          <span className={`${styles["ah-nav-link"]} ${styles.active}`}>Apply</span>
          <Link className={styles["ah-nav-link"]} href="/comply">Comply</Link>
          <Link className={styles["ah-nav-link"]} href="/assistant">AI Assistant</Link>
        </nav>
        <div className={styles["ah-nav-actions"]}>
          <Link className={styles["ah-nav-search"]} href="/lookup">Search a member</Link>
          <Link className={styles["ah-nav-register"]} href="/signup">Register</Link>
          <Link className={styles["ah-nav-back"]} href="/">← Home</Link>
        </div>
      </header>
      <main className={styles["ah-main"]}>
        <div className={styles["ah-eyebrow"]}>Licence Application Manager</div>
        <h1 className={styles["ah-title"]}>What are you applying for?</h1>
        <p className={styles["ah-dek"]}>Choose the licence application you want FITSPA Compliance Platform to help you prepare.</p>

        <div className={styles["ah-grid"]}>
          <article className={styles["ah-card"]}>
            <div className={styles["ah-card-kicker"]}>Bank of Uganda</div>
            <h2>Payments</h2>
            <p>Prepare a Bank of Uganda payment licence application.</p>
            <Link className={styles["ah-card-action"]} href="/apply/payments">Start Payments application →</Link>
          </article>
          <article className={styles["ah-card"]}>
            <div className={styles["ah-card-kicker"]}>MRD-MoFPED</div>
            <h2>Digital Lending</h2>
            <p>Prepare a Money Lender or NDTMFI application for digital lending.</p>
            <Link className={styles["ah-card-action"]} href="/apply/digital-lending">Start Digital Lending application →</Link>
          </article>
          <article className={styles["ah-card"]}>
            <div className={styles["ah-card-kicker"]}>Insurance Regulatory Authority</div>
            <h2>Insurance</h2>
            <p>Prepare an IRA licence application as an Insurer, Reinsurer, Broker, Agent, or HMO.</p>
            <Link className={styles["ah-card-action"]} href="/apply/insurance">Start Insurance application →</Link>
          </article>
        </div>

        <ApplyExpertPanel
          contextKey="general"
          heading="Not sure which application you need?"
          helpText="Ask for help before you start a licence pathway."
        />
      </main>
    </div>
  );
}
