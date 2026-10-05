import Link from "next/link";
import styles from "./home.module.css";
import { BRAND } from "@/lib/brand";

// The FITSPA Compliance Platform platform landing screen (`screen-platform` in the uploaded
// template), ported markup-for-markup per the Phase 1 plan in
// strategy/beacon-template-redesign-plan.md §3 (option B: same classes, same
// structure, only the interaction wiring is adapted -- imperative
// switchScreen() calls become Next.js <Link> navigation to /apply and
// /comply). This page owns its own masthead; see src/components/site-chrome.tsx
// for why the legacy FITSPA header/footer are suppressed on this route.
export default function Home() {
  return (
    <div className={styles.bpRoot}>
      <header className={styles["bp-nav"]}>
        <div className={styles["bp-brand"]}>
          <span className={styles["bp-brand-mark"]} aria-hidden="true"></span>{BRAND}
        </div>
        <nav className={styles["bp-nav-links"]} aria-label="Primary">
          <button className={`${styles["bp-nav-link"]} ${styles["bp-inactive"]}`} type="button" aria-disabled="true">
            Explore
          </button>
          <Link className={styles["bp-nav-link"]} href="/apply">Apply</Link>
          <Link className={styles["bp-nav-link"]} href="/comply">Comply</Link>
          <Link className={styles["bp-nav-link"]} href="/assistant">AI Assistant</Link>
        </nav>
        <div className={styles["bp-nav-actions"]}>
          <Link className={styles["bp-nav-search"]} href="/lookup">Search a member</Link>
          <Link className={styles["bp-nav-register"]} href="/signup">Register</Link>
        </div>
      </header>

      <section className={styles["bp-hero"]}>
        <div className={styles["bp-copy"]}>
          <h1 className={styles["bp-title"]}>Understand.<br />Apply.<br />Stay compliant.</h1>
          <p className={styles["bp-sub"]}>
            Know your compliance requirements, prepare your application, and stay compliant.
          </p>
          <Link className={styles["bp-primary"]} href="/apply">Start an application →</Link>
        </div>

        <div className={styles["bp-visual"]} aria-label={`${BRAND} application illustration`}>
          <svg className={styles["bp-map"]} viewBox="0 0 500 560" role="img" aria-label="Uganda">
            <path d="M250 20 L304 43 L337 81 L377 90 L409 126 L433 165 L426 206 L454 245 L438 284 L453 322 L431 356 L420 401 L385 421 L375 465 L331 486 L294 516 L251 502 L213 522 L177 492 L136 480 L114 439 L81 421 L77 381 L45 347 L64 308 L46 270 L70 235 L67 193 L103 163 L112 121 L151 101 L177 62 L218 62 Z" />
            <text className={styles.country} x="267" y="180">UGANDA</text>
            <circle cx="286" cy="383" r="4" />
            <text className={styles.city} x="299" y="388">Kampala</text>
          </svg>

          <div className={styles["bp-reg-card"]} aria-hidden="true">
            <div className={styles["bp-mini-title"]}>Regulations</div>
            <div className={styles["bp-mini-lines"]}><span></span><span></span></div>
          </div>

          <div className={styles["bp-compliance-mini"]} aria-hidden="true">
            <div className={styles["bp-mini-title"]}>Ongoing compliance</div>
            <div className={styles["bp-mini-bars"]}><i></i><i></i><i></i><i></i></div>
          </div>

          <div className={styles["bp-app-window"]}>
            <div className={styles["bp-window-top"]}><span></span><span></span><span></span></div>
            <div className={styles["bp-window-body"]}>
              <div className={styles["bp-window-main"]}>
                <h3>Your application</h3>
                <div className={styles["bp-check"]}><i>✓</i><span>Prepare documents</span></div>
                <div className={styles["bp-check"]}><i>✓</i><span>Track progress</span></div>
                <div className={`${styles["bp-check"]} ${styles["bp-muted"]}`}><i>−</i><span>Get expert review</span></div>
              </div>
            </div>
          </div>

          <div className={styles["bp-ecosystem-note"]}>A stronger fintech ecosystem for a more inclusive Uganda</div>
        </div>
      </section>

      <section className={styles["bp-pathways"]} id="bp-pathways">
        <div className={styles["bp-pathway-inner"]}>
          <h2 className={styles["bp-pathway-title"]}>Choose your pathway</h2>
          <div className={styles["bp-cards"]}>
            <article className={styles["bp-card"]}>
              <div>
                <div className={styles["bp-kicker"]}>EXPLORE</div>
                <h3>Understand Fintech Compliance</h3>
                <p>Explore regulatory requirements, laws and guidance.</p>
              </div>
              <div className={styles["bp-coming-soon"]} aria-label="Explore coming soon">Coming soon</div>
            </article>

            <article className={`${styles["bp-card"]} ${styles["bp-live"]}`}>
              <div>
                <div className={styles["bp-kicker"]}>APPLY</div>
                <h3>Licence Application Manager</h3>
                <p>Prepare and manage your Payments or Digital Lending licence application.</p>
              </div>
              <Link className={styles["bp-card-action"]} href="/apply">Choose application →</Link>
            </article>

            <article className={styles["bp-card"]}>
              <div>
                <div className={styles["bp-kicker"]}>COMPLY</div>
                <h3>Compliance Assistant</h3>
                <p>Track and manage your ongoing Payments or Digital Lending compliance obligations.</p>
              </div>
              <Link className={`${styles["bp-card-action"]} ${styles["bp-card-action-live"]}`} href="/comply">Choose compliance →</Link>
            </article>
          </div>
        </div>
      </section>

      <section className={styles["bp-utility"]}>
        <div className={styles["bp-utility-inner"]}>
          <h2 className={styles["bp-utility-title"]}>Already part of FITSPA?</h2>
          <div className={styles["bp-utility-grid"]}>
            <div className={styles["bp-utility-card"]}>
              <h4>Search a member</h4>
              <p>Look up a registered FITSPA member and check their licensed status.</p>
              <Link href="/lookup">Search the directory →</Link>
            </div>
            <div className={styles["bp-utility-card"]}>
              <h4>Register for membership</h4>
              <p>Join FITSPA to unlock the full member dashboard and compliance tools.</p>
              <Link href="/signup">Register for membership →</Link>
            </div>
            <div className={styles["bp-utility-card"]}>
              <h4>AI Assistant</h4>
              <p>Ask questions about fintech regulation and get guided to the right pathway.</p>
              <Link href="/assistant">Talk to the AI Assistant →</Link>
            </div>
            <div className={styles["bp-utility-card"]}>
              <h4>FITSPA Admin (demonstration)</h4>
              <p>See how FITSPA manages every obligation and how it appears on member pages. No login needed.</p>
              <Link href="/fitspa-admin">Open the admin demo →</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles["bp-footer"]}>
        <strong>{BRAND}</strong>
        <span>Fintech compliance, in one place.</span>
      </footer>
    </div>
  );
}
