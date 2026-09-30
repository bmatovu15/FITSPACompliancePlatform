import Link from "next/link";
import styles from "./comply-hub.module.css";
import ComplyExpertPanel from "./comply-expert-panel";

export const metadata = {
  title: "Comply | FITSPA Compliance Platform",
  description: "Track and manage your ongoing Payments or Digital Lending compliance obligations.",
};

// Ports `screen-comply-hub` from the uploaded Beacon template 1:1 (§9, Phase
// 1 of strategy/beacon-template-redesign-plan.md). The Beacon-styled Comply
// modules themselves are Phase 2 work (merging the audited new fields into
// the live compliance engine, §9.2/§9.3 of the plan) -- until then these two
// cards route straight into the existing, already-database-backed, member-
// gated Compliance Pathway Wizard so nothing regresses in the meantime.
export default function ComplyHubPage() {
  return (
    <div className={styles.chRoot}>
      <header className={styles["ch-nav"]}>
        <Link className={styles["ch-brand"]} id="ch-brand-home" href="/" aria-label="FITSPA Compliance Platform home">
          <span className={styles["ch-brand-mark"]} aria-hidden="true"></span>FITSPA Compliance Platform
        </Link>
        <nav className={styles["ch-nav-links"]} aria-label="Primary">
          <button className={`${styles["ch-nav-link"]} ${styles.muted}`} type="button" disabled>
            Explore
          </button>
          <Link className={styles["ch-nav-link"]} href="/apply">Apply</Link>
          <span className={`${styles["ch-nav-link"]} ${styles.active}`}>Comply</span>
          <Link className={styles["ch-nav-link"]} href="/assistant">AI Assistant</Link>
        </nav>
        <div className={styles["ch-nav-actions"]}>
          <Link className={styles["ch-nav-search"]} href="/lookup">Search a member</Link>
          <Link className={styles["ch-nav-register"]} href="/signup">Register</Link>
          <Link className={styles["ch-nav-back"]} href="/">← Home</Link>
        </div>
      </header>
      <main className={styles["ch-main"]}>
        <div className={styles["ch-eyebrow"]}>Compliance Assistant</div>
        <h1 className={styles["ch-title"]}>What do you need to stay compliant with?</h1>
        <p className={styles["ch-dek"]}>Choose the licensed activity you want FITSPA Compliance Platform to help you manage.</p>
        <div className={styles["ch-grid"]}>
          <article className={styles["ch-card"]}>
            <div className={styles["ch-card-kicker"]}>Bank of Uganda</div>
            <h2>Payments</h2>
            <p>
              Track ongoing obligations under your payments licence, including recurring filings, regulatory events
              and continuous controls.
            </p>
            <Link className={styles["ch-card-action"]} href="/dashboard/compliance-pathway?catalog=payments_compliance_assistant">
              Manage Payments compliance →
            </Link>
          </article>
          <article className={styles["ch-card"]}>
            <div className={styles["ch-card-kicker"]}>MRD-MoFPED</div>
            <h2>Digital Lending</h2>
            <p>Track ongoing obligations for a Money Lender or NDTMFI providing credit through digital channels.</p>
            <Link className={styles["ch-card-action"]} href="/dashboard/compliance-pathway?catalog=digital_lending_compliance_assistant">
              Manage Digital Lending compliance →
            </Link>
          </article>
        </div>
        <ComplyExpertPanel
          contextKey="general"
          heading="Not sure which compliance pathway applies?"
          helpText="Ask for help before setting up your compliance workspace."
        />
      </main>
    </div>
  );
}
