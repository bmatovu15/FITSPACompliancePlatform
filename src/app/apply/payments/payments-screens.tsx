"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cx, PaymentsMasthead } from "./pw-ui";
import {
  ACTIVITY_OPTIONS,
  COST_HELP,
  EMI_TIER_OPTIONS,
  FUNDS_TRANSFER_TIER_OPTIONS,
  LICENCE_GROUPS,
  classificationDetail,
  classificationLabel,
  classificationValid,
  cleanThresholdLabel,
  fmtUGX,
  formatBookingDate,
  instrumentBlocker,
  resultFeeClassLabel,
  selectedDefs,
  visibleDetailQuestions,
  type ActivityDef,
  type ActivityKey,
  type Classification,
  type FactAnswers,
  type Pricing,
  type Routes,
} from "./payments-model";

// ---------------------------------------------------------------------------
// screen-landing
// ---------------------------------------------------------------------------
export function LandingScreen({ canResume, onStart, onResume }: { canResume: boolean; onStart: () => void; onResume: () => void }) {
  const router = useRouter();
  return (
    <div>
      <PaymentsMasthead
        subtitle="FITSPA Compliance Platform · Get licensed"
        logoHome
        right={
          <button className={cx("link-btn")} type="button" onClick={() => router.push("/apply")}>
            ← Applications
          </button>
        }
      />
      <div className={cx("landing-wrap")}>
        <section className={cx("landing-hero")}>
          <h1 className={cx("hero-title")}>Know what you need for your licence application.</h1>
          <p className={cx("hero-dek")}>Tell us what your business plans to do, and we&apos;ll show you the licence requirements that apply.</p>
          <div className={cx("cta-row")}>
            <button className={cx("btn-primary")} type="button" onClick={onStart}>
              Start the assessment →
            </button>
            {canResume && (
              <button className={cx("btn-secondary")} type="button" onClick={onResume}>
                Resume my checklist
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// screen-wizard
// ---------------------------------------------------------------------------
export function WizardScreen({
  c,
  onToggle,
  onFundsTier,
  onEmiTier,
  onBack,
  onUnlisted,
  onSee,
}: {
  c: Classification;
  onToggle: (key: ActivityKey) => void;
  onFundsTier: (v: string) => void;
  onEmiTier: (v: string) => void;
  onBack: () => void;
  onUnlisted: () => void;
  onSee: () => void;
}) {
  const [openInfo, setOpenInfo] = useState<ActivityKey | null>(null);

  useEffect(() => {
    function close(ev: MouseEvent) {
      if (!(ev.target as HTMLElement).closest("[data-info-wrap]")) setOpenInfo(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <div>
      <PaymentsMasthead
        subtitle="Define your application"
        right={
          <button className={cx("link-btn")} type="button" onClick={onBack}>
            ← Back
          </button>
        }
      />
      <div className={cx("wizard-wrap")}>
        <h2 className={cx("wizard-title")}>What does your business do?</h2>
        <p className={cx("wizard-note")}>Select all that apply.</p>

        <div className={cx("wizard-options class-grid")}>
          {ACTIVITY_OPTIONS.map((def) => (
            <ClassCard
              key={def.key}
              def={def}
              checked={!!c.classes[def.key]}
              open={openInfo === def.key}
              onToggle={() => onToggle(def.key)}
              onInfo={() => setOpenInfo((cur) => (cur === def.key ? null : def.key))}
            />
          ))}
        </div>

        <div className={cx("unlisted-row")}>
          <button className={cx("unlisted-card")} type="button" onClick={onUnlisted}>
            <div>
              <h4>My activity isn’t listed / I’m not sure</h4>
              <p>Get help identifying the right pathway.</p>
            </div>
            <span className={cx("unlisted-arrow")} aria-hidden="true">
              →
            </span>
          </button>
        </div>

        <div>
          {c.classes.funds_transfer && (
            <div className={cx("sub-question classification-question")}>
              <h5>What monthly transaction value do you expect for your Funds Transfer System?</h5>
              <p>We’ll use this to determine the applicable Funds Transfer System classification.</p>
              <div className={cx("sq-row")}>
                <select value={c.fundsTier} onChange={(e) => onFundsTier(e.target.value)} aria-label="Monthly transaction value">
                  {FUNDS_TRANSFER_TIER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {c.classes.emi && (
            <div className={cx("sub-question classification-question")}>
              <h5>What total value do you expect to hold in your trust account?</h5>
              <p>We’ll use this to determine the applicable Electronic Money Issuer classification and value band.</p>
              <div className={cx("sq-row")}>
                <select value={c.emiTier} onChange={(e) => onEmiTier(e.target.value)} aria-label="Trust account value">
                  {EMI_TIER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className={cx("wizard-actions")}>
          <button className={cx("btn-primary")} type="button" disabled={!classificationValid(c)} onClick={onSee}>
            See my licence →
          </button>
        </div>
      </div>
    </div>
  );
}

function ClassCard({
  def,
  checked,
  open,
  onToggle,
  onInfo,
}: {
  def: ActivityDef;
  checked: boolean;
  open: boolean;
  onToggle: () => void;
  onInfo: () => void;
}) {
  return (
    <div
      className={cx("class-card") + (checked ? " " + cx("checked") : "")}
      data-class-key={def.key}
      onClick={(ev) => {
        const t = ev.target as HTMLElement;
        if (t.closest("[data-info-wrap]") || t.tagName === "INPUT") return;
        onToggle();
      }}
    >
      <input type="checkbox" aria-label={def.title} checked={checked} onChange={onToggle} />
      <div className={cx("class-card-copy")}>
        <h4>{def.title}</h4>
        <p className={cx("class-activity")}>{def.activity}</p>
      </div>
      <div className={cx("info-wrap") + (open ? " " + cx("open") : "")} data-info-wrap>
        <button
          className={cx("info-btn")}
          type="button"
          aria-label={"About " + def.title}
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            onInfo();
          }}
        >
          i
        </button>
        <div className={cx("info-popover")}>
          <strong>{def.title}</strong>
          {def.info}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// screen-unlisted
// ---------------------------------------------------------------------------
export function UnlistedScreen({ onBack, onExpert, onSandbox }: { onBack: () => void; onExpert: () => void; onSandbox: () => void }) {
  return (
    <div>
      <PaymentsMasthead
        subtitle="Find the right pathway"
        right={
          <button className={cx("link-btn")} type="button" onClick={onBack}>
            ← Back to assessment
          </button>
        }
      />
      <div className={cx("pathway-wrap")}>
        <h2 className={cx("wizard-title")}>What would you like help with?</h2>
        <p className={cx("wizard-note")}>Choose the option that best describes why your activity isn’t listed.</p>
        <div className={cx("pathway-options")}>
          <button className={cx("pathway-card")} type="button" onClick={onExpert}>
            <div>
              <h3>I’m not sure which option applies</h3>
              <p>My business may fit one of the listed licence classes, but I need help identifying the right one.</p>
            </div>
            <span className={cx("pathway-arrow")}>→</span>
          </button>
          <button className={cx("pathway-card")} type="button" onClick={onSandbox}>
            <div>
              <h3>None of these activities describe my product</h3>
              <p>My product or service appears different from the listed licence classes.</p>
            </div>
            <span className={cx("pathway-arrow")}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// screen-expert (real send to /api/expert-support)
// ---------------------------------------------------------------------------
function localDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function ExpertScreen({ onBack, onReturn }: { onBack: () => void; onReturn: () => void }) {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [product, setProduct] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ date: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const minDate = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return localDateString(t);
  }, []);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/expert-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceModule: "apply",
          contextKey: "payments-expert-booking",
          applicationKey: "payments_nps",
          requestType: "consultation_booking",
          contactName: name.trim(),
          contactEmail: email.trim(),
          contactPhone: phone.trim(),
          businessName: business.trim(),
          preferredDate: date,
          preferredTime: time,
          message: product.trim(),
        }),
      });
      if (!res.ok) throw new Error("request failed");
      setSent({ date, time });
      window.scrollTo(0, 0);
    } catch {
      setError("We couldn't send that request. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const when = sent && sent.date && sent.time ? " for " + formatBookingDate(sent.date) + " at " + sent.time : "";

  return (
    <div>
      <PaymentsMasthead
        subtitle="Expert support"
        right={
          <button className={cx("link-btn")} type="button" onClick={onBack}>
            ← Back
          </button>
        }
      />
      <div className={cx("booking-wrap")}>
        <p className={cx("result-eyebrow")}>Licence classification support</p>
        <h2 className={cx("result-title")}>Speak to an expert</h2>
        <p className={cx("result-note")}>
          If you’re unsure which licence class applies to your business, request a short session to review your product and regulatory pathway.
        </p>

        {!sent && (
          <form className={cx("booking-form")} onSubmit={submit}>
            <div className={cx("booking-grid")}>
              <label className={cx("field-label")}>
                Full name
                <input className={cx("field-input")} type="text" required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className={cx("field-label")}>
                Business / company
                <input className={cx("field-input")} type="text" required value={business} onChange={(e) => setBusiness(e.target.value)} />
              </label>
              <label className={cx("field-label")}>
                Email
                <input className={cx("field-input")} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className={cx("field-label")}>
                Phone number
                <input className={cx("field-input")} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className={cx("field-label")}>
                Preferred date
                <input className={cx("field-input")} type="date" required min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className={cx("field-label")}>
                Preferred time
                <select className={cx("field-input")} required value={time} onChange={(e) => setTime(e.target.value)}>
                  <option value="">Select a time…</option>
                  <option>9:00 AM</option>
                  <option>11:00 AM</option>
                  <option>2:00 PM</option>
                  <option>4:00 PM</option>
                </select>
              </label>
            </div>
            <label className={cx("field-label field-full")}>
              Briefly describe what your product does
              <textarea
                className={cx("field-input field-textarea")}
                required
                placeholder="What does the product do, who uses it, and how does money move?"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              />
            </label>
            {error && <div className={cx("pw-error")} style={{ margin: "16px 0 0" }}>{error}</div>}
            <div className={cx("booking-actions")}>
              <button className={cx("btn-primary")} type="submit" disabled={sending}>
                Request a session →
              </button>
              <button className={cx("btn-secondary")} type="button" onClick={onReturn}>
                Return to assessment
              </button>
            </div>
          </form>
        )}

        {sent && (
          <div className={cx("booking-success")}>
            <h3>Consultation request captured</h3>
            <p>Your request{when} has been captured. The expert can use your product description to prepare for the classification discussion.</p>
            <button className={cx("btn-primary")} type="button" onClick={onReturn}>
              Return to assessment →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// screen-sandbox
// ---------------------------------------------------------------------------
export function SandboxScreen({ onBack, onExpert }: { onBack: () => void; onExpert: () => void }) {
  const [note, setNote] = useState(false);
  return (
    <div>
      <PaymentsMasthead
        subtitle="Regulatory Sandbox"
        right={
          <button className={cx("link-btn")} type="button" onClick={onBack}>
            ← Back
          </button>
        }
      />
      <div className={cx("sandbox-wrap")}>
        <h2 className={cx("result-title")}>Explore the Regulatory Sandbox</h2>
        <p className={cx("result-note")}>
          If your product does not fit the listed licence classes, the Regulatory Sandbox may be a pathway to explore. It provides a controlled environment for eligible innovative payment products, services, business models or delivery mechanisms to be tested under regulatory oversight.
        </p>
        <div className={cx("sandbox-actions")}>
          <button className={cx("btn-primary")} type="button" onClick={() => setNote(true)}>
            Build my sandbox checklist →
          </button>
          <button className={cx("btn-secondary")} type="button" onClick={onExpert}>
            Speak to an expert
          </button>
        </div>
        {note && <p className={cx("prototype-note sandbox-prototype-note")}>The sandbox checklist is the next module to be built.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// screen-result
// ---------------------------------------------------------------------------
function CostStat({
  label,
  value,
  note,
  help,
  open,
  onToggle,
}: {
  label: string;
  value: string;
  note: string;
  help: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cx("result-cost-stat")}>
      <div className={cx("rcs-label-row")}>
        <div className={cx("rcs-label")}>{label}</div>
        <span className={cx("cost-info-wrap") + (open ? " " + cx("open") : "")} data-cost-wrap>
          <button
            className={cx("cost-info-btn")}
            type="button"
            aria-label={"About " + label}
            onClick={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              onToggle();
            }}
          >
            i
          </button>
          <span className={cx("cost-info-popover")}>{help}</span>
        </span>
      </div>
      <div className={cx("rcs-value")}>{value}</div>
      <div className={cx("rcs-note")}>{note}</div>
    </div>
  );
}

export function ResultScreen({
  c,
  pricing,
  hasPathway,
  onChange,
  onBuild,
}: {
  c: Classification;
  pricing: Pricing;
  hasPathway: boolean;
  onChange: () => void;
  onBuild: () => void;
}) {
  void hasPathway;
  const [openCost, setOpenCost] = useState<string | null>(null);
  useEffect(() => {
    function close(ev: MouseEvent) {
      if (!(ev.target as HTMLElement).closest("[data-cost-wrap]")) setOpenCost(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const selected = selectedDefs(c);
  const activeGroups = LICENCE_GROUPS.filter((g) => selected.some((x) => x.category === g.key));
  const showNumbers = activeGroups.length > 1;
  const toggle = (k: string) => setOpenCost((cur) => (cur === k ? null : k));

  return (
    <div>
      <PaymentsMasthead
        subtitle="Your licence"
        right={
          <button className={cx("link-btn")} type="button" onClick={onChange}>
            ← Change selections
          </button>
        }
      />
      <div className={cx("result-wrap")}>
        <p className={cx("result-eyebrow")}>Based on your selections</p>
        <h2 className={cx("result-title")}>Your licence application</h2>
        <p className={cx("result-note")}>These are the licence categories and classes that apply to the activities you selected.</p>
        <div>
          {activeGroups.map((group, index) => {
            const defs = selected.filter((x) => x.category === group.key);
            return (
              <section className={cx("licence-group")} key={group.key}>
                <div className={cx("licence-group-head")}>
                  {showNumbers && <div className={cx("licence-group-number")}>Licence {index + 1}</div>}
                  <h3>{group.title}</h3>
                </div>
                <div className={cx("licence-classes-summary")}>
                  <div className={cx("licence-classes-label")}>{defs.length > 1 ? "Classes:" : "Class:"}</div>
                  <div className={cx("licence-classes-value")}>
                    {defs.map((def, i) => {
                      const name = classificationLabel(c, def.key) || def.title;
                      const detail = classificationDetail(c, def.key);
                      return (
                        <span key={def.key}>
                          {i > 0 && <span className={cx("class-sep")}>·</span>}
                          <span>{name}</span>
                          {detail && (def.key === "funds_transfer" || def.key === "emi") && (
                            <>
                              {" "}
                              <span className={cx("licence-class-detail")}>({detail})</span>
                            </>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
          {pricing.rows.length > 0 && (
            <section className={cx("result-costs")}>
              <h3 className={cx("result-costs-title")}>Fees and minimum capital</h3>
              <p className={cx("result-costs-note")}>Based on the licence classes and applicable classifications or value bands you selected.</p>
              <div className={cx("result-cost-grid")}>
                <CostStat label="Application fee" value={fmtUGX(pricing.applicationFee)} note="Non-refundable" help={COST_HELP.application} open={openCost === "a"} onToggle={() => toggle("a")} />
                <CostStat label="Licence fee" value={fmtUGX(pricing.licensingFee)} note="Payable if licence is granted" help={COST_HELP.licence} open={openCost === "l"} onToggle={() => toggle("l")} />
                <CostStat label="Annual fee" value={fmtUGX(pricing.annualFee)} note="Recurring licence cost" help={COST_HELP.annual} open={openCost === "n"} onToggle={() => toggle("n")} />
                <CostStat label="Minimum capital" value={fmtUGX(pricing.minCapital)} note="Highest applicable threshold" help={COST_HELP.capital} open={openCost === "c"} onToggle={() => toggle("c")} />
              </div>
              {pricing.rows.length > 1 && (
                <div className={cx("result-cost-breakdown")}>
                  <div className={cx("result-cost-row head")}>
                    <div>Class</div>
                    <div>Application</div>
                    <div>Licence</div>
                    <div>Annual</div>
                    <div>Minimum capital</div>
                  </div>
                  {pricing.rows.map((r) => (
                    <div className={cx("result-cost-row")} key={r.classKey}>
                      <div className={cx("result-cost-class")}>
                        <strong>{resultFeeClassLabel(c, r)}</strong>
                      </div>
                      <div>{fmtUGX(r.application_fee)}</div>
                      <div>{fmtUGX(r.licensing_fee)}</div>
                      <div>{fmtUGX(r.annual_fee)}</div>
                      <div>{fmtUGX(r.min_capital)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
        <div className={cx("result-actions")}>
          <button className={cx("btn-primary")} type="button" onClick={onBuild}>
            Build my checklist →
          </button>
          <button className={cx("btn-secondary")} type="button" onClick={onChange}>
            Change selections
          </button>
        </div>
      </div>
    </div>
  );
}

// cleanThresholdLabel is re-exported for the fee breakdown helpers' tests.
export { cleanThresholdLabel };

// ---------------------------------------------------------------------------
// screen-details
// ---------------------------------------------------------------------------
export function DetailsScreen({
  routes,
  draft,
  fromApp,
  pathwaySet,
  onChoice,
  onBack,
  onGenerate,
  onExpert,
}: {
  routes: Routes;
  draft: FactAnswers;
  fromApp: boolean;
  pathwaySet: boolean;
  onChoice: (key: keyof FactAnswers, value: boolean) => void;
  onBack: () => void;
  onGenerate: () => void;
  onExpert: () => void;
}) {
  const qs = visibleDetailQuestions(routes, draft);
  const unresolved = qs.filter((q) => draft[q.key] === null).length;
  const blocker = instrumentBlocker(routes, draft);
  return (
    <div>
      <PaymentsMasthead
        subtitle="Application details"
        right={
          <button className={cx("link-btn")} type="button" onClick={onBack}>
            {fromApp ? "← Application" : "← Licence result"}
          </button>
        }
      />
      <div className={cx("application-details-wrap")}>
        <p className={cx("result-eyebrow")}>Before we build your checklist</p>
        <h2 className={cx("application-details-title")}>Tell us a few things about your application.</h2>
        <p className={cx("application-details-note")}>Your answers determine which requirements appear in your checklist.</p>

        <div className={cx("application-details-list")}>
          {qs.map((q) => {
            const val = draft[q.key];
            return (
              <div className={cx("application-detail-row")} key={q.key}>
                <p className={cx("application-detail-question")}>{q.q}</p>
                <div className={cx("application-detail-actions")}>
                  <button
                    className={cx("application-detail-choice") + (val === true ? " " + cx("selected") : "")}
                    type="button"
                    onClick={() => onChoice(q.key, true)}
                  >
                    Yes
                  </button>
                  <button
                    className={cx("application-detail-choice") + (val === false ? " " + cx("selected") : "")}
                    type="button"
                    onClick={() => onChoice(q.key, false)}
                  >
                    No
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          {blocker && (
            <div className={cx("application-details-alert")}>
              <strong>This payment-instrument route needs confirmation.</strong>
              The standard Form C route should not be assumed for a financial institution or microfinance deposit-taking institution. Speak to an expert before FITSPA Compliance Platform generates a standard checklist.
              <br />
              <button className={cx("work-btn subtle")} type="button" onClick={onExpert}>
                Speak to an expert
              </button>
            </div>
          )}
        </div>
        <div className={cx("application-details-actions")}>
          <button className={cx("btn-primary")} type="button" disabled={unresolved > 0 || blocker} onClick={onGenerate}>
            {pathwaySet ? "Update my checklist →" : "Generate my checklist →"}
          </button>
        </div>
      </div>
    </div>
  );
}
