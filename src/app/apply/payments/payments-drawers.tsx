"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, type ChangeEvent, type ReactNode } from "react";
import { cx } from "./pw-ui";
import {
  COMPANY_DOC_SLOTS,
  IT_CONTROLS,
  SOURCE_OF_FUNDS_OPTIONS,
  cardTitle,
  customerTermsRequired,
  directShareholders,
  fileCount,
  fileMeta,
  fmtUGX,
  getPeople,
  newRowId,
  productConfig,
  productType,
  type Ctx,
  type FactAnswers,
  type Template,
} from "./payments-model";

const DEFAULT_ACCEPT = ".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.rtf,.txt,.png,.jpg,.jpeg";
const DEFAULT_FORM_URL = "https://drive.google.com/file/d/1ig6A2a8Cvfmm2Qgr7cVgxBmSzgh7Bp_b/view?usp=drivesdk";

export type EditorApi = {
  t: Template;
  ctx: Ctx;
  data: any;
  // Persist this item's answers (and optionally facts) and recompute status.
  save: (next: any, factsPatch?: Partial<FactAnswers>) => Promise<void>;
  setFact: (patch: Partial<FactAnswers>) => Promise<void>;
  upload: (slot: string, label: string, file: File) => Promise<void>;
};

// The eyebrow above the drawer title, per editor type (as in the design).
export function editorEyebrow(t: Template, ctx: Ctx): string {
  const type = productType(t);
  const hasPeople = getPeople(ctx, productConfig(t).person_filter).length > 0;
  switch (type) {
    case "entity":
      return "Applicant";
    case "company_docs":
      return "Document pack";
    case "upload":
      return "Requirement";
    case "repeat_docs":
      return "Shareholder documents";
    case "premises":
      return "Readiness";
    case "emi_structure":
      return "EMI structure";
    case "official_form":
      return "Form";
    case "person_form":
      return hasPeople ? "Form B" : "Form";
    case "person_upload":
      return "Person evidence";
    case "person_credit":
      return getPeople(ctx).length ? "Credit-reference evidence" : "Person evidence";
    case "ownership":
      return "Ownership editor";
    case "people":
      return "People editor";
    case "source_funds":
      return "Source of funds";
    case "product_desc":
      return "Document";
    case "docpack":
    case "multi_upload":
      return "Documents";
    case "financials":
      return "Financial statements";
    case "capital":
      return "Capital";
    case "tin_tax":
      return "Tax details";
    case "it_controls":
      return "IT controls";
    case "pentest":
      return "Security testing";
    case "outsourcing":
      return "Outsourcing arrangement";
    case "payment_systems":
      return "Payment-system participation";
    case "foreign_licences":
      return "Foreign licence";
    case "customer_terms":
      return "Customer terms";
    case "pricing":
      return "Pricing";
    case "fee_proof":
      return "Application fee";
    case "data_centre":
      return "Data-centre readiness";
    case "embedded":
      return "Guidance";
    default:
      return "Requirement";
  }
}

// ---------------------------------------------------------------------------
// small building blocks that mirror the design's markup
// ---------------------------------------------------------------------------

function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  return [
    on,
    () => {
      setOn(true);
      setTimeout(() => setOn(false), 2500);
    },
  ];
}

function SaveButton({ label, onClick, flash }: { label: string; onClick: () => void; flash?: boolean }) {
  return (
    <>
      <button className={cx("drawer-save")} type="button" onClick={onClick}>
        {label}
      </button>
      {flash && <span className={cx("drawer-saved")}>Saved</span>}
    </>
  );
}

function UploadRow({ api, slot, label, accept }: { api: EditorApi; slot: string; label: string; accept?: string }) {
  const meta = fileMeta(api.ctx, api.t.external_id, slot);
  const [busy, setBusy] = useState(false);
  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      await api.upload(slot, label, f);
    } finally {
      setBusy(false);
      input.value = "";
    }
  }
  return (
    <div className={cx("upload-row")}>
      <div className={cx("upload-row-top")}>
        <div>
          <div className={cx("upload-label")}>{label}</div>
          <span className={cx("upload-meta")}>{busy ? "Uploading…" : meta ? meta.name + " · v" + meta.version : "Not uploaded"}</span>
        </div>
        <input className={cx("file-input")} type="file" accept={accept || DEFAULT_ACCEPT} onChange={onChange} disabled={busy} />
      </div>
    </div>
  );
}

