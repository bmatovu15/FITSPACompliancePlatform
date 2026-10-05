// What a regulator programme needs before members and visitors can use it. Every item is checked against
// the data FITSPA has entered, so the checklist is the same for any regulator, present or future.
import type { AdminState, Programme, Section } from "./admin-types";
import { labelsInUse } from "./admin-rules";

export interface ReadyItem {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  required: boolean;
  section: Section;
  sub?: string;
}

export function readiness(s: AdminState, p: Programme): ReadyItem[] {
  const reg = s.regulators.find((r) => r.id === p.regulatorId);
  const docs = s.documents.filter((d) => d.regulatorId === p.regulatorId && (d.programmeId === p.id || d.programmeId === ""));
  const indexed = docs.filter((d) => d.status === "indexed" && d.inAssistant);
  const activeObs = p.obligations.filter((o) => o.status === "active");
  const labels = labelsInUse(p);
  const orphan = Object.entries(labels).filter(([l, n]) => n > 0 && !p.rules[l]);
  const noRule = activeObs.filter((o) => !p.rules[o.applies]);
  const feeless = p.classes.filter((c) => !c.fees.some((f) => f.type === "application"));
  const withDue = activeObs.filter((o) => o.due).length;
  return [
    { key: "regulator", label: "Regulator profile", detail: reg ? `${reg.name}${reg.website ? ` · ${reg.website}` : " · no website domain yet"}` : "Missing", done: !!reg && !!reg.name, required: true, section: "regulators" },
    { key: "classes", label: "Licence classes and fees", detail: p.classes.length ? `${p.classes.length} classes${feeless.length ? `, ${feeless.length} without an application fee` : ""}` : "No licence classes yet", done: p.classes.length > 0, required: true, section: "apply", sub: "classes" },
    { key: "requirements", label: "Application requirements", detail: p.requirements.length ? `${p.requirements.length} requirements in ${new Set(p.requirements.map((r) => r.phase)).size} phases` : "No requirements yet", done: p.requirements.length > 0, required: true, section: "apply", sub: "requirements" },
    { key: "questions", label: "Compliance profile questions", detail: p.questions.length ? `${p.questions.length} questions members answer once` : "No questions yet", done: p.questions.length > 0, required: true, section: "comply", sub: "questions" },
    { key: "obligations", label: "Obligations", detail: activeObs.length ? `${activeObs.length} active obligations` : "No obligations yet", done: activeObs.length > 0, required: true, section: "comply", sub: "obligations" },
    { key: "rules", label: "Applicability rules", detail: noRule.length ? `${noRule.length} obligations point at an audience with no rule` : orphan.length ? "Some audiences have no rule" : activeObs.length ? "Every obligation reaches the right members" : "Nothing to match yet", done: activeObs.length > 0 && noRule.length === 0, required: true, section: "comply", sub: "rules" },
    { key: "deadlines", label: "Deadlines", detail: withDue ? `${withDue} obligations carry a due date` : "No due dates set (members see “no fixed date”)", done: withDue > 0, required: false, section: "comply", sub: "deadlines" },
    { key: "events", label: "Events members can log", detail: p.events.length ? `${p.events.length} events` : "No events yet", done: p.events.length > 0, required: false, section: "comply", sub: "events" },
    { key: "controls", label: "Control areas", detail: p.controls.length ? `${p.controls.length} control areas` : "No control areas yet", done: p.controls.length > 0, required: false, section: "comply", sub: "events" },
    { key: "documents", label: "Documents uploaded", detail: docs.length ? `${docs.length} documents (${indexed.length} readable by the assistant)` : "No documents uploaded", done: docs.length > 0, required: true, section: "docsai", sub: "upload" },
    { key: "ai", label: "AI assistant knowledge", detail: indexed.length ? "Answers from FITSPA's documents" : reg?.website ? `Web fallback only (${reg.website})` : "Nothing for the assistant to read", done: indexed.length > 0 || !!reg?.website, required: true, section: "docsai", sub: "assistant" },
  ];
}

export function readyScore(items: ReadyItem[]) {
  const done = items.filter((i) => i.done).length;
  const requiredMissing = items.filter((i) => i.required && !i.done);
  return { done, total: items.length, pct: Math.round((done / items.length) * 100), requiredMissing };
}
