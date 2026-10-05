import Link from "next/link";
import styles from "./beacon-nav.module.css";
import { BRAND } from "@/lib/brand";

// Shared Beacon masthead, extracted from the near-identical su-nav / ah-nav /
// ch-nav / dc-nav headers each Beacon-redesigned screen used to carry its
// own copy of (see src/app/signup/page.tsx's old SignupNav(), src/app/apply/
// page.tsx, src/app/comply/page.tsx, src/app/comply/digital-lending/page.tsx).
// Visuals are an exact port — same colours, spacing, sticky behaviour and
// responsive collapse — just centralised and parameterised by which item on
// the page you're currently viewing is "active".
export type BeaconNavActive =
  | "home"
  | "explore"
  | "apply"
  | "comply"
  | "assistant"
  | "lookup"
  | "login"
  | "search"
  | "register";

export default function BeaconNav({
  active,
  backHref = "/",
  backLabel = "← Home",
}: {
  active: BeaconNavActive;
  /** Where the "← Home" action links. Defaults to "/". Pass a different
   *  target (e.g. "/comply") the way comply/digital-lending's own nav used
   *  to point "← Compliance" back at its hub, rather than all the way home. */
  backHref?: string;
  /** Label for the back action. Defaults to "← Home". */
  backLabel?: string;
}) {
  return (
    <header className={styles.nav}>
      <Link className={styles.brand} href="/" aria-label={`${BRAND} home`}>
        <span className={styles.brandMark} aria-hidden="true"></span>{BRAND}
      </Link>

      <nav className={styles.navLinks} aria-label="Primary">
        <button className={`${styles.navLink} ${styles.muted}`} type="button" disabled>
          Explore
        </button>
        <Link
          className={`${styles.navLink} ${active === "apply" ? styles.active : ""}`}
          href="/apply"
          aria-current={active === "apply" ? "page" : undefined}
        >
          Apply
        </Link>
        <Link
          className={`${styles.navLink} ${active === "comply" ? styles.active : ""}`}
          href="/comply"
          aria-current={active === "comply" ? "page" : undefined}
        >
          Comply
        </Link>
        <Link
          className={`${styles.navLink} ${active === "assistant" ? styles.active : ""}`}
          href="/assistant"
          aria-current={active === "assistant" ? "page" : undefined}
        >
          AI Assistant
        </Link>
      </nav>

      <div className={styles.navActions}>
        {active === "lookup" ? (
          <span className={styles.navActionActive} aria-current="page">
            Search a member
          </span>
        ) : (
          <Link className={styles.navSearch} href="/lookup">
            Search a member
          </Link>
        )}

        {active === "register" ? (
          <span className={styles.navActionActive} aria-current="page">
            Register
          </span>
        ) : (
          <Link className={styles.navRegister} href="/signup">
            Register
          </Link>
        )}

        {active !== "home" && (
          <Link className={styles.navBack} href={backHref}>
            {backLabel}
          </Link>
        )}
      </div>
    </header>
  );
}
