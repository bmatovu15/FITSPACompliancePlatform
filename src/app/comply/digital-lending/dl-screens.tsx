"use client";

import Link from "next/link";
import { useState } from "react";
import { setupValid, type Answer, type DLProfile, type Route, type SetupForm } from "@/lib/comply/digital-engine";

export function BrandMark() {
  return (
    <svg className="brandmark" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="16" fill="none" stroke="#111" strokeWidth="1.5" />
      <path d="M17 6 L17 17 L25 22" stroke="#111" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="17" cy="17" r="2.5" fill="#111" />
    </svg>
  );
}

export function LandingScreen({
  hasProfile,
  onSetup,
  onResume,
  onExpert,
}: {
  hasProfile: boolean;
  onSetup: () => void;
  onResume: () => void;
  onExpert: () => void;
}) {
  return (
    <section className="screen active" id="screen-landing">
      <header className="mast">
        <div className="brand">
          <BrandMark />
          <div>
            <span className="brandtitle">FITSPA Compliance Platform</span>
            <span className="brandsub">Digital Lending Compliance</span>
          </div>
        </div>
        <div className="head-actions">
          <Link className="link" id="landing-home" href="/comply">
            ← Compliance
          </Link>
          <button type="button" className="link" data-expert="general" onClick={onExpert}>
            Expert Support
          </button>
        </div>
      </header>
      <main className="landing">
        <div className="eyebrow">Compliance Assistant</div>
        <h1>Stay ahead of your digital lending obligations.</h1>
        <p className="dek">See what needs action, what is due next, and what evidence you need to keep.</p>
        <div className="hero-actions">
          <button type="button" className="btn primary" id="start-profile" onClick={onSetup}>
            Set up compliance →
          </button>
          {hasProfile ? (
            <button type="button" className="btn" id="resume-dashboard" style={{ display: "inline-flex" }} onClick={onResume}>
              Resume dashboard →
            </button>
          ) : null}
          <button type="button" className="textlink" data-expert="general" onClick={onExpert}>
            Speak to an expert
          </button>
        </div>
      </main>
    </section>
  );
}

export function SetupScreen({
  initial,
  onBack,
  onSave,
  onExpert,
}: {
  initial: Partial<DLProfile> | null;
  onBack: () => void;
  onSave: (f: SetupForm) => void;
  onExpert: () => void;
}) {
  // FIX: the setup choices live in a local draft and are committed only on
  // "Save and build workspace", so cancelling can no longer leak a partial
  // profile into the saved state (which made "Resume dashboard" appear).
  const [f, setF] = useState<SetupForm>({
    route: initial?.route || "",
    issue: initial?.issue || "",
    fye: initial?.fye || "",
    pdpoStatus: initial?.pdpoStatus || "",
    pdpo: initial?.pdpo || "",
  });
  const valid = setupValid(f);
  const routeBtn = (r: Route, label: string) => (
    <button type="button" className={`choice ${f.route === r ? "selected" : ""}`} data-route={r} onClick={() => setF({ ...f, route: r })}>
      {label}
    </button>
  );
  const pdpoBtn = (v: Answer, label: string) => (
    <button
      type="button"
      className={`choice ${f.pdpoStatus === v ? "selected" : ""}`}
      data-profile-choice="pdpoStatus"
      data-value={v}
      onClick={() => setF({ ...f, pdpoStatus: v })}
    >
      {label}
    </button>
  );
  return (
    <section className="screen active" id="screen-profile">
      <header className="mast">
        <div className="brand">
          <BrandMark />
          <div>
            <span className="brandtitle">Digital Lending Compliance</span>
            <span className="brandsub">Compliance profile</span>
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="link" id="profile-back" onClick={onBack}>
            ← Back
          </button>
          <button type="button" className="link" data-expert="profile" onClick={onExpert}>
            Expert Support
          </button>
        </div>
      </header>
      <main className="profile-wrap">
        <div className="profile-top">
          <div className="eyebrow">First-time setup</div>
          <h2>Set up the essentials.</h2>
          <p>Give FITSPA Compliance Platform the few facts it needs to build your first compliance workspace. You can complete the rest of your operating profile later.</p>
        </div>
        <section className="profile-section">
          <h3>Licence &amp; reporting basics</h3>
          <div className="field-grid">
            <div className="field">
              <label>Licence route</label>
              <div className="choice-row">
                {routeBtn("ml", "Money Lender")}
                {routeBtn("ndt", "NDTMFI")}
              </div>
            </div>
            <div></div>
            <div className="field">
              <label>Date first licensed by MRD-MoFPED</label>
              <input id="p-issue" type="date" value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} />
              <small>Use the date the institution was first licensed, not the date on the latest annual renewal licence.</small>
            </div>
            <div className="field">
              <label>Financial year-end</label>
              <input id="p-fye" type="date" value={f.fye} onChange={(e) => setF({ ...f, fye: e.target.value })} />
              <small>FITSPA Compliance Platform uses the month and day for recurring fiscal-year workflows.</small>
            </div>
          </div>
        </section>
        <section className="profile-section">
          <h3>PDPO registration</h3>
          <div className="field">
            <label>Are you currently registered with the PDPO?</label>
            <div className="choice-row">
              {pdpoBtn("yes", "Yes")}
              {pdpoBtn("no", "No")}
              {pdpoBtn("not-sure", "Not sure")}
            </div>
          </div>
          <div className="field" id="pdpo-expiry-wrap" style={{ display: f.pdpoStatus === "yes" ? "block" : "none", maxWidth: 440 }}>
            <label>PDPO Certificate of Registration expiry</label>
            <input id="p-pdpo" type="date" value={f.pdpo} onChange={(e) => setF({ ...f, pdpo: e.target.value })} />
            <small>Used to generate the renewal workflow.</small>
          </div>
        </section>
        <div className="profile-actions">
          <button type="button" className="btn" id="profile-cancel" onClick={onBack}>
            Cancel
          </button>
          <button type="button" className="btn primary" id="save-profile" disabled={!valid} onClick={() => onSave(f)}>
            Save and build workspace →
          </button>
        </div>
      </main>
    </section>
  );
}
