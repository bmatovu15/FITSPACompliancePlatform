"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BeaconNav from "@/components/beacon-nav";
import styles from "./login.module.css";

// TEMPORARY: demo credentials shown on-page for review/testing. Remove this
// block (and the panel that renders it below) once real member onboarding
// replaces the seeded demo accounts.
const DEMO_ACCOUNTS = [
  {
    label: "FITSPA Admin",
    detail: "Staff — routes to /admin",
    email: "mosseug@gmail.com",
    password: "Fitspa2026!Admin",
  },
  {
    label: "Demo Fintech Ltd",
    detail: "DEMO-001 — BOU-licensed",
    email: "demo.member@fitspa-demo.local",
    password: "Fitspa2026!Member",
  },
  {
    label: "Kampala Digital Payments Ltd",
    detail: "DEMO-002 — BOU PSP licence",
    email: "kampala.payments@fitspa-demo.local",
    password: "Fitspa2026!Member2",
  },
  {
    label: "Nile Microfinance Solutions Ltd",
    detail: "DEMO-003 — MRD Money Lender licence",
    email: "nile.microfinance@fitspa-demo.local",
    password: "Fitspa2026!Member3",
  },
  {
    label: "Mcash Uganda Limited",
    detail: "DEMO-004 — BOU PSP licence",
    email: "mcash@fitspa-demo.local",
    password: "Fitspa2026!Member4",
  },
  {
    label: "BCC PAY Insurance Brokers Ltd",
    detail: "DEMO-005 — IRA Insurance Broker",
    email: "bccpay@fitspa-demo.local",
    password: "Fitspa2026!Member5",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    const { data: isStaff } = await supabase.rpc("is_staff");
    router.push(isStaff ? "/admin" : "/dashboard");
    router.refresh();
  }

  function fillDemoAccount(acct: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
  }

  return (
    <div className={styles.loRoot}>
      <BeaconNav active="login" />
      <main className={styles.main}>
        <div className={styles.eyebrow}>Member Portal</div>
        <h1 className={styles.title}>Member sign in</h1>
        <p className={styles.dek}>Sign in to manage your FITSPA membership, licences, and ongoing compliance.</p>

        <div className={styles.layout}>
          <div className={styles.card}>
            <form onSubmit={onSubmit}>
              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Password</label>
                <input
                  className={styles.input}
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className={styles.msgError}>{error}</p>}
              <button className={styles.btn} type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className={styles.footNote}>
              Not a member yet? <a href="/signup">Join FITSPA</a>
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.demoHead}>
              <h2>Demo credentials</h2>
              <span className={styles.badgeAmber}>Temporary</span>
            </div>
            <p className={styles.demoNote}>
              For review and testing only. Click an account to fill the form — both members and the FITSPA admin
              sign in here.
            </p>
            <div className={styles.demoList}>
              {DEMO_ACCOUNTS.map((acct) => (
                <button key={acct.email} type="button" onClick={() => fillDemoAccount(acct)} className={styles.demoBtn}>
                  <div className={styles.demoRow}>
                    <span className={styles.demoLabel}>{acct.label}</span>
                    <span className={styles.demoDetail}>{acct.detail}</span>
                  </div>
                  <div className={styles.demoCred}>{acct.email}</div>
                  <div className={styles.demoCred}>{acct.password}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
