"use client";

import { useState } from "react";
import type { Question, Rule } from "@/lib/programmes/types";
import { questionUsage } from "@/lib/programmes/rules";
import { Msg, muted, ReadOnlyBanner, slug, useDb } from "./ui";

const KIND_LABEL = { yesno: "Yes / No", yesnomaybe: "Yes / No / Not sure", single: "Pick one" } as const;

function defaultOptions(kind: Question["kind"]) {
  if (kind === "yesno") return [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
  if (kind === "yesnomaybe") return [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not-sure", label: "Not sure" }];
  return [];
}

export default function QuestionsTab({ programmeId, questions, rules, readOnly }: { programmeId: string; questions: Question[]; rules: Record<string, Rule>; readOnly: boolean }) {
  const { supabase, exec, msg, busy } = useDb();
  const usage = questionUsage(questions, rules);
  const [label, setLabel] = useState("");
  const [help, setHelp] = useState("");
  const [kind, setKind] = useState<Question["kind"]>("yesno");
  const [opts, setOpts] = useState("");

  function parseOpts(text: string) {
    return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ value: slug(l), label: l }));
  }

  function add() {
    const key = slug(label).replace(/-/g, "_");
    if (!key) return;
    const options = kind === "single" ? parseOpts(opts) : defaultOptions(kind);
    if (kind === "single" && options.length < 2) return;
    return exec(async () => {
      const r = await supabase.from("prog_questions").insert({ programme_id: programmeId, key, label: label.trim(), help: help.trim(), kind, options, sort_order: questions.length });
      if (!r.error) { setLabel(""); setHelp(""); setOpts(""); }
      return r;
    }, "Question added. Now use it in an applicability rule.");
  }

  function remove(q: Question) {
    if (usage[q.key] > 0) return;
    return exec(() => supabase.from("prog_questions").delete().eq("programme_id", programmeId).eq("key", q.key), "Question removed.");
  }

  return (
    <div>
      {readOnly && <ReadOnlyBanner what="questions" />}
      <p className="text-sm" style={muted}>
        Members answer these once. Their answers decide which obligations (and events) apply to them. A question only matters once a rule uses it.
      </p>
      <div className="mt-4 overflow-x-auto card">
        <table className="data">
          <thead><tr><th>#</th><th>Question</th><th>Type</th><th>Answers</th><th>Used by</th><th></th></tr></thead>
          <tbody>
            {questions.map((q, i) => (
              <tr key={q.key}>
                <td>{i + 1}</td>
                <td>
                  {readOnly ? <strong>{q.label}</strong> : (
                    <input className="input" defaultValue={q.label} onBlur={(e) => e.target.value !== q.label && exec(() => supabase.from("prog_questions").update({ label: e.target.value }).eq("programme_id", programmeId).eq("key", q.key))} />
                  )}
                  <div className="text-xs mt-1" style={muted}>
                    key: {q.key}
                    {!readOnly ? <> · <input className="input" style={{ display: "inline-block", width: "70%" }} defaultValue={q.help} placeholder="Help text" onBlur={(e) => e.target.value !== q.help && exec(() => supabase.from("prog_questions").update({ help: e.target.value }).eq("programme_id", programmeId).eq("key", q.key))} /></> : <> · {q.help}</>}
                  </div>
                </td>
                <td>{KIND_LABEL[q.kind]}</td>
                <td>{q.options.map((o) => o.label).join(" / ")}</td>
                <td>{usage[q.key] ? `${usage[q.key]} rule condition${usage[q.key] > 1 ? "s" : ""}` : <span className="badge badge-amber">Not used yet</span>}</td>
                <td>{!readOnly && <button className="btn btn-ghost btn-sm" disabled={busy || usage[q.key] > 0} title={usage[q.key] > 0 ? "Remove it from the rules first" : "Remove"} onClick={() => remove(q)}>Remove</button>}</td>
              </tr>
            ))}
            {questions.length === 0 && <tr><td colSpan={6}>No questions yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="card mt-4 p-4 grid gap-3 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Add a question</h3>
          <input className="input sm:col-span-2" placeholder="Question the member answers, e.g. Do you hold customer funds?" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input sm:col-span-2" placeholder="Help text (optional)" value={help} onChange={(e) => setHelp(e.target.value)} />
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Question["kind"])}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {kind === "single" && <textarea className="input" rows={3} placeholder={"One answer per line\nInsurer\nBroker"} value={opts} onChange={(e) => setOpts(e.target.value)} />}
          <div className="sm:col-span-2"><button className="btn btn-primary btn-sm" disabled={busy || !label.trim()} onClick={add}>Add question</button></div>
        </div>
      )}
      <Msg msg={msg} />
    </div>
  );
}