function MultiInput({ api, accept, onDone }: { api: EditorApi; accept: string; onDone?: (n: number) => void }) {
  const [busy, setBusy] = useState(false);
  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;
    setBusy(true);
    try {
      const stamp = Date.now();
      for (let i = 0; i < files.length; i++) {
        await api.upload("file::" + stamp + "::" + i, files[i].name, files[i]);
      }
      onDone?.(files.length);
    } finally {
      setBusy(false);
      input.value = "";
    }
  }
  return <input className={cx("file-input")} type="file" multiple accept={accept} onChange={onChange} disabled={busy} />;
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className={cx("editor-section")}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={cx("ws-field")}>
      {label}
      {children}
    </label>
  );
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={cx("check-row")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// guidance drawer
// ---------------------------------------------------------------------------
export function GuidanceBody({ t }: { t: Template }) {
  const sources = t.sources ?? [];
  const form = t.official_form;
  const withUrl = sources.filter((s) => !!s.url);
  const unique: { text: string; url: string }[] = [];
  const seen: Record<string, boolean> = {};
  withUrl.forEach((s) => {
    if (!seen[s.url]) {
      seen[s.url] = true;
      unique.push(s);
    }
  });
  return (
    <>
      {sources.map((s, i) => (
        <p className={cx("source-line")} key={i}>
          {s.text}
        </p>
      ))}
      <p className={cx("guidance-copy")}>{t.guidance_long ?? t.guide_what ?? ""}</p>
      <div className={cx("guidance-deliverable")}>
        <strong>What you need to provide</strong>
        <p>{t.deliverable ?? t.guide_evidence ?? ""}</p>
      </div>
      {form?.url && (
        <a className={cx("form-link")} href={form.url} target="_blank" rel="noopener noreferrer">
          {form.label.replace(/\s*↗\s*$/, "")} ↗
        </a>
      )}
      {unique.length === 1 && (
        <a className={cx("form-link")} href={unique[0].url} target="_blank" rel="noopener noreferrer">
          View source ↗
        </a>
      )}
      {unique.length > 1 && (
        <details className={cx("source-details")}>
          <summary>View sources ↗</summary>
          <div className={cx("source-links")}>
            {unique.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                {s.text} ↗
              </a>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// editors
// ---------------------------------------------------------------------------

function EntityEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [name, setName] = useState<string>(d.legalName || "");
  const [type, setType] = useState<string>(d.entityType || "");
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <div className={cx("field-grid")}>
        <Field label="Applicant legal name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Entity type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Select…</option>
            <option value="uganda_company">Uganda-incorporated company</option>
            <option value="eligible_institution">Other eligible Ugandan institution</option>
            <option value="foreign_branch">Foreign company operating as a branch</option>
            <option value="other_ineligible">Other / uncertain</option>
          </select>
        </Field>
      </div>
      {(type === "foreign_branch" || type === "other_ineligible") && (
        <div className={cx("mini-alert")}>This entity type needs to be resolved before the licence application can proceed.</div>
      )}
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save details"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, legalName: name.trim(), entityType: type });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function CompanyDocsEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [objects, setObjects] = useState(!!d.objectsChecked);
  const [articles, setArticles] = useState(!!d.articlesChecked);
  const [flash, doFlash] = useFlash();
  return (
    <>
      <Section title="Company documents">
        {COMPANY_DOC_SLOTS.map((s) => (
          <UploadRow key={s[0]} api={api} slot={s[0]} label={s[1]} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
        ))}
      </Section>
      <Section title="Checks within these documents">
        <CheckRow checked={objects} onChange={setObjects}>
          The Memorandum objects cover the regulated activities selected in this application.
        </CheckRow>
        <CheckRow checked={articles} onChange={setArticles}>
          The Articles reflect the applicable approval restriction for relevant shareholding changes.
        </CheckRow>
        <div className={cx("drawer-actions")}>
          <SaveButton
            label="Save checks"
            flash={flash}
            onClick={async () => {
              await api.save({ ...d, objectsChecked: objects, articlesChecked: articles });
              doFlash();
            }}
          />
        </div>
      </Section>
    </>
  );
}

function UploadEditor({ api }: { api: EditorApi }) {
  const label = api.t.deliverable || cardTitle(api.t);
  return (
    <Section title={label}>
      <p className={cx("editor-note")}>Editable documents such as DOC/DOCX are accepted where relevant. PDF can be used for the final submission version.</p>
      <UploadRow api={api} slot="main" label={label} accept={productConfig(api.t).accept} />
    </Section>
  );
}

function RepeatDocsEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [rows, setRows] = useState<{ id: string; name: string }[]>(d.rows ?? []);
  const [flash, doFlash] = useFlash();
  const commit = (next: { id: string; name: string }[]) => api.save({ ...d, rows: next.map((r) => ({ ...r, name: r.name.trim() })) });
  return (
    <Section>
      {rows.length ? (
        rows.map((r, i) => (
          <div className={cx("repeat-row")} key={r.id}>
            <div className={cx("repeat-row-head")}>
              <strong>Foreign corporate shareholder {i + 1}</strong>
              <button
                className={cx("remove-btn")}
                type="button"
                onClick={() => {
                  const next = rows.filter((x) => x.id !== r.id);
                  setRows(next);
                  void commit(next);
                }}
              >
                Remove
              </button>
            </div>
            <Field label="Company name">
              <input value={r.name} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} />
            </Field>
            <UploadRow api={api} slot={"row::" + r.id} label="Notarised incorporation documents" accept=".pdf,.png,.jpg,.jpeg" />
          </div>
        ))
      ) : (
        <div className={cx("drawer-empty")}>No foreign corporate shareholder added yet.</div>
      )}
      <div className={cx("drawer-actions")}>
        <button
          className={cx("drawer-secondary")}
          type="button"
          onClick={() => {
            const next = [...rows, { id: newRowId("sh"), name: "" }];
            setRows(next);
            void commit(next);
          }}
        >
          Add shareholder
        </button>
        <SaveButton
          label="Save details"
          flash={flash}
          onClick={async () => {
            await commit(rows);
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function PremisesEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [address, setAddress] = useState<string>(d.address || "");
  const [note, setNote] = useState<string>(d.note || "");
  const [confirmed, setConfirmed] = useState(!!d.confirmed);
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <div className={cx("field-grid one")}>
        <Field label="Business address">
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Occupancy / premises note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. leased office, own premises" />
        </Field>
      </div>
      <CheckRow checked={confirmed} onChange={setConfirmed}>
        The premises are fixed, identifiable and ready for inspection.
      </CheckRow>
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save details"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, address: address.trim(), note: note.trim(), confirmed });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function EmiStructureEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [structure, setStructure] = useState<string>(d.structure || "");
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <Field label="EMI structure">
        <select
          value={structure}
          onChange={(e) => {
            setStructure(e.target.value);
            void api.save({ ...d, structure: e.target.value });
          }}
        >
          <option value="">Select…</option>
          <option value="applicant_entity">The applicant is the dedicated EMI entity</option>
          <option value="separate_entity">A separate EMI entity has been established</option>
        </select>
      </Field>
      {structure === "separate_entity" && (
        <UploadRow api={api} slot="incorporation" label="EMI entity incorporation evidence" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
      )}
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save structure"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, structure });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function OfficialFormEditor({ api }: { api: EditorApi }) {
  const form = productConfig(api.t).form ?? "";
  const link = api.t.official_form?.url || DEFAULT_FORM_URL;
  return (
    <>
      <Section title={form}>
        <p className={cx("editor-note")}>Download the official form, complete it outside Beacon, commission or sign it where required, then upload the completed copy.</p>
        <a className={cx("form-link")} href={link} target="_blank" rel="noopener noreferrer">
          Open official {form} ↗
        </a>
      </Section>
      <Section title="Completed form">
        <UploadRow api={api} slot="completed" label={"Completed " + form} accept=".pdf,.doc,.docx" />
      </Section>
    </>
  );
}

function PersonUploads({ api, isForm }: { api: EditorApi; isForm: boolean }) {
  const cfg = productConfig(api.t);
  const people = getPeople(api.ctx, cfg.person_filter);
  if (!people.length) {
    return <div className={cx("drawer-empty")}>Add the applicable owners, directors and senior managers first. Beacon will then show the people who need this item.</div>;
  }
  const slots: [string, string][] = isForm ? [["form", "Completed & commissioned Form B"]] : cfg.slots ?? [];
  const link = isForm && api.t.official_form?.url ? api.t.official_form.url : "";
  return (
    <>
      {link && (
        <a className={cx("form-link")} href={link} target="_blank" rel="noopener noreferrer">
          Open official Form B ↗
        </a>
      )}
      {people.map((p) => (
        <div className={cx("person-card")} key={p.key}>
          <h4>{p.name}</h4>
          <div className={cx("person-role")}>{p.roles.join(" · ")}</div>
          {slots.map((s) => (
            <UploadRow key={s[0]} api={api} slot={p.key + "::" + s[0]} label={s[1]} accept={cfg.accept || ".pdf,.doc,.docx,.png,.jpg,.jpeg"} />
          ))}
        </div>
      ))}
    </>
  );
}

function OwnershipEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  type Row = { id: string; parent: string; name: string; type: string; percent: string | number; foreign?: boolean };
  const [rows, setRows] = useState<Row[]>(d.rows ?? []);
  const [flash, doFlash] = useFlash();
  const [uploaded, setUploaded] = useState<number | null>(null);
  const saved: Row[] = d.rows ?? [];
  const total = saved.filter((r) => r.parent === "applicant").reduce((s, r) => s + (parseFloat(String(r.percent)) || 0), 0);
  const fc = fileCount(api.ctx, api.t.external_id);

  const patch = (id: string, p: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const clean = (list: Row[]) => list.map((r) => ({ ...r, name: String(r.name).trim(), foreign: r.type === "company" ? !!r.foreign : false }));
  const persist = async (list: Row[]) => {
    const c = clean(list);
    const foreignDirect = c.some((r) => r.parent === "applicant" && r.type === "company" && r.foreign);
    await api.save({ ...d, rows: c }, c.length ? { foreign_corporate_shareholder: foreignDirect } : undefined);
  };
  const companyOptions = (current: string) => (
    <>
      <option value="applicant">Applicant company</option>
      {rows
        .filter((r) => r.type === "company")
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.name || "Unnamed company"}
          </option>
        ))}
      {current !== "applicant" && !rows.some((r) => r.id === current && r.type === "company") && <option value={current}>{current}</option>}
    </>
  );

  return (
    <>
      <div className={cx("ownership-summary")}>
        Direct ownership accounted for: <strong>{total.toFixed(2)}%</strong> · Supporting documents: <strong>{fc}</strong>
      </div>
      <Section title="Ownership structure">
        {rows.map((r, i) => (
          <div className={cx("repeat-row")} key={r.id}>
            <div className={cx("repeat-row-head")}>
              <strong>Owner {i + 1}</strong>
              <button
                className={cx("remove-btn")}
                type="button"
                onClick={() => {
                  const next = rows.filter((x) => x.id !== r.id && x.parent !== r.id);
                  setRows(next);
                  void persist(next);
                }}
              >
                Remove
              </button>
            </div>
            <div className={cx("field-grid")}>
              <Field label="Owned entity / parent">
                <select value={r.parent || "applicant"} onChange={(e) => patch(r.id, { parent: e.target.value })}>
                  {companyOptions(r.parent || "applicant")}
                </select>
              </Field>
              <Field label="Owner name">
                <input value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} />
              </Field>
              <Field label="Owner type">
                <select value={r.type} onChange={(e) => patch(r.id, { type: e.target.value })}>
                  <option value="individual">Individual</option>
                  <option value="company">Company</option>
                </select>
              </Field>
              <Field label="% ownership">
                <input type="number" min={0} max={100} step={0.01} value={r.percent} onChange={(e) => patch(r.id, { percent: e.target.value })} />
              </Field>
            </div>
            {r.type === "company" && (
              <CheckRow checked={!!r.foreign} onChange={(v) => patch(r.id, { foreign: v })}>
                This is a foreign company.
              </CheckRow>
            )}
          </div>
        ))}
        <div className={cx("drawer-actions")}>
          <button
            className={cx("drawer-secondary")}
            type="button"
            onClick={() => {
              const next = [...rows, { id: newRowId("own"), parent: "applicant", name: "", type: "individual", percent: "", foreign: false }];
              setRows(next);
              void persist(next);
            }}
          >
            Add owner
          </button>
          <SaveButton
            label="Save ownership"
            flash={flash}
            onClick={async () => {
              await persist(rows);
              doFlash();
            }}
          />
        </div>
      </Section>
      <Section title="Supporting shareholding records">
        <MultiInput api={api} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onDone={setUploaded} />
        {(fc > 0 || uploaded) && (
          <p className={cx("upload-meta")}>
            {fc} supporting document{fc === 1 ? "" : "s"} added.
          </p>
        )}
      </Section>
    </>
  );
}

function PeopleEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  type Row = { id: string; name: string; role: string; designation: string; nationality: string; qualification: string; workPermitRequired: boolean };
  const [rows, setRows] = useState<Row[]>(d.rows ?? []);
  const [confirmed, setConfirmed] = useState(!!d.confirmed);
  const [flash, doFlash] = useFlash();
  const patch = (id: string, p: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const persist = async (list: Row[], conf: boolean) => {
    const c = list.map((r) => ({
      ...r,
      name: r.name.trim(),
      designation: r.designation.trim(),
      nationality: r.nationality.trim(),
      qualification: r.qualification.trim(),
      workPermitRequired: !!r.workPermitRequired,
    }));
    await api.save({ ...d, rows: c, confirmed: conf }, conf ? { foreign_resident_management: c.some((r) => r.workPermitRequired) } : undefined);
  };
  return (
    <Section title="Directors & senior management">
      {rows.map((r, i) => (
        <div className={cx("repeat-row")} key={r.id}>
          <div className={cx("repeat-row-head")}>
            <strong>Person {i + 1}</strong>
            <button
              className={cx("remove-btn")}
              type="button"
              onClick={() => {
                const next = rows.filter((x) => x.id !== r.id);
                setRows(next);
                void persist(next, confirmed);
              }}
            >
              Remove
            </button>
          </div>
          <div className={cx("field-grid")}>
            <Field label="Full name">
              <input value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} />
            </Field>
            <Field label="Role">
              <select value={r.role} onChange={(e) => patch(r.id, { role: e.target.value })}>
                <option value="">Select…</option>
                <option value="Director">Director</option>
                <option value="Senior management">Senior management</option>
                <option value="Director & senior management">Director &amp; senior management</option>
              </select>
            </Field>
            <Field label="Designation">
              <input value={r.designation} onChange={(e) => patch(r.id, { designation: e.target.value })} />
            </Field>
            <Field label="Nationality">
              <input value={r.nationality} onChange={(e) => patch(r.id, { nationality: e.target.value })} />
            </Field>
            <Field label="Highest / relevant qualification">
              <input value={r.qualification} onChange={(e) => patch(r.id, { qualification: e.target.value })} />
            </Field>
          </div>
          <CheckRow checked={!!r.workPermitRequired} onChange={(v) => patch(r.id, { workPermitRequired: v })}>
            Foreign national resident and working in Uganda.
          </CheckRow>
        </div>
      ))}
      <CheckRow checked={confirmed} onChange={setConfirmed}>
        All directors and senior managers required for this application have been added.
      </CheckRow>
      <div className={cx("drawer-actions")}>
        <button
          className={cx("drawer-secondary")}
          type="button"
          onClick={() => {
            const next = [...rows, { id: newRowId("person"), name: "", role: "", designation: "", nationality: "", qualification: "", workPermitRequired: false }];
            setRows(next);
            void persist(next, confirmed);
          }}
        >
          Add person
        </button>
        <SaveButton
          label="Save people"
          flash={flash}
          onClick={async () => {
            await persist(rows, confirmed);
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function CreditEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const people = getPeople(api.ctx);
  const [none, setNone] = useState<Record<string, boolean>>(d.notRegistered ?? {});
  const [flash, doFlash] = useFlash();
  if (!people.length) return <div className={cx("drawer-empty")}>Add the applicable owners, directors and senior managers first.</div>;
  return (
    <>
      {people.map((p) => (
        <div className={cx("person-card")} key={p.key}>
          <h4>{p.name}</h4>
          <div className={cx("person-role")}>{p.roles.join(" · ")}</div>
          <UploadRow api={api} slot={p.key + "::report"} label="Credit-reference report" accept=".pdf,.png,.jpg,.jpeg" />
          <CheckRow checked={!!none[p.key]} onChange={(v) => setNone({ ...none, [p.key]: v })}>
            Not registered with the relevant credit-reference bureau.
          </CheckRow>
        </div>
      ))}
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, notRegistered: none });
            doFlash();
          }}
        />
      </div>
    </>
  );
}

function SourceFundsEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const sh = directShareholders(api.ctx);
  const [rows, setRows] = useState<Record<string, { source?: string; explanation?: string }>>(d.rows ?? {});
  const [flash, doFlash] = useFlash();
  if (!sh.length) {
    return <div className={cx("drawer-empty")}>Complete Ownership &amp; beneficial ownership first. Beacon will use the direct shareholders entered there.</div>;
  }
  const set = (id: string, p: { source?: string; explanation?: string }) => setRows({ ...rows, [id]: { ...rows[id], ...p } });
  return (
    <>
      {sh.map((s) => {
        const r = rows[s.id] ?? {};
        return (
          <div className={cx("person-card")} key={s.id}>
            <h4>{s.name || "Shareholder"}</h4>
            <div className={cx("field-grid one")}>
              <Field label="Source of funds">
                <select value={r.source ?? ""} onChange={(e) => set(s.id, { source: e.target.value })}>
                  <option value="">Select…</option>
                  {SOURCE_OF_FUNDS_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Explanation">
                <textarea value={r.explanation ?? ""} onChange={(e) => set(s.id, { explanation: e.target.value })} />
              </Field>
            </div>
            <UploadRow api={api} slot={"shareholder::" + s.id} label="Supporting evidence" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
          </div>
        );
      })}
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save source of funds"
          flash={flash}
          onClick={async () => {
            const next: Record<string, { source: string; explanation: string }> = {};
            sh.forEach((s) => {
              const r = rows[s.id] ?? {};
              next[s.id] = { source: r.source ?? "", explanation: (r.explanation ?? "").trim() };
            });
            await api.save({ ...d, rows: next });
            doFlash();
          }}
        />
      </div>
    </>
  );
}

function ProductDescEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [checked, setChecked] = useState(!!d.interoperabilityChecked);
  const [flash, doFlash] = useFlash();
  return (
    <>
      <Section>
        <UploadRow api={api} slot="main" label="Product & operations description" accept={productConfig(api.t).accept} />
      </Section>
      {api.ctx.routes.pso && (
        <Section title="Interoperability check">
          <CheckRow checked={checked} onChange={setChecked}>
            The description or supporting architecture explains how the payment system interoperates with relevant payment systems.
          </CheckRow>
          <UploadRow api={api} slot="interoperability_support" label="Optional supporting architecture / interoperability evidence" accept=".pdf,.doc,.docx,.ppt,.pptx" />
          <div className={cx("drawer-actions")}>
            <SaveButton
              label="Save check"
              flash={flash}
              onClick={async () => {
                await api.save({ ...d, interoperabilityChecked: checked });
                doFlash();
              }}
            />
          </div>
        </Section>
      )}
    </>
  );
}

function DocpackEditor({ api }: { api: EditorApi }) {
  const cfg = productConfig(api.t);
  return (
    <Section>
      {(cfg.slots ?? []).map((s) => (
        <UploadRow key={s[0]} api={api} slot={s[0]} label={s[1]} accept={cfg.accept} />
      ))}
    </Section>
  );
}

