"use client";

import { useEffect, useState, type FormEvent } from "react";
import FitspaAdminDemo from "./fitspa-admin-demo";
import styles from "./fitspa-admin.module.css";

// Presentation-only credentials. They are shown on the page on purpose and are
// checked in the browser only. This gate is NOT real security: it is not linked
// to Supabase or to the real /admin area, and the console behind it only works
// on sample data held in the browser tab.
const DEMO_EMAIL = "admin@fitspa.demo";
const DEMO_PASSWORD = "FitspaDemo2026";
const SESSION_KEY = "fitspa-admin-demo-session";

export default function FitspaAdminGate() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") setSignedIn(true);
    } catch {
      /* storage unavailable: fall back to signing in each visit */
    }
    setReady(true);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      setError("");
      setPassword("");
      setSignedIn(true);
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
    } else {
      setError("Those details do not match the demonstration credentials. Use the ones shown on this page.");
    }
  }

  function signOut() {
    setSignedIn(false);
    setEmail("");
    setPassword("");
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  function fill() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError("");
  }

  if (signedIn) return <FitspaAdminDemo onSignOut={signOut} />;
  if (!ready) return <div className={styles.root} />;

  return (
    <div className={styles.root}>
      <div className={styles.loginWrap}>
        <p className={styles.eyebrow}>FITSPA ADMIN</p>
        <h1 className={styles.loginTitle}>Sign in to the FITSPA Admin console</h1>
        <p className={styles.dek}>
          This is the presentation sign-in. Use the demonstration credentials below to open the console and show how FITSPA
          manages every obligation.
        </p>

        <form className={styles.loginCard} onSubmit={submit} noValidate>
          <label className={styles.loginLabel} htmlFor="fa-email">
            Email
          </label>
          <input
            id="fa-email"
            className={styles.loginInput}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@fitspa.demo"
          />
          <label className={styles.loginLabel} htmlFor="fa-password">
            Password
          </label>
          <input
            id="fa-password"
            className={styles.loginInput}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p className={styles.loginError} role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className={styles.primary}>
            Sign in
          </button>
        </form>

        <div className={styles.credBox} role="note">
          <strong>Demonstration credentials (presentation only)</strong>
          <dl>
            <dt>Email</dt>
            <dd>{DEMO_EMAIL}</dd>
            <dt>Password</dt>
            <dd>{DEMO_PASSWORD}</dd>
          </dl>
          <button type="button" className={styles.linkBtn} onClick={fill}>
            Fill in the credentials
          </button>
          <p>
            These are not real accounts. The console behind this screen runs on sample data in your browser only; nothing in the
            live platform can be reached or changed from it.
          </p>
        </div>
      </div>
    </div>
  );
}
