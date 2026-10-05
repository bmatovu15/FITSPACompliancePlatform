"use client";

import { useState } from "react";
import type { Facts, ObligationRow, Question, Rule } from "@/lib/programmes/types";
import { describeRule, labelsInUse, universe } from "@/lib/programmes/rules";
import { Msg, muted, ReadOnlyBanner, useDb } from "./ui";

function RuleRow({ programmeId, label, rule, used, questions, readOnly }: { programmeId: string; label: string; rule: Rule | undefined; used: number; questions: Question[]; readOnly: boolean }) {
  const { supabase, exec, msg, busy } = useDb();
  const [mode, setMode] = useState<Rule["mode"]>(rule?.mode ?? "all");
  const [conds, setConds] = useState<Rule["conds"]>(rule?.conds ?? []);
  const dirty = !rule || mode !== rule.mode || JSON.stringify(conds) !== JSON.stringify(rule.conds);

  function save() {
    return exec(() => supabase.from("prog_audiences").upsert({ programme_id: programmeId, label, mode, conds: mode === "always" || mode === "never" ? [] : conds }, { onConflict: "programme_id,label" }), "Rule saved.");
  }
  function remove() {
    return exec(() => supabase.from("prog_audiences").delete().eq("programme_id", programmeId).eq("label", label), "Rule removed.");
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong>{label}</strong>
          <div className="text-xs" style={muted}>{used} obligation{used === 1 ? "" : "s"} use this audience{!rule ? " · no rule yet, so it applies to nobody" : ""}</div>
        </div>
        {readOnly && <span className="text-sm" style={muted}>{describeRule(rule, questions)}</span>}
      </div>
      {!readOnly && (
        <div className="mt-3 grid gap-2">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Rule["mode"])}>
            <option value="always">Applies to every member of this programme</option>
            <option value="all">Applies when ALL of these answers match</option>
            <option value="any">Applies when ANY of these answers match</option>
            <option value="never">Switched off (applies to nobody)</option>
          </select>
          {(mode === "all" || mode === "any") && (
            <>
              {conds.map((c, i) => {
                const q = questions.find((x) => x.key === c.q);
                return (
                  <div key={i} className="flex flex-wrap gap-2">
                    <select className="input" style={{ flex: 2 }} value={c.q} onChange={(e) => { const nq = questions.find((x) => x.key === e.target.value); setConds(conds.map((x, j) => (j === i ? { q: e.target.value, is: nq?.options[0]?.value ?? "" } : x))); }}>
                      {questions.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                    <select className="input" style={{ flex: 1 }} value={c.is} onChange={(e) => setConds(conds.map((x, j) => (j === i ? { ...x, is: e.target.value } : x)))}>
                      {(q?.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConds(conds.filter((_, j) => j !== i))}>×</button>
                  </div>
                );
              })}
              <div>
                <button className="btn btn-ghost btn-sm" disabled={!questions.length} onClick={() => setConds([...conds, { q: questions[0].key, is: questions[0].options[0]?.value ?? "" }])}>+ Add condition</button>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}>Save rule</button>
            {rule && used === 0 && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>Delete audience</button>}
          </div>
          <Msg msg={msg} />
        </div>
      )}
    </div>
  );
}

export default function RulesTab({ programmeId, questions, rules, obligations, readOnly }: { programmeId: string; questions: Question[]; rules: Record<string, Rule>; obligations: ObligationRow[]; readOnly: boolean }) {
  const { supabase, exec, msg, busy } = useDb();
  const used = labelsInUse(obligations.filter((o) => o.status === "active"), rules);
  const labels = Array.from(new Set([...Object.keys(rules), ...Object.keys(used)])).filter(Boolean).sort();
  const [newLabel, setNewLabel] = useState("");
  const [facts, setFacts] = useState<Facts>({});
  const hits = universe(obligations, rules, facts);
  const answered = questions.filter((q) => facts[q.key]).length;

  return (
    <div>
      {readOnly && <ReadOnlyBanner what="applicability rules" />}
      <p className="text-sm" style={muted}>
        Each obligation names an audience (for example “Electronic money issuer”). Each audience has a rule saying which member answers put a member in it.
        Add a new audience here when a regulator introduces a new kind of licensee.
      </p>
      <div className="mt-4 grid gap-3">
        {labels.map((l) => <RuleRow key={l} programmeId={programmeId} label={l} rule={rules[l]} used={used[l] ?? 0} questions={questions} readOnly={readOnly} />)}
        {labels.length === 0 && <div className="card p-4 text-sm">No audiences yet. Add obligations first, or create an audience below.</div>}
      </div>

      {!readOnly && (
        <div className="card mt-4 p-4 flex flex-wrap gap-2">
          <input className="input" style={{ flex: 1 }} placeholder="New audience name, e.g. Crowdfunding platforms" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={busy || !newLabel.trim()} onClick={() => exec(async () => { const r = await supabase.from("prog_audiences").insert({ programme_id: programmeId, label: newLabel.trim(), mode: "all", conds: [] }); if (!r.error) setNewLabel(""); return r; }, "Audience added. Now give it a rule.")}>Add audience</button>
        </div>
      )}
      <Msg msg={msg} />

      <section className="card mt-6 p-4">
        <h3 className="font-semibold">Test a member profile</h3>
        <p className="mt-1 text-sm" style={muted}>Answer the questions the way a member would and see exactly which obligations this programme gives them. This uses the same engine members get.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {questions.map((q) => (
            <label key={q.key} className="text-sm">{q.label}
              <select className="input mt-1" value={facts[q.key] ?? ""} onChange={(e) => setFacts({ ...facts, [q.key]: e.target.value })}>
                <option value="">Not answered</option>
                {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm"><strong>{hits.length}</strong> of {obligations.filter((o) => o.status === "active").length} active obligations apply ({answered}/{questions.length} questions answered).</p>
        {hits.length > 0 && (
          <ul className="mt-2 max-h-64 overflow-auto text-sm list-disc pl-5">
            {hits.slice(0, 200).map((o) => <li key={o.id}><span style={muted}>{o.ref}</span> {o.title}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
