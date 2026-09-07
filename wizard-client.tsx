"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/public-config";
import type { Regulator, Licence, Subsector, Obligation, DocumentRow } from "@/lib/types";

type Path = "licence" | "subsector";

function useQueryState() {
  const router = useRouter();
  const params = useSearchParams();
  const path = (params.get("path") as Path | null) ?? null;
  const step = Number(params.get("step") ?? "0");
  const regulator = params.get("regulator") ?? "";
  const subsectors = (params.get("subsectors") ?? "").split(",").filter(Boolean);
  const licences = (params.get("licences") ?? "").split(",").filter(Boolean);

  function push(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    });
    router.push(`/wizard?${sp.toString()}`);
  }

  return { path, step, regulator, subsectors, licences, push };
}

const STEP_LABELS: Record<Path, string[]> = {
  licence: ["Regulator", "Licence(s)", "Checklist"],
  subsector: ["Subsector(s)", "Licence(s)", "Checklist"],
};

export default function WizardClient() {
  const { path, step, regulator, subsectors, licences, push } = useQueryState();
  const supabase = useMemo(() => createClient(), []);

  const [regulators, setRegulators] = useState<Regulator[]>([]);
  const [allLicences, setAllLicences] = useState<Licence[]>([]);
  const [allSubsectors, setAllSubsectors] = useState<Subsector[]>([]);
  const [subsectorRegulatorMap, setSubsectorRegulatorMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: regs }, { data: lics }, { data: subs }, { data: sr }] = await Promise.all([
        supabase.from("regulators").select("id,name,sector,status").eq("status", "Active").order("name"),
        supabase.from("licences").select("id,regulator_id,name,description,status").eq("status", "Active").order("name"),
        supabase.from("subsectors").select("id,name,notes").order("name"),
        supabase.from("subsector_regulators").select("subsector_id,regulator_id"),
      ]);
      setRegulators(regs ?? []);
      setAllLicences(lics ?? []);
      setAllSubsectors(subs ?? []);
      const map: Record<string, string[]> = {};
      (sr ?? []).forEach((row: any) => {
        map[row.subsector_id] = map[row.subsector_id] || [];
        map[row.subsector_id].push(row.regulator_id);
      });
      setSubsectorRegulatorMap(map);
      setLoading(false);
    })();
  }, [supabase]);

  const resolvedRegulatorIds = useMemo(() => {
    if (path === "licence") return regulator ? [regulator] : [];
    const set = new Set<string>();
    subsectors.forEach((sid) => (subsectorRegulatorMap[sid] || []).forEach((rid) => set.add(rid)));
    return Array.from(set);
  }, [path, regulator, subsectors, subsectorRegulatorMap]);

  const availableLicences = useMemo(
    () => allLicences.filter((l) => resolvedRegulatorIds.includes(l.regulator_id)),
    [allLicences, resolvedRegulatorIds]
  );

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">Loading…</div>;

  // Step 0: choose a path
  if (!path) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
          Requirements wizard
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Tell us where you're starting from, and we'll build your regulatory requirements checklist.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            className="card p-6 text-left transition hover:shadow-sm"
            onClick={() => push({ path: "licence", step: "1" })}
          >
            <h2 className="text-lg font-semibold">I'm looking for a particular licence</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              I know which regulator applies to me — show me its licences and requirements.
            </p>
          </button>
          <button
            className="card p-6 text-left transition hover:shadow-sm"
            onClick={() => push({ path: "subsector", step: "1" })}
          >
            <h2 className="text-lg font-semibold">I'm not sure which licence I need</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Tell us what your fintech does — we'll work out which regulator(s) and licences apply.
            </p>
          </button>
        </div>
      </div>
    );
  }

  const labels = STEP_LABELS[path];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <button className="text-sm" style={{ color: "var(--color-text-muted)" }} onClick={() => push({ path: null, step: null, regulator: null, subsectors: null, licences: null })}>
        ← Start over
      </button>

      <div className="stepper mt-4 mb-8">
        {labels.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "";
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`step-dot ${state}`}>{n < step ? "✓" : n}</div>
              <span className="text-sm" style={{ color: n === step ? "var(--color-text)" : "var(--color-text-muted)" }}>{label}</span>
              {i < labels.length - 1 && <div className="mx-2 h-px w-8" style={{ background: "var(--color-border)" }} />}
            </div>
          );
        })}
      </div>

      {path === "licence" && step === 1 && (
        <StepRegulator
          regulators={regulators}
          selected={regulator}
          onNext={(id) => push({ regulator: id, step: "2" })}
          onBack={() => push({ path: null, step: null })}
        />
      )}

      {path === "subsector" && step === 1 && (
        <StepSubsectors
          subsectors={allSubsectors}
          selected={subsectors}
          onNext={(ids) => push({ subsectors: ids.join(","), step: "2" })}
          onBack={() => push({ path: null, step: null })}
        />
      )}

      {step === 2 && (
        <StepLicences
          regulators={regulators.filter((r) => resolvedRegulatorIds.includes(r.id))}
          licences={availableLicences}
          selected={licences}
          onNext={(ids) => push({ licences: ids.join(","), step: "3" })}
          onBack={() => push({ step: "1" })}
        />
      )}

      {step === 3 && (
        <StepChecklist
          licenceIds={licences}
          allLicences={allLicences}
          regulators={regulators}
          onBack={() => push({ step: "2" })}
        />
      )}
    </div>
  );
}

