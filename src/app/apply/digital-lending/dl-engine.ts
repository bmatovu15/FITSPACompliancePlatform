// Readiness / progress logic for the Digital Lending Apply drawers.
// Reads a requirement's FormSchema (see dl-schemas.ts) and reproduces the
// design's status(id) / progressText(id) rules (Appendix B of the gap analysis).

import type { Block, Caption, Cond, Field, FormSchema } from "./dl-schemas";
import { DL_FORM_SCHEMAS, GENERIC_FORM_SCHEMA, isFormSchema } from "./dl-schemas";
import type { LicenceApplicationTemplate, MemberLicenceApplicationFile } from "@/lib/types";

export type ItemStatus = "not_started" | "in_progress" | "ready";
export type Answers = Record<string, unknown>;

export function schemaFor(template: LicenceApplicationTemplate): FormSchema {
  const db = (template as { form_schema?: unknown }).form_schema;
  if (isFormSchema(db)) return db;
  return DL_FORM_SCHEMAS[template.external_id] ?? GENERIC_FORM_SCHEMA;
}

// ---- dotted-path helpers (NDT-A5 stores answers.receivership.value etc.) ----

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setPath(obj: Answers, path: string, value: unknown): Answers {
  const parts = path.split(".");
  const root: Answers = { ...obj };
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    cur[parts[i]] = next && typeof next === "object" && !Array.isArray(next) ? { ...(next as object) } : {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

export function newRowId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function filled(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return true;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.some(filled);
  if (v && typeof v === "object") return Object.values(v as object).some(filled);
  return false;
}

export function latestFileForSlot(files: MemberLicenceApplicationFile[], slot: string): MemberLicenceApplicationFile | null {
  let best: MemberLicenceApplicationFile | null = null;
  for (const f of files) if (f.slot === slot && (!best || f.version >= best.version)) best = f;
  return best;
}

/** Latest version of every distinct slot. */
export function latestPerSlot(files: MemberLicenceApplicationFile[]): MemberLicenceApplicationFile[] {
  const map = new Map<string, MemberLicenceApplicationFile>();
  for (const f of files) {
    const cur = map.get(f.slot);
    if (!cur || f.version >= cur.version) map.set(f.slot, f);
  }
  return [...map.values()];
}

export function condMet(cond: Cond, answers: Answers, route: string | null): boolean {
  if ("route" in cond) return route === cond.route;
  const v = getPath(answers, cond.key);
  if ("eq" in cond) return v === cond.eq;
  return v !== cond.ne;
}

type Ctx = { answers: Answers; files: MemberLicenceApplicationFile[]; route: string | null };

function fieldsOk(fields: Field[], obj: unknown): boolean {
  return fields.every((f) => f.required === false || filled(getPath(obj, f.key)));
}

function blocksReady(blocks: Block[], ctx: Ctx): boolean {
  return blocks.every((b) => blockReady(b, ctx));
}

function blockReady(b: Block, ctx: Ctx): boolean {
  const { answers, files, route } = ctx;
  switch (b.kind) {
    case "fields":
      return fieldsOk(b.fields, answers);
    case "choice":
      return b.required === false || filled(getPath(answers, b.key));
    case "section":
      return blocksReady(b.blocks, ctx);
    case "check":
      return !b.required || answers[b.key] === true;
    case "checks":
      return !b.required || b.items.every((i) => answers[i.key] === true);
    case "checkArray": {
      const arr = Array.isArray(answers[b.key]) ? (answers[b.key] as unknown[]) : [];
      return arr.length >= (b.min ?? 0);
    }
    case "upload":
      return !b.required || !!latestFileForSlot(files, b.slot);
    case "multiupload":
      return !b.required || files.some((f) => f.slot.startsWith(b.slotPrefix));
    case "repeater": {
      const rows = Array.isArray(answers[b.key]) ? (answers[b.key] as Record<string, unknown>[]) : [];
      if (rows.length < (b.min ?? 0)) return false;
      return rows.every(
        (r) =>
          fieldsOk(b.fields, r) &&
          (!b.file?.required || !!latestFileForSlot(files, `${b.file.slotPrefix}${String(r.rowId)}`))
      );
    }
    case "person": {
      const p = answers[b.key];
      if (!p || typeof p !== "object") return false;
      return (
        fieldsOk(b.fields, p) &&
        (!b.file?.required || !!latestFileForSlot(files, `${b.file.slotPrefix}${b.key}`))
      );
    }
    case "when":
      return condMet(b.cond, answers, route) ? blocksReady(b.blocks, ctx) : true;
    case "text":
    case "note":
    case "link":
      return true;
    default:
      return true;
  }
}

export function isReady(schema: FormSchema, answers: Answers, files: MemberLicenceApplicationFile[], route: string | null): boolean {
  return blocksReady(schema.blocks, { answers, files, route });
}

export function computeStatus(
  schema: FormSchema,
  answers: Answers,
  files: MemberLicenceApplicationFile[],
  route: string | null
): ItemStatus {
  if (isReady(schema, answers, files, route)) return "ready";
  // "In progress" = anything entered (any non-empty answer) or any file attached.
  const any = Object.entries(answers).some(([, v]) => filled(v)) || files.length > 0;
  return any ? "in_progress" : "not_started";
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function captionFor(caption: Caption | undefined, answers: Answers, files: MemberLicenceApplicationFile[]): string {
  const arr = (k: string) => (Array.isArray(answers[k]) ? (answers[k] as unknown[]) : []);
  switch (caption?.kind) {
    case "peopleML":
      return `${plural(arr("directors").length, "director")} added${filled(answers.secretary) ? " · secretary added" : ""}`;
    case "peopleNDT":
      return `${arr("board").length} board · ${arr("management").length} management`;
    case "count":
      return `${plural(arr(caption.key).length, caption.noun)} added`;
    case "offices":
      return answers.noExisting === true ? "No existing places of business" : `${plural(arr("places").length, "place")} added`;
    case "channels": {
      const n = arr("channels").length;
      return n ? `${plural(n, "channel")} selected` : "";
    }
    default: {
      const n = new Set(files.map((f) => f.slot)).size;
      return n ? `${plural(n, "file")} added` : "";
    }
  }
}

/** Human label of an uploaded file, derived from the schema (used when the files.label column is absent). */
export function labelForSlot(schema: FormSchema, slot: string, answers: Answers): string | null {
  let found: string | null = null;
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (found) return;
      if (b.kind === "upload" && b.slot === slot) {
        const v = b.labelIf ? getPath(answers, b.labelIf.key) : undefined;
        found = (typeof v === "string" && b.labelIf?.map[v]) || b.label;
      } else if (b.kind === "multiupload" && slot.startsWith(b.slotPrefix)) found = b.fileLabel;
      else if ((b.kind === "repeater" || b.kind === "person") && b.file) {
        if (b.kind === "person" ? slot === `${b.file.slotPrefix}${b.key}` : slot.startsWith(b.file.slotPrefix)) found = b.file.label;
      } else if (b.kind === "section" || b.kind === "when") walk(b.blocks);
    }
  };
  walk(schema.blocks);
  return found;
}

/** Strip surrounding whitespace from every string in an answers object (the design trims on save). */
export function trimDeep<T>(v: T): T {
  if (typeof v === "string") return v.trim() as unknown as T;
  if (Array.isArray(v)) return v.map(trimDeep) as unknown as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, trimDeep(x)])) as unknown as T;
  }
  return v;
}
