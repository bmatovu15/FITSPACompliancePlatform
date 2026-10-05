"use client";
import { useRef, useState } from "react";
import styles from "../fitspa-admin.module.css";
import { ask, type AskResult } from "../admin-assistant";
import type { Audience, DocItem } from "../admin-types";
import type { Ctx } from "./ctx";
import { Empty, SubTabs } from "./shared";

const TABS = [
  { key: "library", label: "Document library" },
  { key: "upload", label: "Upload a document" },
  { key: "assistant", label: "AI assistant" },
];
const KINDS = ["Act", "Regulation", "Guideline", "Form", "Checklist", "Notice", "Template", "Guidance note"];
const AUD: { v: Audience; l: string }[] = [
  { v: "public", l: "Everyone, including visitors" },
  { v: "members", l: "Signed-in members only" },
  { v: "staff", l: "FITSPA staff only" },
];

export default function DocsAi({ ctx }: { ctx: Ctx }) {
  const sub = TABS.some((t) => t.key === ctx.sub) ? ctx.sub : "library";
  return (
    <section className={styles.panel}>
      <SubTabs tabs={TABS} value={sub} onChange={ctx.setSub} />
      {sub === "library" && <Library ctx={ctx} />}
      {sub === "upload" && <Upload ctx={ctx} />}
      {sub === "assistant" && <Assistant ctx={ctx} />}
    </section>
  );
}

