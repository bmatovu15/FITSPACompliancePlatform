// The generic applicability evaluator. A rule belongs to an audience label; an obligation names its label.
// Pure functions only, so they can be checked against the real Payments and Digital Lending engines.
import type { Cond, Member, Obligation, Programme, Question, Rule } from "./admin-types";

export type Facts = Record<string, string>;

export function condMet(c: Cond, facts: Facts): boolean {
  return (facts[c.q] ?? "") === c.is;
}

export function ruleMatches(rule: Rule | undefined, facts: Facts): boolean {
  if (!rule) return false; // an audience label with no rule applies to nobody until FITSPA defines it
  if (rule.mode === "always") return true;
  if (rule.mode === "never") return false;
  if (rule.conds.length === 0) return false;
  return rule.mode === "all" ? rule.conds.every((c) => condMet(c, facts)) : rule.conds.some((c) => condMet(c, facts));
}

export function obligationApplies(p: Programme, o: Obligation, facts: Facts): boolean {
  return o.status === "active" && ruleMatches(p.rules[o.applies], facts);
}

export function universe(p: Programme, facts: Facts): Obligation[] {
  return p.obligations.filter((o) => obligationApplies(p, o, facts));
}

export function describeRule(rule: Rule | undefined, questions: Question[]): string {
  if (!rule) return "No rule yet — applies to nobody";
  if (rule.mode === "always") return "Every member of this programme";
  if (rule.mode === "never") return "Nobody (switched off)";
  if (rule.conds.length === 0) return "No conditions yet — applies to nobody";
  const parts = rule.conds.map((c) => {
    const q = questions.find((x) => x.key === c.q);
    const ans = q?.options.find((o) => o.value === c.is)?.label ?? c.is;
    return `${q?.label ?? c.q} = ${ans}`;
  });
  return parts.join(rule.mode === "all" ? "  AND  " : "  OR  ");
}

/** Which obligations a member reaches, and the reason in plain words. */
export function whyApplies(p: Programme, o: Obligation): string {
  const r = p.rules[o.applies];
  if (!r) return `“${o.applies}” has no rule`;
  if (r.mode === "always") return `“${o.applies}” — applies to every member`;
  return `“${o.applies}” — ${describeRule(r, p.questions)}`;
}

export function memberUniverseCount(p: Programme | undefined, m: Member): number {
  return p ? universe(p, m.facts).length : 0;
}

/** Number of rule conditions that reference each question (an unused question changes nothing for members). */
export function questionUsage(p: Programme): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of p.questions) out[q.key] = 0;
  for (const r of Object.values(p.rules)) for (const c of r.conds) out[c.q] = (out[c.q] ?? 0) + 1;
  return out;
}

export function labelsInUse(p: Programme): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of Object.keys(p.rules)) out[l] = 0;
  for (const o of p.obligations) out[o.applies] = (out[o.applies] ?? 0) + 1;
  return out;
}
