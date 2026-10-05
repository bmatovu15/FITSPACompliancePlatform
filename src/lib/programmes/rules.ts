// The generic applicability evaluator. Pure functions only (no database, no React), so the same code runs on
// the server, in the browser, and in scripts/verify-programme-rules.ts that proves it equals the real engines.
import type { Cond, Facts, ObligationRow, Question, Rule } from "./types";

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

export function obligationApplies(rules: Record<string, Rule>, o: Pick<ObligationRow, "status" | "applies">, facts: Facts): boolean {
  return o.status === "active" && ruleMatches(rules[o.applies], facts);
}

export function universe<T extends Pick<ObligationRow, "status" | "applies">>(obligations: T[], rules: Record<string, Rule>, facts: Facts): T[] {
  return obligations.filter((o) => obligationApplies(rules, o, facts));
}

/** An event is offered when every condition in `needs` holds. */
export function eventOffered(needs: Cond[], facts: Facts): boolean {
  return needs.every((c) => condMet(c, facts));
}

export function describeRule(rule: Rule | undefined, questions: Pick<Question, "key" | "label" | "options">[]): string {
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

/** Number of rule conditions that reference each question (an unused question changes nothing for members). */
export function questionUsage(questions: Pick<Question, "key">[], rules: Record<string, Rule>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of questions) out[q.key] = 0;
  for (const r of Object.values(rules)) for (const c of r.conds) out[c.q] = (out[c.q] ?? 0) + 1;
  return out;
}

/** How many obligations point at each audience label. */
export function labelsInUse(obligations: Pick<ObligationRow, "applies">[], rules: Record<string, Rule>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of Object.keys(rules)) out[l] = 0;
  for (const o of obligations) out[o.applies] = (out[o.applies] ?? 0) + 1;
  return out;
}

/** Every question a member has to answer before the universe can be worked out. */
export function unanswered(questions: Pick<Question, "key">[], facts: Facts): string[] {
  return questions.filter((q) => !facts[q.key]).map((q) => q.key);
}