function Library({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const [reg, setReg] = useState("all");
  const docs = state.documents.filter((d) => reg === "all" || d.regulatorId === reg);
  const patch = (id: string, ch: Partial<DocItem>, msg: string) =>
    ctx.update((s) => ({ ...s, documents: s.documents.map((d) => (d.id === id ? { ...d, ...ch } : d)) }), msg);
  return (
    <>
      <p className={styles.lead}>
        Every Act, regulation, guideline and form FITSPA has uploaded. <b>Who can open it</b> controls the public library; <b>Assistant reads it</b>
        controls whether the AI assistant can answer from it and cite it.
      </p>
      <h2 className={styles.h2}>Coverage by regulator</h2>
      <div className={styles.table} role="table">
        <div className={`${styles.tr} ${styles.th} ${styles.trCov}`} role="row"><span>Regulator</span><span>Documents</span><span>Assistant reads</span><span>Answers from</span></div>
        {state.regulators.map((r) => {
          const all = state.documents.filter((d) => d.regulatorId === r.id);
          const readable = all.filter((d) => d.inAssistant && d.status === "indexed").length;
          return (
            <div key={r.id} className={`${styles.tr} ${styles.trCov}`} role="row">
              <span><b>{r.short}</b><small>{r.name}</small></span>
              <span>{all.length}</span>
              <span>{readable}</span>
              <span className={readable === 0 && !r.website ? styles.warn : ""}>
                {readable > 0 ? "FITSPA documents (and the regulator’s website)" : r.website ? `Regulator website only (${r.website})` : "Nothing yet — upload a document or add a website"}
              </span>
            </div>
          );
        })}
      </div>
      <h2 className={styles.h2}>Documents</h2>
      <div className={styles.toolbar}>
        <select className={styles.input} value={reg} onChange={(e) => setReg(e.target.value)} aria-label="Regulator">
          <option value="all">All regulators</option>
          {state.regulators.map((r) => <option key={r.id} value={r.id}>{r.short}</option>)}
        </select>
        <button className={styles.primary} type="button" onClick={() => ctx.setSub("upload")}>+ Upload a document</button>
      </div>
      {docs.length === 0 ? <Empty>No documents for this regulator yet.</Empty> : (
        <div className={styles.table} role="table">
          <div className={`${styles.tr} ${styles.th} ${styles.trDoc}`} role="row"><span>Document</span><span>Regulator</span><span>Who can open it</span><span>Assistant reads it</span><span>Status</span><span></span></div>
          {docs.map((d) => {
            const r = state.regulators.find((x) => x.id === d.regulatorId);
            return (
              <div key={d.id} className={`${styles.tr} ${styles.trDoc}`} role="row">
                <span><b>{d.title}</b><small>{d.kind}{d.sizeKb ? ` · ${d.sizeKb} KB` : ""} · {d.addedAt}</small></span>
                <span>{r?.short}</span>
                <span>
                  <select className={`${styles.input} ${styles.flat}`} value={d.audience} aria-label="Audience" onChange={(e) => patch(d.id, { audience: e.target.value as Audience }, `“${d.title}” is now open to ${AUD.find((a) => a.v === e.target.value)?.l.toLowerCase()}`)}>
                    {AUD.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
                  </select>
                </span>
                <span><label className={styles.check}><input type="checkbox" checked={d.inAssistant} onChange={(e) => patch(d.id, { inAssistant: e.target.checked }, `Assistant ${e.target.checked ? "can now read" : "no longer reads"} “${d.title}”`)} />{d.inAssistant ? "Yes" : "No"}</label></span>
                <span><i className={`${styles.pill} ${d.status === "indexed" ? styles.pillOn : styles.pillWarn}`}>{d.status === "indexed" ? (d.chunks ? `Indexed · ${d.chunks} passages` : "Indexed") : d.status === "indexing" ? "Indexing…" : "Uploaded"}</i></span>
                <span className={styles.rowActions}><button type="button" className={styles.linkBtn} onClick={() => ctx.update((s) => ({ ...s, documents: s.documents.filter((x) => x.id !== d.id) }), `Removed “${d.title}” from the library`)}>Remove</button></span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Upload({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; kb: number } | null>(null);
  const [title, setTitle] = useState("");
  const [regId, setRegId] = useState(state.regulators[0]?.id ?? "");
  const [progId, setProgId] = useState("");
  const [kind, setKind] = useState("Act");
  const [aud, setAud] = useState<Audience>("public");
  const [inAi, setInAi] = useState(true);
  const [text, setText] = useState("");
  const progs = state.programmes.filter((p) => p.regulatorId === regId);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile({ name: f.name, kb: Math.max(1, Math.round(f.size / 1024)) });
    if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ""));
    if (/\.(txt|md|csv)$/i.test(f.name) && f.size < 400_000) f.text().then((t) => setText(t.slice(0, 20000)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim() || !regId) return;
    const id = `up${Date.now()}`;
    const doc: DocItem = {
      id, regulatorId: regId, programmeId: progId, title: title.trim(), kind, audience: aud, fileName: file.name, sizeKb: file.kb,
      status: "uploaded", inAssistant: inAi, text, addedAt: "Just now",
    };
    const reg = state.regulators.find((r) => r.id === regId);
    ctx.update((s) => ({ ...s, documents: [doc, ...s.documents] }), `Uploaded “${doc.title}” for ${reg?.short} — ${aud === "public" ? "open to everyone" : aud === "members" ? "members only" : "staff only"}${inAi ? ", being indexed for the assistant" : ""}`);
    window.setTimeout(() => ctx.update((s) => ({ ...s, documents: s.documents.map((d) => (d.id === id ? { ...d, status: "indexing" as const } : d)) }), ""), 400);
    window.setTimeout(() => ctx.update((s) => ({ ...s, documents: s.documents.map((d) => (d.id === id ? { ...d, status: "indexed" as const, chunks: Math.max(1, Math.ceil((text.length || file.kb * 900) / 900)) } : d)) }), `Indexed “${doc.title}” — the assistant can now cite it`), 1500);
    setFile(null); setTitle(""); setText("");
    if (fileRef.current) fileRef.current.value = "";
    ctx.setSub("library");
  }

  return (
    <>
      <p className={styles.lead}>
        Upload an Act, regulation, guideline or form. It is split into passages the assistant can search and cite, and (if you allow it) it appears in the
        public library. In this demonstration the file never leaves your browser.
      </p>
      <form className={styles.form} onSubmit={submit}>
        <h3>Upload a document</h3>
        <div className={styles.formGrid}>
          <label className={styles.span2}>File
            <input ref={fileRef} className={styles.input} type="file" accept=".pdf,.doc,.docx,.xlsx,.txt,.md,.csv" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <label className={styles.span2}>Title<input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <label>Regulator
            <select className={styles.input} value={regId} onChange={(e) => { setRegId(e.target.value); setProgId(""); }}>
              {state.regulators.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>Applies to programme
            <select className={styles.input} value={progId} onChange={(e) => setProgId(e.target.value)}>
              <option value="">The whole regulator</option>
              {progs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Kind<select className={styles.input} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>Who can open it<select className={styles.input} value={aud} onChange={(e) => setAud(e.target.value as Audience)}>{AUD.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}</select></label>
          <label className={`${styles.span2} ${styles.check}`}><input type="checkbox" checked={inAi} onChange={(e) => setInAi(e.target.checked)} />Let the AI assistant read and cite this document</label>
          <label className={styles.span2}>Key text for the demonstration assistant (filled automatically for text files)
            <textarea className={styles.textarea} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a few paragraphs, so you can test a question against this document on the AI assistant tab." />
          </label>
        </div>
        <div className={styles.actionsRow}>
          <button className={styles.primary} type="submit" disabled={!file || !title.trim()}>Upload and index</button>
          <button className={styles.secondary} type="button" onClick={() => ctx.setSub("library")}>Cancel</button>
        </div>
      </form>
    </>
  );
}

function Assistant({ ctx }: { ctx: Ctx }) {
  const { state } = ctx;
  const ai = state.ai;
  const [who, setWho] = useState<"visitor" | "member">("visitor");
  const [q, setQ] = useState("What is the minimum capital for an electronic money issuer?");
  const [res, setRes] = useState<AskResult | null>(null);
  const set = (ch: Partial<typeof ai>, msg: string) => ctx.update((s) => ({ ...s, ai: { ...s.ai, ...ch } }), msg);
  const toggles: [keyof typeof ai, string, string][] = [
    ["enabled", "AI assistant is on", "Turns the assistant on for the whole platform."],
    ["visitors", "Visitors can ask", "People without an account can use it."],
    ["members", "Members can ask", "Signed-in members can use it, and see members-only documents."],
    ["useDocuments", "Answer from FITSPA’s documents", "Documents you uploaded are always used first."],
    ["useWeb", "Also search the regulator’s website", "Only the website domains you set for each regulator."],
  ];
  return (
    <>
      <p className={styles.lead}>One assistant serves every regulator. It answers from the documents and catalogues you enter here, and says plainly when something is not covered.</p>
      <div className={styles.cards}>
        {toggles.map(([k, label, note]) => (
          <label key={k} className={`${styles.card} ${styles.toggleCard}`}>
            <span><input type="checkbox" checked={ai[k] as boolean} onChange={(e) => set({ [k]: e.target.checked } as Partial<typeof ai>, `${label}: ${e.target.checked ? "on" : "off"}`)} /> <strong>{label}</strong></span>
            <span>{note}</span>
          </label>
        ))}
      </div>
      <label className={styles.stackLabel}>Disclaimer shown under every answer
        <textarea className={styles.textarea} value={ai.disclaimer} onChange={(e) => set({ disclaimer: e.target.value }, "")} onBlur={() => set({}, "Updated the assistant disclaimer")} />
      </label>

      <h2 className={styles.h2}>Test the assistant</h2>
      <div className={styles.viewBanner}>
        <div><strong>Ask it a question</strong><span>Shows what it would find for a visitor or a signed-in member, from your current documents and catalogues.</span></div>
        <select className={styles.input} value={who} onChange={(e) => setWho(e.target.value as "visitor" | "member")} aria-label="Who is asking">
          <option value="visitor">A visitor (no account)</option>
          <option value="member">A signed-in member</option>
        </select>
      </div>
      <form className={styles.inlineForm} onSubmit={(e) => { e.preventDefault(); setRes(ask(state, q, who)); }}>
        <input className={`${styles.input} ${styles.grow}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question" />
        <button className={styles.primary} type="submit" disabled={!q.trim() || !ai.enabled || (who === "visitor" ? !ai.visitors : !ai.members)}>Ask</button>
      </form>
      {!ai.enabled && <p className={styles.alert}>The assistant is switched off.</p>}
      {ai.enabled && who === "visitor" && !ai.visitors && <p className={styles.alert}>Visitors are not allowed to ask. Turn on “Visitors can ask”.</p>}
      {ai.enabled && who === "member" && !ai.members && <p className={styles.alert}>Members are not allowed to ask. Turn on “Members can ask”.</p>}
      <div className={styles.suggest}>
        {["What is the minimum capital for an electronic money issuer?", "Which forms do I need for a money lender licence?", "Who must report an outage within 24 hours?"].map((s) => (
          <button key={s} type="button" className={styles.chip} onClick={() => setQ(s)}>{s}</button>
        ))}
      </div>
      {res && (
        <div className={styles.answerBox} aria-live="polite">
          <p className={styles.eyebrow}>WHAT THE ASSISTANT FOUND · {who === "visitor" ? "VISITOR" : "MEMBER"}</p>
          {res.expanded.length > 0 && <p className={styles.small}>Acronyms understood: {res.expanded.join("; ")}</p>}
          {res.hits.map((h, i) => (
            <div key={i} className={styles.hit}>
              <span className={styles.hitKind}>{h.kind}</span>
              <div><b>{h.title}</b><small>{h.where}</small><p>{h.snippet}</p></div>
            </div>
          ))}
          {res.hits.length === 0 && res.web && <p>No FITSPA document covers this. The assistant would search <b>{res.web.domain}</b> ({res.web.regulator}) and label the answer as a web result, not a FITSPA document.</p>}
          {res.notCovered && <p>Not covered. The assistant would say so rather than guess. Upload a document for this regulator, or add its website, to cover it.</p>}
          <p className={styles.small}>{ai.disclaimer}</p>
        </div>
      )}
    </>
  );
}
