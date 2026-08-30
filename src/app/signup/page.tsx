"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FintechVertical, Regulator, Licence } from "@/lib/types";
import { CONTACT_ROLES } from "@/lib/types";

type Step = 1 | 2 | 3 | 4 | 5;

export default function SignupPage() {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>(1);
  const [verticals, setVerticals] = useState<FintechVertical[]>([]);
  const [regulators, setRegulators] = useState<Regulator[]>([]);
  const [licences, setLicences] = useState<Licence[]>([]);

  // form state
  const [verticalId, setVerticalId] = useState("");
  const [newVertical, setNewVertical] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [fitspaMemberId, setFitspaMemberId] = useState("");
  const [officeLocation, setOfficeLocation] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [regulatorId, setRegulatorId] = useState("");
  const [licenceId, setLicenceId] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [checkResult, setCheckResult] = useState<"idle" | "checking" | "match" | "nomatch">("idle");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: r }, { data: l }] = await Promise.all([
        supabase.from("fintech_verticals").select("id,name,status").eq("status", "active").order("name"),
        supabase.from("regulators").select("id,name,sector,status").eq("status", "Active").order("name"),
        supabase.from("licences").select("id,regulator_id,name,description,status").eq("status", "Active").order("name"),
      ]);
      setVerticals(v ?? []);
      setRegulators(r ?? []);
      setLicences(l ?? []);
    })();
  }, [supabase]);

  async function addVertical() {
    if (!newVertical.trim()) return;
    const { data, error: e } = await supabase
      .from("fintech_verticals")
      .insert({ name: newVertical.trim(), status: "pending" })
      .select()
      .single();
    if (!e && data) {
      setVerticals((v) => [...v, data as FintechVertical]);
      setVerticalId(data.id);
      setNewVertical("");
    }
  }

  async function checkLicence() {
    if (!regulatorId || !licenceNumber) return;
    setCheckResult("checking");
    const { data } = await supabase.rpc("preview_licence_match", {
      p_regulator_id: regulatorId,
      p_licence_number: licenceNumber,
    });
    setCheckResult(data ? "match" : "nomatch");
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: companyEmail,
        password,
        options: { emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined },
      });
      if (signUpErr) throw signUpErr;

      let logoUrl: string | null = null;
      if (logoFile && signUpData.user) {
        const ext = logoFile.name.split(".").pop();
        const path = `${signUpData.user.id}/logo.${ext}`;
        const { error: upErr } = await supabase.storage.from("company-logos").upload(path, logoFile, { upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
          logoUrl = pub.publicUrl;
        }
      }

      const { data: signupRes, error: rpcErr } = await supabase.rpc("signup_member", {
        p_company_name: companyName,
        p_company_email: companyEmail,
        p_fitspa_member_id: fitspaMemberId,
        p_office_location: officeLocation,
        p_contact_name: contactName,
        p_contact_role: contactRole,
        p_fintech_vertical_id: verticalId || null,
        p_regulator_id: regulatorId,
        p_licence_id: licenceId,
        p_licence_number: licenceNumber,
        p_logo_url: logoUrl,
      });
      if (rpcErr) throw rpcErr;
      setCheckResult(signupRes?.[0]?.licence_verified ? "match" : "nomatch");
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const availableLicences = licences.filter((l) => l.regulator_id === regulatorId);

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Check your email</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
          We've sent an activation link to <strong>{companyEmail}</strong>. Click it to confirm you're
          from {companyName || "your company"} and activate your account.
        </p>
        {checkResult === "nomatch" && (
          <p className="mt-4 rounded-lg p-3 text-sm" style={{ background: "#fbedd9", color: "#93590b" }}>
            Heads up: the licence number you entered didn't match FITSPA's regulator registry. Your
            account will still activate, but a FITSPA officer will need to manually verify your licence
            before it shows as verified.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Join FITSPA</h1>
      <div className="stepper mt-4 mb-8">
        {["Vertical", "Company", "Contact", "Licence", "Account"].map((label, i) => {
          const n = (i + 1) as Step;
          const state = n < step ? "done" : n === step ? "active" : "";
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`step-dot ${state}`}>{n < step ? "✓" : n}</div>
              {i < 4 && <div className="h-px w-6" style={{ background: "var(--color-border)" }} />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold">Which fintech vertical are you in?</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {verticals.map((v) => (
              <label key={v.id} className="card flex cursor-pointer items-center gap-2 p-3">
                <input type="radio" checked={verticalId === v.id} onChange={() => setVerticalId(v.id)} />
                <span className="text-sm">{v.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input className="input" placeholder="Don't see yours? Add it" value={newVertical} onChange={(e) => setNewVertical(e.target.value)} />
            <button className="btn btn-ghost" onClick={addVertical} type="button">Add vertical</button>
          </div>
          <div className="mt-6 flex justify-end">
            <button className="btn btn-primary" disabled={!verticalId} onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Company details</h2>
          <div>
            <label className="label">Company name</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className="label">Company email</label>
            <input className="input" type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>We'll send an activation link here.</p>
          </div>
          <div>
            <label className="label">FITSPA member ID (if known)</label>
            <input className="input" value={fitspaMemberId} onChange={(e) => setFitspaMemberId(e.target.value)} />
          </div>
          <div>
            <label className="label">Office location</label>
            <input className="input" value={officeLocation} onChange={(e) => setOfficeLocation(e.target.value)} />
          </div>
          <div>
            <label className="label">Company logo</label>
            <input className="input" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" disabled={!companyName || !companyEmail} onClick={() => setStep(3)}>Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Who's signing up?</h2>
          <div>
            <label className="label">Your name</label>
            <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label className="label">Your role</label>
            <select className="input" value={contactRole} onChange={(e) => setContactRole(e.target.value)}>
              <option value="">Select…</option>
              {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" disabled={!contactName || !contactRole} onClick={() => setStep(4)}>Next</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your regulator licence</h2>
          <div>
            <label className="label">Regulator</label>
            <select className="input" value={regulatorId} onChange={(e) => { setRegulatorId(e.target.value); setLicenceId(""); setCheckResult("idle"); }}>
              <option value="">Select…</option>
              {regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Licence</label>
            <select className="input" value={licenceId} onChange={(e) => setLicenceId(e.target.value)} disabled={!regulatorId}>
              <option value="">Select…</option>
              {availableLicences.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Licence number</label>
            <div className="flex gap-2">
              <input className="input" value={licenceNumber} onChange={(e) => { setLicenceNumber(e.target.value); setCheckResult("idle"); }} />
              <button className="btn btn-ghost btn-sm" type="button" onClick={checkLicence} disabled={!regulatorId || !licenceNumber}>
                Check
              </button>
            </div>
            {checkResult === "checking" && <p className="mt-1 text-xs">Checking…</p>}
            {checkResult === "match" && <p className="mt-1 text-xs" style={{ color: "#0d3b2e" }}>✓ Matches FITSPA's regulator registry.</p>}
            {checkResult === "nomatch" && (
              <p className="mt-1 text-xs" style={{ color: "#a3372f" }}>
                No match found — please double check the licence number. You can still continue; FITSPA will verify manually.
              </p>
            )}
          </div>
          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn-primary" disabled={!regulatorId || !licenceId || !licenceNumber} onClick={() => setStep(5)}>Next</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Create your password</h2>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
          </div>
          {error && <p className="text-sm" style={{ color: "#a3372f" }}>{error}</p>}
          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={() => setStep(4)}>Back</button>
            <button className="btn btn-primary" disabled={password.length < 8 || submitting} onClick={submit}>
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
