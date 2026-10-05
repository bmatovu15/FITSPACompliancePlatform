// What a regulator programme needs before members and visitors can use it. Every item is checked against
// the data FITSPA staff have entered, so the checklist is the same for any regulator, present or future.
import { labelsInUse } from "./rules";
import type { ProgrammeData } from "./types";

export interface ReadinessInputs {
  data: ProgrammeData;
  classCount: number;
  classesWithoutApplicationFee: number;
  requirementCount: number;
  requirementPhases: number;
  documentCount: number;
  indexedDocumentCount: number;
}

export interface ReadyItem {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  required: boolean;
  tab: "overview" | "questions" | "rules" | "obligations" | "events" | "controls" | "classes" | "requirements" | "regulator" | "documents";
}

export function readiness(i: ReadinessInputs): ReadyItem[] {
  const { data } = i;
  const reg = data.regulator;
  const active = data.obligations.filter((o) => o.status === "active");
  const labels = labelsInUse(data.obligations, data.rules);
  const orphan = Object.entries(labels).filter(([l, n]) => n > 0 && !data.rules[l]);
  const noRule = active.filter((o) => !data.rules[o.applies]);
  const withDue = active.filter((o) => o.due_date).length;
  return [
    { key: "regulator", label: "Regulator profile", tab: "regulator", required: true, done: !!reg && !!reg.name,
      detail: reg ? `${reg.name}${reg.website ? ` · ${reg.website}` : " · no website domain yet"}` : "Missing" },
    { key: "classes", label: "Licence classes and fees", tab: "classes", required: true, done: i.classCount > 0,
      detail: i.classCount ? `${i.classCount} classes${i.classesWithoutApplicationFee ? `, ${i.classesWithoutApplicationFee} without an application fee` : ""}` : "No licence classes yet" },
    { key: "requirements", label: "Application requirements", tab: "requirements", required: true, done: i.requirementCount > 0,
      detail: i.requirementCount ? `${i.requirementCount} requirements in ${i.requirementPhases} phases` : "No requirements yet" },
    { key: "questions", label: "Compliance profile questions", tab: "questions", required: true, done: data.questions.length > 0,
      detail: data.questions.length ? `${data.questions.length} questions members answer once` : "No questions yet" },
    { key: "obligations", label: "Obligations", tab: "obligations", required: true, done: active.length > 0,
      detail: active.length ? `${active.length} active obligations` : "No obligations yet" },
    { key: "rules", label: "Applicability rules", tab: "rules", required: true, done: active.length > 0 && noRule.length === 0,
      detail: noRule.length ? `${noRule.length} obligations point at an audience with no rule` : orphan.length ? "Some audiences have no rule" : active.length ? "Every obligation reaches the right members" : "Nothing to match yet" },
    { key: "deadlines", label: "Deadlines", tab: "obligations", required: false, done: withDue > 0,
      detail: withDue ? `${withDue} obligations carry a due date` : "No due dates set (members see “no fixed date”)" },
    { key: "events", label: "Events members can log", tab: "events", required: false, done: data.events.length > 0,
      detail: data.events.length ? `${data.events.length} events` : "No events yet" },
    { key: "controls", label: "Control areas", tab: "controls", required: false, done: data.controls.length > 0,
      detail: data.controls.length ? `${data.controls.length} control areas` : "No control areas yet" },
    { key: "documents", label: "Documents uploaded", tab: "documents", required: true, done: i.documentCount > 0,
      detail: i.documentCount ? `${i.documentCount} documents (${i.indexedDocumentCount} readable by the assistant)` : "No documents uploaded" },
    { key: "ai", label: "AI assistant knowledge", tab: "documents", required: true, done: i.indexedDocumentCount > 0 || !!reg?.website,
      detail: i.indexedDocumentCount ? "Answers from FITSPA's documents" : reg?.website ? `Web fallback only (${reg.website})` : "Nothing for the assistant to read" },
  ];
}

export function readyScore(items: ReadyItem[]) {
  const done = items.filter((x) => x.done).length;
  const requiredMissing = items.filter((x) => x.required && !x.done);
  return { done, total: items.length, pct: Math.round((done / items.length) * 100), requiredMissing };
}
