"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./payments-workspace.module.css";

// cx("work-card is-ready") -> the CSS-module class names for each token.
// The design's class names are kept verbatim in the module, so the JSX below
// reads like the prototype's markup.
export function cx(names: string): string {
  return names
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => {
      const v = (styles as Record<string, string>)[n];
      if (!v && process.env.NODE_ENV !== "production") {
        console.warn("[payments] unknown class", n);
      }
      return v ?? "";
    })
    .filter(Boolean)
    .join(" ");
}

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="16" fill="none" stroke="#111111" strokeWidth="1.5"></circle>
      <path d="M17 6 L17 17 L25 22" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" fill="none"></path>
      <circle cx="17" cy="17" r="2.5" fill="#111111"></circle>
    </svg>
  );
}

// The per-screen masthead of the design: clock logo, "Payments Licence
// Application", a changing subtitle, and the right-hand actions.
export function PaymentsMasthead({
  subtitle,
  subtitleId,
  right,
  logoHome,
  left,
}: {
  subtitle: string;
  subtitleId?: string;
  right?: ReactNode;
  logoHome?: boolean;
  left?: ReactNode;
}) {
  const brand = (
    <div className={cx("masthead-brand")}>
      {logoHome ? (
        <Link href="/" title="Back to FITSPA Compliance Platform home" className={cx("logo-link")}>
          <Logo />
        </Link>
      ) : (
        <Logo />
      )}
      <div>
        <span className={cx("title")}>Payments Licence Application</span>
        <span className={cx("subtitle")} id={subtitleId}>
          {subtitle}
        </span>
      </div>
    </div>
  );
  return (
    <header className={cx("masthead")}>
      {left ? (
        <div className={cx("app-head-left")}>
          {left}
          {brand}
        </div>
      ) : (
        brand
      )}
      <div className={cx("masthead-right")}>{right}</div>
    </header>
  );
}
