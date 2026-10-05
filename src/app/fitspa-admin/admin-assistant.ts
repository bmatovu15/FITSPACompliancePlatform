// A small, deterministic stand-in for the assistant's retrieval step, so the demonstration can show what the
// assistant would find from the documents and catalogues FITSPA has entered. The live assistant uses
// full-text search over indexed passages and an AI model to write the answer.
import type { AdminState, DocItem, Regulator } from "./admin-types";
import { money } from "./panels/ctx";

const STOP = new Set(["the", "and", "for", "are", "what", "which", "who", "how", "does", "must", "can", "should", "have", "has", "with", "that", "this", "from", "into", "your", "you", "any", "all", "is", "of", "to", "a", "in", "on", "an", "do", "i", "we", "my", "our", "be", "it", "or", "by", "as", "at", "when", "need", "required", "require"]);

export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9][a-z0-9\-]+/g) ?? []).filter((t) => t.length > 2 && !STOP.has(t));
}

function acronymMap(regs: Regulator[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of regs) for (const part of r.acronyms.split(";")) {
    const [k, v] = part.split("=").map((x) => x?.trim());
    if (k && v) m[k.toLowerCase()] = v;
  }
  return m;
}

export interface Hit {
  kind: "Document" | "Application requirement" | "Fee" | "Obligation";
  title: string;
  where: string;
  snippet: string;
  score: number;
}

export interface AskResult {
  hits: Hit[];
  expanded: string[];
  web: { domain: string; regulator: string } | null;
  notCovered: boolean;
}

function docVisible(d: DocItem, who: "visitor" | "member") {
  if (!d.inAssistant || d.status !== "indexed") return false;
  return who === "member" ? d.audience !== "staff" : d.audience === "public";
}

function snippetOf(text: string, toks: string[]): string {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  let best = sentences[0] ?? text;
  let bs = -1;
  for (const s of sentences) {
    const low = s.toLowerCase();
    const sc = toks.filter((t) => low.includes(t)).length;
    if (sc > bs) { bs = sc; best = s; }
  }
  return best.length > 240 ? best.slice(0, 237) + "…" : best;
}

export function ask(state: AdminState, question: string, who: "visitor" | "member"): AskResult {
  const acr = acronymMap(state.regulators);
  const base = tokens(question);
  const expanded: string[] = [];
  const toks = [...base];
  for (const t of base) {
    const full = acr[t];
    if (full) { expanded.push(`${t.toUpperCase()} → ${full}`); toks.push(...tokens(full)); }
  }
  const uniq = Array.from(new Set(toks));
  const hits: Hit[] = [];
  const score = (text: string) => uniq.reduce((n, t) => n + (text.toLowerCase().includes(t) ? 1 : 0), 0);

  if (state.ai.useDocuments) {
    for (const d of state.documents) {
      if (!docVisible(d, who)) continue;
      const reg = state.regulators.find((r) => r.id === d.regulatorId);
      const text = `${d.title} ${d.kind} ${d.text}`;
      const sc = score(text);
      if (sc > 0) hits.push({ kind: "Document", title: d.title.replace(/\.(pdf|xlsx|docx|txt|md)$/i, ""), where: reg?.short ?? "", snippet: d.text ? snippetOf(d.text, uniq) : `${d.kind} published by ${reg?.short ?? "the regulator"}.`, score: sc * 3 + (d.text ? 2 : 0) });
    }
  }
  for (const p of state.programmes) {
    if (p.status !== "published") continue;
    const reg = state.regulators.find((r) => r.id === p.regulatorId);
    for (const r of p.requirements) {
      const sc = score(`${r.title} ${r.guidance}`);
      if (sc > 0) hits.push({ kind: "Application requirement", title: r.title, where: `${reg?.short} · Apply`, snippet: r.guidance || `A ${r.phase} step in the ${p.name} application.`, score: sc * 2 });
    }
    for (const c of p.classes) {
      const sc = score(`${c.label} fee capital licence`) + (uniq.some((t) => ["fee", "fees", "capital", "cost"].includes(t)) ? 1 : 0);
      if (sc > 1 && uniq.some((t) => c.label.toLowerCase().includes(t))) {
        const fees = c.fees.map((f) => `${f.type} ${money(f.amount)}`).join(", ");
        hits.push({ kind: "Fee", title: c.label, where: `${reg?.short} · Apply`, snippet: `Minimum capital ${money(c.minCapital)}${fees ? `; fees: ${fees}` : ""}.`, score: sc * 2 });
      }
    }
    if (who === "member") {
      for (const o of p.obligations) {
        if (o.status !== "active") continue;
        const sc = score(`${o.title} ${o.group} ${o.guidance} ${o.source}`);
        if (sc > 0) hits.push({ kind: "Obligation", title: `${o.id} ${o.title}`, where: `${reg?.short} · Comply`, snippet: o.guidance || o.evidence || o.type, score: sc * 2 });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const top = hits.filter((h) => h.score >= Math.max(2, Math.ceil(uniq.length / 3))).slice(0, 4);
  const q = question.toLowerCase();
  const regHit = state.regulators.find((r) => r.website && (q.includes(r.short.toLowerCase()) || q.includes(r.name.toLowerCase())))
    ?? state.regulators.find((r) => r.website && base.some((t) => acr[t] && r.acronyms.toLowerCase().includes(t + " =")));
  const web = state.ai.useWeb && regHit ? { domain: regHit.website, regulator: regHit.short } : null;
  return { hits: top, expanded, web, notCovered: top.length === 0 && !web };
}
