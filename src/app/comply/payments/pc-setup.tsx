"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BY_ID,
  SAMPLE_PROFILE,
  baselineEvidenceFor,
  baselineItems,
  fmtDate,
  isEmi,
  licenceComplete,
  operatingDone,
  sampleHistoryFor,
  type BaselineValue,
  type Profile,
} from "@/lib/comply/payments-engine";
import type { PcCtx } from "./pc-types";

function Brand({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true"></div>
      <div>
        <span className="brand-name">{name}</span>
        <span className="brand-sub">{sub}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

export function Landing({ ctx }: { ctx: PcCtx }) {
  const { state } = ctx;
  return (
    <section className="screen active" id="screen-landing">
      <header className="masthead">
        <Brand name="Beacon" sub="Payments compliance" />
        <div className="masthead-actions">
          <Link className="link-btn" id="beacon-home-link" href="/comply">
            ← Compliance
          </Link>
        </div>
      </header>
      <main className="hero">
        <div>
          <p className="eyebrow">Payments · Comply</p>
          <h1>Stay on top of your payments compliance.</h1>
          <p className="hero-dek">
            See what needs attention, prepare recurring submissions, respond to regulatory changes and events, and keep
            evidence of what you have completed.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn primary"
              id="start-setup"
              onClick={() => {
                ctx.setSetupOrigin("landing");
                ctx.setScreen("licence");
              }}
            >
              Set up my compliance assistant →
            </button>
            {state.profileSet && (
              <button type="button" className="btn subtle" id="landing-resume" onClick={() => ctx.setScreen("app")}>
                Resume my compliance assistant
              </button>
            )}
          </div>
        </div>
        <div className="hero-preview" aria-hidden="true">
          <div className="preview-sheet">
            <div className="preview-head">
              <strong>Today</strong>
              <span>PAYMENTS COMPLIANCE</span>
            </div>
            <div className="preview-section">
              <div className="preview-label">Needs attention</div>
              <div className="preview-row">
                <span className="dot danger"></span>
                <div>
                  <b>Monthly NPS return</b>
                  <small>Submission needs confirmation</small>
                </div>
                <em>Action</em>
              </div>
              <div className="preview-row">
                <span className="dot warn"></span>
                <div>
                  <b>Q3 financial statements</b>
                  <small>Prepare before the legal due date</small>
                </div>
                <em>Upcoming</em>
              </div>
              <div className="preview-row">
                <span className="dot"></span>
                <div>
                  <b>Minimum capital</b>
                  <small>Continuous control</small>
                </div>
                <em>Review</em>
              </div>
            </div>
          </div>
          <div className="preview-float">
            <strong>Something changed?</strong>
            <span>Report the event. Beacon works out the obligations and timing that follow.</span>
          </div>
        </div>
      </main>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 1: licence profile
// ---------------------------------------------------------------------------

const PSO_CLASSES: [string, string][] = [
  ["funds_large", "Funds transfer — large"],
  ["funds_medium", "Funds transfer — medium"],
  ["funds_small", "Funds transfer — small"],
  ["clearing", "Clearing system / switch"],
  ["settlement", "Settlement system"],
  ["third_party", "Third-party system"],
];
const PSP_CLASSES: [string, string][] = [
  ["emi", "Electronic money issuer"],
  ["other_psp", "Other payment service provider"],
];
const INSTRUMENT_CLASSES: [string, string][] = [
  ["cards", "Payment cards"],
  ["electronic_devices", "Electronic devices"],
  ["paper", "Paper-based instruments"],
];

type ArrName = "psoClasses" | "pspClasses" | "instrumentClasses";
type CatName = "pso" | "psp" | "instrument";

export function SetupLicence({ ctx }: { ctx: PcCtx }) {
  const p = ctx.state.profile;
  const setProfile = (fn: (p: Profile) => Profile) => ctx.update((s) => ({ ...s, profile: fn(s.profile) }));

  const toggleCat = (c: CatName) =>
    setProfile((pr) => {
      const next: Profile = { ...pr, categories: { ...pr.categories, [c]: !pr.categories[c] } };
      if (!next.categories[c]) {
        if (c === "pso") next.psoClasses = [];
        if (c === "psp") {
          next.pspClasses = [];
          next.emiBand = "";
        }
        if (c === "instrument") next.instrumentClasses = [];
      }
      return next;
    });
  const toggleChip = (arr: ArrName, val: string) =>
    setProfile((pr) => {
      const cur = pr[arr];
      return { ...pr, [arr]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] };
    });

  const emi = isEmi(p);
  const chips = (arr: ArrName, list: [string, string][]) =>
    list.map(([val, label]) => (
      <button
        type="button"
        key={val}
        data-arr={arr}
        data-val={val}
        className={`check-chip${p[arr].includes(val) ? " selected" : ""}`}
        aria-pressed={p[arr].includes(val)}
        onClick={() => toggleChip(arr, val)}
      >
        {label}
      </button>
    ));
  const card = (c: CatName, title: string, text: string) => (
    <button
      type="button"
      data-cat={c}
      className={`choice-card${p.categories[c] ? " selected" : ""}`}
      aria-pressed={p.categories[c]}
      onClick={() => toggleCat(c)}
    >
      <span className="choice-check"></span>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );

  return (
    <section className="screen active" id="screen-setup-licence">
      <header className="masthead">
        <Brand name="Payments Compliance Assistant" sub="Set up your compliance profile" />
        <div className="masthead-actions">
          <button
            type="button"
            className="link-btn"
            id="setup-licence-back"
            onClick={() => ctx.setScreen(ctx.setupOrigin === "app" ? "app" : "landing")}
          >
            {ctx.setupOrigin === "app" ? "← Back to compliance workspace" : "← Back"}
          </button>
        </div>
      </header>
      <main className="setup-shell">
        <div className="stepper">
          <div className="step-dot active">1</div>
          <div className="step-line"></div>
          <div className="step-dot">2</div>
          <div className="step-line"></div>
          <div className="step-dot">3</div>
        </div>
        <p className="eyebrow">Licence profile</p>
        <h1 className="setup-title">Which NPS licences do you hold?</h1>
        <p className="setup-note">
          Select every category and class that appears on your operating licence. Beacon uses the complete licence
          profile — not a single “primary” licence — to determine what applies.
        </p>
        <p className="setup-inline-help">
          Not sure what is on your licence? Use your current Bank of Uganda operating licence as the reference. You can
          also ask an expert before generating the workspace.
        </p>

        <div className="choice-grid" id="licence-category-grid">
          {card("pso", "Payment system operator", "Funds transfer, clearing, settlement or third-party systems.")}
          {card("psp", "Payment service provider", "Electronic money or other payment services.")}
          {card("instrument", "Issuer of a payment instrument", "Payment cards, electronic devices or paper-based instruments.")}
        </div>

        <div className={`nested${p.categories.pso ? " visible" : ""}`} id="pso-options">
          <p className="nested-title">Payment system operator classes</p>
          <div className="check-list">{chips("psoClasses", PSO_CLASSES)}</div>
        </div>

        <div className={`nested${p.categories.psp ? " visible" : ""}`} id="psp-options">
          <p className="nested-title">Payment service provider classes</p>
          <div className="check-list">{chips("pspClasses", PSP_CLASSES)}</div>
          <div className="field-row" id="emi-band-wrap" style={{ display: emi ? "grid" : "none" }}>
            <div className="field">
              <label htmlFor="emi-band">Electronic-money regulatory band</label>
              <select id="emi-band" value={p.emiBand} onChange={(e) => setProfile((pr) => ({ ...pr, emiBand: e.target.value }))}>
                <option value="">Select current trust/special-account value band…</option>
                <option value="large">Large — over UGX 100bn</option>
                <option value="medium1">Medium — over UGX 50bn to 100bn</option>
                <option value="medium2">Medium — over UGX 5bn to 50bn</option>
                <option value="medium3">Medium — over UGX 500m to 5bn</option>
                <option value="small1">Small — over UGX 250m to 500m</option>
                <option value="small2">Small — up to UGX 250m</option>
              </select>
            </div>
          </div>
        </div>

        <div className={`nested${p.categories.instrument ? " visible" : ""}`} id="instrument-options">
          <p className="nested-title">Payment instrument classes</p>
          <div className="check-list">{chips("instrumentClasses", INSTRUMENT_CLASSES)}</div>
        </div>

        <div className="setup-section" style={{ marginTop: 24 }}>
          <h3>Licence details</h3>
          <p>These details help Beacon distinguish historical obligations from future monitoring.</p>
          <div className="field-row">
            <div className="field">
              <label htmlFor="licence-date">Licence effective date</label>
              <input
                type="date"
                id="licence-date"
                value={p.licenceDate}
                onChange={(e) => setProfile((pr) => ({ ...pr, licenceDate: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="licence-conditions">Licence conditions</label>
              <select
                id="licence-conditions"
                value={p.licenceConditions}
                onChange={(e) => setProfile((pr) => ({ ...pr, licenceConditions: e.target.value as "none" | "yes" }))}
              >
                <option value="none">No separate conditions to add now</option>
                <option value="yes">I have licence-specific conditions to track</option>
              </select>
            </div>
          </div>
        </div>

        <div className="setup-actions">
          <button type="button" className="link-btn" id="use-demo-profile" onClick={() => setProfile(() => SAMPLE_PROFILE())}>
            Use sample PSP + EMI profile
          </button>
          <button
            type="button"
            className="btn primary"
            id="to-operating"
            disabled={!licenceComplete(p)}
            onClick={() => {
              // Same normalisation the design applies when the operating screen renders.
              ctx.update((s) =>
                isEmi(s.profile) ? s : { ...s, profile: { ...s.profile, fiMdi: false, safeguard: null } },
              );
              ctx.setScreen("operating");
            }}
          >
            Continue →
          </button>
        </div>
      </main>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2: operating profile
// ---------------------------------------------------------------------------

type BinaryKey = "fiMdi" | "safeguard" | "agents" | "cards" | "participant";

export function SetupOperating({ ctx }: { ctx: PcCtx }) {
  const p = ctx.state.profile;
  const emi = isEmi(p);
  const [safeguardAlert, setSafeguardAlert] = useState("");

  const pick = (key: BinaryKey, val: string) => {
    if (key === "safeguard" && p.fiMdi === true && val !== "special") {
      setSafeguardAlert(
        "For an EMI that is also an FI/MDI, Beacon uses the special-account route. Change the institution-type answer if that is not correct.",
      );
      return;
    }
    if (key === "safeguard" && p.fiMdi === false && val !== "trust") {
      setSafeguardAlert(
        "For a non-bank EMI, Beacon uses the approved trust-account route. Change the institution-type answer if that is not correct.",
      );
      return;
    }
    setSafeguardAlert("");
    ctx.update((s) => {
      const pr: Profile = { ...s.profile };
      const v = val === "yes" ? true : val === "no" ? false : val;
      (pr as unknown as Record<string, unknown>)[key] = v;
      if (key === "fiMdi" && pr.fiMdi === true) pr.safeguard = "special";
      if (key === "fiMdi" && pr.fiMdi === false && isEmi(pr)) pr.safeguard = "trust";
      return { ...s, profile: pr };
    });
  };

  const group = (key: BinaryKey, buttons: [string, string][]) => (
    <div className="binary" data-binary={key} role="group">
      {buttons.map(([val, label]) => {
        const current = (p as unknown as Record<string, unknown>)[key];
        const selected = (val === "yes" && current === true) || (val === "no" && current === false) || current === val;
        return (
          <button type="button" key={val} data-val={val} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => pick(key, val)}>
            {label}
          </button>
        );
      })}
    </div>
  );
  const yesNo: [string, string][] = [
    ["yes", "Yes"],
    ["no", "No"],
  ];

  return (
    <section className="screen active" id="screen-setup-operating">
      <header className="masthead">
        <Brand name="Payments Compliance Assistant" sub="Set up your compliance profile" />
        <div className="masthead-actions">
          <button type="button" className="link-btn" onClick={() => ctx.setScreen("licence")}>
            ← Back
          </button>
        </div>
      </header>
      <main className="setup-shell">
        <div className="stepper">
          <div className="step-dot">✓</div>
          <div className="step-line"></div>
          <div className="step-dot active">2</div>
          <div className="step-line"></div>
          <div className="step-dot">3</div>
        </div>
        <p className="eyebrow">Operating profile</p>
        <h1 className="setup-title">Tell Beacon how you operate.</h1>
        <p className="setup-note">We only ask facts that change your compliance obligations or how Beacon should manage them.</p>

        {emi && (
          <div className="setup-section conditional-emi">
            <h3>Are you also a financial institution or microfinance deposit-taking institution?</h3>
            <p>
              This changes the safeguarding-account structure and determines whether the separate 2024 cyber-and-technology
              overlay is relevant.
            </p>
            {group("fiMdi", yesNo)}
          </div>
        )}
        {emi && (
          <div className="setup-section conditional-emi">
            <h3>How are electronic-money customer funds safeguarded?</h3>
            <p>Non-bank EMI arrangements ordinarily use an approved trust structure; FI/MDI issuers use a special account.</p>
            {group("safeguard", [
              ["trust", "Trust account"],
              ["special", "Special account"],
            ])}
            {safeguardAlert && (
              <div className="inline-alert" role="alert">
                {safeguardAlert}
              </div>
            )}
          </div>
        )}
        <div className="setup-section">
          <h3>Do you use agents to provide payment services?</h3>
          {group("agents", yesNo)}
        </div>
        <div className="setup-section">
          <h3>Do you issue stored-value or prepaid cards?</h3>
          {group("cards", yesNo)}
        </div>
        <div className="setup-section">
          <h3>Are you a participant in another payment system or settlement arrangement?</h3>
          <p>This activates participant and settlement obligations that do not apply to every licensee.</p>
          {group("participant", yesNo)}
        </div>

        <div className="setup-actions">
          <span className="setup-helper">
            You can change these facts later. Beacon will preview the impact before changing your obligations.
          </span>
          <button
            type="button"
            className="btn primary"
            id="to-baseline"
            disabled={!operatingDone(p)}
            onClick={() => {
              // The baseline items are dated from the day the workspace is generated.
              if (!ctx.state.profileSet) ctx.update((s) => ({ ...s, anchorDate: ctx.clock.todayISO }));
              ctx.setScreen("baseline");
            }}
          >
            Continue →
          </button>
        </div>
      </main>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3: baseline status
// ---------------------------------------------------------------------------

export function SetupBaseline({ ctx }: { ctx: PcCtx }) {
  const { state } = ctx;
  const anchor = state.anchorDate || ctx.clock.todayISO;
  const items = baselineItems(state.profile, anchor);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  const setBaseline = (key: string, v: BaselineValue) => ctx.update((s) => ({ ...s, baseline: { ...s.baseline, [key]: v } }));

  const attach = async (key: string, id: string, file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusyKey(key);
    const res = await ctx.adapter.uploadEvidence(file);
    setBusyKey("");
    if (!res.ok) {
      setError(`Could not upload ${file.name}: ${res.error}`);
      return;
    }
    ctx.update((s) => ({
      ...s,
      evidence: [
        ...s.evidence.filter((x) => x.taskKey !== key),
        {
          uid: Date.now(),
          name: file.name,
          type: "Historical completion evidence",
          obligationId: id,
          taskKey: key,
          added: ctx.clock.todayISO,
          file: res.file,
        },
      ],
    }));
  };

  return (
    <section className="screen active" id="screen-setup-baseline">
      <header className="masthead">
        <Brand name="Payments Compliance Assistant" sub="Bring Beacon up to date" />
        <div className="masthead-actions">
          <button type="button" className="link-btn" onClick={() => ctx.setScreen("operating")}>
            ← Back
          </button>
        </div>
      </header>
      <main className="setup-shell">
        <div className="stepper">
          <div className="step-dot">✓</div>
          <div className="step-line"></div>
          <div className="step-dot">✓</div>
          <div className="step-line"></div>
          <div className="step-dot active">3</div>
        </div>
        <p className="eyebrow">Baseline status</p>
        <h1 className="setup-title">What had already happened before Beacon?</h1>
        <p className="setup-note">
          We will not label earlier obligations overdue until you confirm they are still outstanding. If you are not
          sure, leave them as <strong>Not sure</strong> and resolve them from Home later. This is a starting
          reconciliation of key recent obligations, not a full historical audit.
        </p>
        <div className="baseline-list" id="baseline-list">
          {items.map((x) => {
            const value = state.baseline[x.key] || "unknown";
            const evid = baselineEvidenceFor(state, x.key);
            return (
              <div className="baseline-row" key={x.key}>
                <div>
                  <h4>{BY_ID[x.id].requirement}</h4>
                  <p>
                    {x.period} · Legal due {fmtDate(x.due)}
                  </p>
                  {value === "completed" && (
                    <div className="baseline-evidence-note">
                      {evid.length
                        ? `Evidence recorded: ${evid[0].name}`
                        : "Reported complete — evidence is still needed before Beacon treats it as verified."}
                    </div>
                  )}
                </div>
                <div>
                  <div className="baseline-actions" role="group" aria-label={`Status of ${x.period}`}>
                    {(["completed", "outstanding", "unknown"] as BaselineValue[]).map((v) => (
                      <button
                        type="button"
                        key={v}
                        className={`baseline-btn${value === v ? " selected" : ""}`}
                        data-key={x.key}
                        data-val={v}
                        aria-pressed={value === v}
                        onClick={() => setBaseline(x.key, v)}
                      >
                        {v === "completed" ? "Completed" : v === "outstanding" ? "Outstanding" : "Not sure"}
                      </button>
                    ))}
                  </div>
                  {value === "completed" && (
                    <div style={{ marginTop: 8 }}>
                      <label className="baseline-upload">
                        {busyKey === x.key ? "Uploading…" : evid.length ? "Replace evidence" : "Attach evidence"}
                        <input
                          type="file"
                          className="sr-only"
                          data-baseline-file={x.key}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            void attach(x.key, x.id, f);
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && (
          <div className="inline-alert" role="alert">
            {error}
          </div>
        )}
        <div className="setup-actions">
          <button type="button" className="link-btn" id="baseline-demo" onClick={() => ctx.update((s) => ({ ...s, baseline: { ...s.baseline, ...sampleHistoryFor(items) } }))}>
            Use sample history
          </button>
          <button
            type="button"
            className="btn primary"
            id="generate-workspace"
            onClick={() => {
              ctx.update((s) => ({ ...s, profileSet: true, anchorDate: s.anchorDate || ctx.clock.todayISO }));
              ctx.setScreen("app");
            }}
          >
            Generate my compliance workspace →
          </button>
        </div>
      </main>
    </section>
  );
}
