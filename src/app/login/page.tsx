"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  function useDemoAccount(acct: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(acct.email);
    setPassword(acct.password);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="grid gap-10 sm:grid-cols-2 sm:items-start">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Member sign in</h1>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm" style={{ color: "#a3372f" }}>{error}</p>}
            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Not a member yet? <a className="underline" href="/signup">Join FITSPA</a>
          </p>
        </div>

        <div className="card w-full max-w-sm p-5 sm:mx-0 mx-auto">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Demo credentials</h2>
            <span className="badge badge-amber">Temporary</span>
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            For review and testing only. Click an account to fill the form, both members and the FITSPA admin sign in
            here.
          </p>
          <div className="mt-4 space-y-3">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.email}
                type="button"
                onClick={() => useDemoAccount(acct)}
                className="w-full rounded-lg border p-3 text-left text-sm transition hover:opacity-80"
                style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{acct.label}</span>
                  <span style={{ color: "var(--color-text-muted)" }} className="text-xs">{acct.detail}</span>
                </div>
                <div className="mt-1 font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {acct.email}
                </div>
                <div className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {acct.password}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
