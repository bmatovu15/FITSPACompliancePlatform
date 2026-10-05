// The generic applicability evaluator. A rule belongs to an audience label; an obligation names its label.
// Pure functions only, so they can be checked against the real Payments and Digital Lending engines.
import type { Member, Obligation, Programme } from "./admin-types";

export type { Facts } from "@/lib/programmes/types";
// The evaluator itself lives in src/lib/programmes/rules.ts so the demonstration and the real screens share one implementation.
export { condMet, ruleMatches, describeRule } from "@/lib/programmes/rules";
import { ruleMatches, describeRule } from "@/lib/programmes/rules";
import type { Facts } from "@/lib/programmes/types";

export function obligationApplies(p: Programme, o: Obligation, facts: Facts): boolean {
  return o.status === "active" && ruleMatches(p.rules[o.applies], facts);
}

export function universe(p: Programme, facts: Facts): Obligation[] {
  return p.obligations.filter((o) => obligationApplies(p, o, facts));
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