function FinancialsEditor({ api }: { api: EditorApi }) {
  const established = api.ctx.facts.established_business;
  return (
    <>
    <Section>
      <h3>Applicant stage</h3>
      <div className={cx("field-grid one")}>
        <Field label="Financial history">
          <select
            value={established === true ? "established" : established === false ? "new" : ""}
            onChange={(e) => void api.setFact({ established_business: e.target.value === "established" ? true : e.target.value === "new" ? false : null })}
          >
            <option value="">Select…</option>
            <option value="established">Established business with at least two years of financial history</option>
            <option value="new">New / newly incorporated applicant</option>
          </select>
        </Field>
      </div>
    </Section>
      {established === true ? (
        <UploadRow api={api} slot="main" label="Audited financial statements for the previous two years" accept=".pdf" />
      ) : established === false ? (
        <UploadRow api={api} slot="main" label="Management accounts / pre-trading financial statements" accept=".pdf,.xls,.xlsx,.doc,.docx" />
      ) : (
        <div className={cx("mini-alert")}>Select the applicant stage to see the correct financial-statement requirement.</div>
      )}
    </>
  );
}

function CapitalEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [amount, setAmount] = useState<string>(d.amount ?? "");
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <div className={cx("good-alert")}>
        Applicable minimum paid-up capital: <strong>{fmtUGX(api.ctx.pricing.minCapital || 0)}</strong>
      </div>
      <div className={cx("field-grid one")}>
        <Field label="Paid-up capital evidenced (UGX)">
          <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <UploadRow api={api} slot="main" label="Capital evidence / supporting financial schedule" accept=".pdf,.xls,.xlsx,.doc,.docx" />
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save amount"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, amount });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function TinTaxEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [tin, setTin] = useState<string>(d.tin ?? "");
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <Field label="Company TIN">
        <input value={tin} onChange={(e) => setTin(e.target.value)} />
      </Field>
      <UploadRow api={api} slot="main" label="Current company tax-clearance certificate" accept=".pdf,.png,.jpg,.jpeg" />
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save TIN"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, tin: tin.trim() });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