function StepRegulator({
  regulators, selected, onNext, onBack,
}: { regulators: Regulator[]; selected: string; onNext: (id: string) => void; onBack: () => void }) {
  const [pick, setPick] = useState(selected);
  return (
    <div>
      <h2 className="text-lg font-semibold">Which regulator applies to you?</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {regulators.map((r) => (
          <label key={r.id} className={`card flex cursor-pointer items-start gap-3 p-4 ${pick === r.id ? "ring-2" : ""}`} style={pick === r.id ? { boxShadow: "0 0 0 2px var(--color-primary)" } : undefined}>
            <input type="radio" name="regulator" className="mt-1" checked={pick === r.id} onChange={() => setPick(r.id)} />
            <div>
              <p className="font-medium">{r.name}</p>
              {r.sector && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{r.sector}</p>}
            </div>
          </label>
        ))}
      </div>
      <div className="mt-6 flex justify-between">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" disabled={!pick} onClick={() => onNext(pick)}>Next</button>
      </div>
    </div>
  );
}

function StepSubsectors({
  subsectors, selected, onNext, onBack,
}: { subsectors: Subsector[]; selected: string[]; onNext: (ids: string[]) => void; onBack: () => void }) {
  const [pick, setPick] = useState<string[]>(selected);
  function toggle(id: string) {
    setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  return (
    <div>
      <h2 className="text-lg font-semibold">What does your fintech do? Select every subsector that applies.</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {subsectors.map((s) => (
          <label key={s.id} className="card flex cursor-pointer items-start gap-3 p-3">
            <input type="checkbox" className="mt-1" checked={pick.includes(s.id)} onChange={() => toggle(s.id)} />
            <div>
              <p className="text-sm font-medium">{s.name}</p>
              {s.notes && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{s.notes}</p>}
            </div>
          </label>
        ))}
      </div>
      <div className="mt-6 flex justify-between">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" disabled={pick.length === 0} onClick={() => onNext(pick)}>Next</button>
      </div>
    </div>
  );
}

function StepLicences({
  regulators, licences, selected, onNext, onBack,
}: { regulators: Regulator[]; licences: Licence[]; selected: string[]; onNext: (ids: string[]) => void; onBack: () => void }) {
  const [pick, setPick] = useState<string[]>(selected);
  function toggle(id: string) {
    setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function selectAll() {
    setPick(licences.map((l) => l.id));
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Which licence(s) do you need?</h2>
        <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select all</button>
      </div>
      {regulators.length === 0 && (
        <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
          FITSPA hasn't matched a regulator to your selected subsector(s) yet — please contact FITSPA directly for a tailored assessment.
        </p>
      )}
      <div className="mt-4 space-y-6">
        {regulators.map((r) => (
          <div key={r.id}>
            <p className="mb-2 text-sm font-semibold" style={{ color: "var(--color-accent)" }}>{r.name}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {licences.filter((l) => l.regulator_id === r.id).map((l) => (
                <label key={l.id} className="card flex cursor-pointer items-start gap-3 p-3">
                  <input type="checkbox" className="mt-1" checked={pick.includes(l.id)} onChange={() => toggle(l.id)} />
                  <div>
                    <p className="text-sm font-medium">{l.name}</p>
                    {l.description && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{l.description}</p>}
                  </div>
                </label>
              ))}
              {licences.filter((l) => l.regulator_id === r.id).length === 0 && (
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No licences catalogued yet for this regulator.</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-between">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" disabled={pick.length === 0} onClick={() => onNext(pick)}>See requirements checklist</button>
      </div>
    </div>
  );
}

function StepChecklist({
  licenceIds, allLicences, regulators, onBack,
}: { licenceIds: string[]; allLicences: Licence[]; regulators: Regulator[]; onBack: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [obligations, setObligations] = useState<(Obligation & { regulators: { name: string } | null })[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const selectedLicences = allLicences.filter((l) => licenceIds.includes(l.id));
  const regulatorIds = Array.from(new Set(selectedLicences.map((l) => l.regulator_id)));

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Obligations are either tied to a specific licence (licence_id set)
      // or published broadly against a whole regulator (licence_id null,
      // regulator_id set) -- the latter covers most of what FITSPA has
      // catalogued so far, and was previously dropped entirely because this
      // query only checked licence_id. Two queries merged by id, since a
      // single .in() can't express "licence_id matches OR (licence_id is
      // null AND regulator_id matches)" without also pulling in unrelated
      // regulators.
      const [{ data: obsByLicence }, { data: obsByRegulator }, { data: d }] = await Promise.all([
        supabase
          .from("obligations")
          .select("*, regulators(name)")
          .in("licence_id", licenceIds)
          .is("member_id", null)
          .eq("status", "Active"),
        regulatorIds.length
          ? supabase
              .from("obligations")
              .select("*, regulators(name)")
              .is("licence_id", null)
              .is("member_id", null)
              .in("regulator_id", regulatorIds)
              .eq("status", "Active")
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("documents")
          .select("id,regulator_id,title,doc_kind,storage_path,file_name,status")
          .in("regulator_id", regulatorIds)
          .eq("status", "Published"),
      ]);
      const obsById = new Map<string, any>();
      for (const o of [...(obsByLicence ?? []), ...(obsByRegulator ?? [])]) obsById.set(o.id, o);
      const sorted = Array.from(obsById.values()).sort((a: any, b: any) =>
        (a.regulators?.name ?? "").localeCompare(b.regulators?.name ?? "") || a.title.localeCompare(b.title)
      );
      setObligations(sorted as any);
      setDocs((d as any) ?? []);
      setLoading(false);
    })();
  }, [supabase, licenceIds.join(","), regulatorIds.join(",")]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch("/api/wizard/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenceIds }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fitspa-requirements-checklist.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const base = SUPABASE_URL;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Your requirements checklist</h2>
        <button className="btn btn-accent" onClick={downloadPdf} disabled={downloading}>
          {downloading ? "Preparing PDF…" : "Download as PDF"}
        </button>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Licence(s): {selectedLicences.map((l) => l.name).join(", ")}
      </p>

      {loading ? (
        <p className="mt-6 text-sm">Loading requirements…</p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto card">
            <table className="data">
              <thead>
                <tr>
                  <th>Regulator</th>
                  <th>Requirement</th>
                  <th>Legal ref.</th>
                  <th>Frequency / Deadline</th>
                  <th>Penalty</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {obligations.length === 0 && (
                  <tr><td colSpan={6} className="text-center" style={{ color: "var(--color-text-muted)" }}>No published requirements catalogued yet for this selection.</td></tr>
                )}
                {obligations.map((o) => (
                  <tr key={o.id}>
                    <td>{o.regulators?.name}</td>
                    <td>
                      <p className="font-medium">{o.title}</p>
                      {o.description && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{o.description}</p>}
                    </td>
                    <td>{o.legal_ref ?? "—"}</td>
                    <td>{o.frequency ?? (o.due_date ?? "—")}</td>
                    <td>{o.penalty ?? "—"}</td>
                    <td>{o.risk ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            Downloadable documents &amp; forms
          </h3>
          {docs.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>No published documents yet for these regulators.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="card flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{d.doc_kind}</p>
                  </div>
                  <a className="btn btn-ghost btn-sm" href={`${base}/storage/v1/object/public/regulatory-library/${d.storage_path}`} target="_blank" rel="noreferrer">
                    Open / Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-6">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