// The design replaces the helper note with "N document(s) added." after a batch.
function BatchNote({ api, accept, text }: { api: EditorApi; accept: string; text: string }) {
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <MultiInput api={api} accept={accept} onDone={(n) => setNote(n + " document" + (n === 1 ? "" : "s") + " added.")} />
      <p className={cx("editor-note")}>{note ?? text}</p>
    </>
  );
}

function MultiUploadEditor({ api }: { api: EditorApi }) {
  return (
    <Section>
      <BatchNote
        api={api}
        accept={productConfig(api.t).accept || ".doc,.docx,.pdf,.rtf,.txt"}
        text="Add one or more documents. Existing files remain in the application unless you replace them."
      />
    </Section>
  );
}

function ITControlsEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [cov, setCov] = useState<Record<string, boolean>>(d.coverage ?? {});
  const [flash, doFlash] = useFlash();
  const [batchKey, setBatchKey] = useState(0);
  return (
    <>
      <Section title="IT documents">
        <BatchNote
          key={batchKey}
          api={api}
          accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.rtf,.txt"
          text="The control areas can be covered in one consolidated document or across several documents."
        />
      </Section>
      <Section title="Coverage">
        {IT_CONTROLS.map((c) => (
          <CheckRow key={c[0]} checked={!!cov[c[0]]} onChange={(v) => setCov({ ...cov, [c[0]]: v })}>
            {c[1]}
          </CheckRow>
        ))}
        <div className={cx("drawer-actions")}>
          <SaveButton
            label="Save coverage"
            flash={flash}
            onClick={async () => {
              await api.save({ ...d, coverage: cov });
              setBatchKey((k) => k + 1);
              doFlash();
            }}
          />
        </div>
      </Section>
    </>
  );
}

function PentestEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [findings, setFindings] = useState<string>(d.findings ?? "");
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <UploadRow api={api} slot="report" label="Penetration-test report" accept=".pdf,.doc,.docx" />
      <Field label="Material findings">
        <select
          value={findings}
          onChange={(e) => {
            setFindings(e.target.value);
            void api.save({ ...d, findings: e.target.value });
          }}
        >
          <option value="">Select…</option>
          <option value="none">No unresolved material findings</option>
          <option value="material">Material findings require / have remediation</option>
        </select>
      </Field>
      {findings === "material" && <UploadRow api={api} slot="remediation" label="Remediation evidence / plan" accept=".pdf,.doc,.docx,.xls,.xlsx" />}
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save status"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, findings });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

const ARRANGEMENT_TITLE: Record<string, string> = {
  outsourcing: "Outsourcing arrangement",
  payment_systems: "Payment-system participation",
  foreign_licences: "Foreign licence",
};

function ArrangementEditor({ api, type }: { api: EditorApi; type: "outsourcing" | "payment_systems" | "foreign_licences" }) {
  const d = api.data;
  const [rows, setRows] = useState<any[]>(d.rows ?? []);
  const [flash, doFlash] = useFlash();
  const patch = (id: string, p: Record<string, unknown>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const trimAll = (list: any[]) =>
    list.map((r) => {
      const o: any = {};
      Object.keys(r).forEach((k) => (o[k] = typeof r[k] === "string" ? r[k].trim() : r[k]));
      return o;
    });
  const persist = (list: any[]) => api.save({ ...d, rows: trimAll(list) });
  const title = ARRANGEMENT_TITLE[type];
  return (
    <Section>
      {rows.length ? (
        rows.map((r, i) => (
          <div className={cx("repeat-row")} key={r.id}>
            <div className={cx("repeat-row-head")}>
              <strong>
                {title} {i + 1}
              </strong>
              <button
                className={cx("remove-btn")}
                type="button"
                onClick={() => {
                  const next = rows.filter((x) => x.id !== r.id);
                  setRows(next);
                  void persist(next);
                }}
              >
                Remove
              </button>
            </div>
            {type === "outsourcing" && (
              <>
                <div className={cx("field-grid")}>
                  <Field label="Service provider">
                    <input value={r.provider || ""} onChange={(e) => patch(r.id, { provider: e.target.value })} />
                  </Field>
                  <Field label="Service outsourced">
                    <input value={r.service || ""} onChange={(e) => patch(r.id, { service: e.target.value })} />
                  </Field>
                </div>
                <UploadRow api={api} slot={"row::" + r.id} label="Governing agreement" accept=".pdf,.doc,.docx" />
              </>
            )}
            {type === "payment_systems" && (
              <>
                <div className={cx("field-grid")}>
                  <Field label="Payment system">
                    <input value={r.system || ""} onChange={(e) => patch(r.id, { system: e.target.value })} />
                  </Field>
                  <Field label="Nature of participation">
                    <input value={r.participation || ""} onChange={(e) => patch(r.id, { participation: e.target.value })} />
                  </Field>
                </div>
                <UploadRow api={api} slot={"row::" + r.id} label="Admission / participation evidence" accept=".pdf,.doc,.docx" />
                <CheckRow checked={!!r.noEvidence} onChange={(v) => patch(r.id, { noEvidence: v })}>
                  No separate admission evidence is available.
                </CheckRow>
              </>
            )}
            {type === "foreign_licences" && (
              <>
                <div className={cx("field-grid")}>
                  <Field label="Country">
                    <input value={r.country || ""} onChange={(e) => patch(r.id, { country: e.target.value })} />
                  </Field>
                  <Field label="Licence type">
                    <input value={r.licenceType || ""} onChange={(e) => patch(r.id, { licenceType: e.target.value })} />
                  </Field>
                  <Field label="Status">
                    <input value={r.status || ""} onChange={(e) => patch(r.id, { status: e.target.value })} placeholder="Current / active" />
                  </Field>
                </div>
                <UploadRow api={api} slot={"row::" + r.id} label="Copy of licence" accept=".pdf,.png,.jpg,.jpeg" />
              </>
            )}
          </div>
        ))
      ) : (
        <div className={cx("drawer-empty")}>No item added yet.</div>
      )}
      <div className={cx("drawer-actions")}>
        <button
          className={cx("drawer-secondary")}
          type="button"
          onClick={() => {
            const next = [...rows, { id: newRowId("arr") }];
            setRows(next);
            void persist(next);
          }}
        >
          Add {title.toLowerCase()}
        </button>
        <SaveButton
          label="Save details"
          flash={flash}
          onClick={async () => {
            await persist(rows);
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function CustomerTermsEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const required = customerTermsRequired(api.ctx);
  const label = api.ctx.c.classes.emi
    ? "Customer service agreement and customer fees"
    : api.ctx.routes.instrument
      ? "Payment-instrument terms and conditions"
      : "Customer agreement / terms, where applicable";
  const [na, setNa] = useState(!!d.notApplicable);
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <UploadRow api={api} slot="main" label={label} accept=".doc,.docx,.pdf,.rtf,.txt" />
      {!required && (
        <CheckRow checked={na} onChange={setNa}>
          No separate customer agreement / terms apply to this service.
        </CheckRow>
      )}
      {!required && (
        <div className={cx("drawer-actions")}>
          <SaveButton
            label="Save"
            flash={flash}
            onClick={async () => {
              await api.save({ ...d, notApplicable: na });
              doFlash();
            }}
          />
        </div>
      )}
    </Section>
  );
}

function PricingEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [none, setNone] = useState(!!d.noCharges);
  const [flash, doFlash] = useFlash();
  const label = api.ctx.routes.instrument ? "Pricing policy / fee schedule" : "Pricing / fee disclosure";
  return (
    <Section>
      <UploadRow api={api} slot="main" label={label} accept=".doc,.docx,.pdf,.xls,.xlsx" />
      <CheckRow checked={none} onChange={setNone}>
        No customer charges apply to the proposed service.
      </CheckRow>
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, noCharges: none });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

function FeeProofEditor({ api }: { api: EditorApi }) {
  return (
    <Section>
      <div className={cx("good-alert")}>
        Application fee: <strong>{fmtUGX(api.ctx.pricing.applicationFee || 0)}</strong>
      </div>
      <UploadRow api={api} slot="main" label="Proof of payment" accept=".pdf,.png,.jpg,.jpeg" />
    </Section>
  );
}

function DataCentreEditor({ api }: { api: EditorApi }) {
  const d = api.data;
  const [location, setLocation] = useState<string>(d.location ?? "");
  const [hosting, setHosting] = useState<string>(d.hosting ?? "");
  const [flash, doFlash] = useFlash();
  return (
    <Section>
      <div className={cx("field-grid one")}>
        <Field label="Uganda data-centre location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location / facility" />
        </Field>
        <Field label="Hosting / architecture arrangement">
          <textarea value={hosting} onChange={(e) => setHosting(e.target.value)} />
        </Field>
      </div>
      <UploadRow api={api} slot="main" label="Supporting hosting / architecture evidence" accept=".pdf,.doc,.docx,.ppt,.pptx" />
      <div className={cx("drawer-actions")}>
        <SaveButton
          label="Save arrangement"
          flash={flash}
          onClick={async () => {
            await api.save({ ...d, location: location.trim(), hosting: hosting.trim() });
            doFlash();
          }}
        />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// dispatcher (openWorkDrawer)
// ---------------------------------------------------------------------------
export function EditorBody({ api }: { api: EditorApi }) {
  switch (productType(api.t)) {
    case "entity":
      return <EntityEditor api={api} />;
    case "company_docs":
      return <CompanyDocsEditor api={api} />;
    case "upload":
      return <UploadEditor api={api} />;
    case "repeat_docs":
      return <RepeatDocsEditor api={api} />;
    case "premises":
      return <PremisesEditor api={api} />;
    case "emi_structure":
      return <EmiStructureEditor api={api} />;
    case "official_form":
      return <OfficialFormEditor api={api} />;
    case "person_form":
      return <PersonUploads api={api} isForm />;
    case "ownership":
      return <OwnershipEditor api={api} />;
    case "people":
      return <PeopleEditor api={api} />;
    case "person_upload":
      return <PersonUploads api={api} isForm={false} />;
    case "person_credit":
      return <CreditEditor api={api} />;
    case "source_funds":
      return <SourceFundsEditor api={api} />;
    case "product_desc":
      return <ProductDescEditor api={api} />;
    case "docpack":
      return <DocpackEditor api={api} />;
    case "financials":
      return <FinancialsEditor api={api} />;
    case "capital":
      return <CapitalEditor api={api} />;
    case "tin_tax":
      return <TinTaxEditor api={api} />;
    case "multi_upload":
      return <MultiUploadEditor api={api} />;
    case "it_controls":
      return <ITControlsEditor api={api} />;
    case "pentest":
      return <PentestEditor api={api} />;
    case "outsourcing":
    case "payment_systems":
    case "foreign_licences":
      return <ArrangementEditor api={api} type={productType(api.t) as "outsourcing" | "payment_systems" | "foreign_licences"} />;
    case "customer_terms":
      return <CustomerTermsEditor api={api} />;
    case "pricing":
      return <PricingEditor api={api} />;
    case "fee_proof":
      return <FeeProofEditor api={api} />;
    case "data_centre":
      return <DataCentreEditor api={api} />;
    case "embedded":
      return <GuidanceBody t={api.t} />;
    default:
      return <div className={cx("drawer-empty")}>This requirement has no separate action in the current route.</div>;
  }
}
