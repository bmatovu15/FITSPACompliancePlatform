// Generates the SQL that loads the existing Comply catalogues (Payments, Digital Lending, Insurance) into the
// prog_* tables. Run: npx tsx scripts/generate-programme-seed.ts <outDir>
// Semicolons inside text are written as ~SC~ and restored with replace(), because the SQL tool used for
// production changes hangs on semicolons inside dollar-quoted strings.
import { writeFileSync } from "fs";
import { seedState } from "../src/app/fitspa-admin/admin-seed";
import payments from "../src/data/payments-comply-catalog.json";
import dlObl from "../src/data/digital-lending/obligations.json";
import dlEvents from "../src/data/digital-lending/events.json";

const out = process.argv[2] || "/tmp/seed";
const st = seedState();
const REG: Record<string, string> = { payments: "8ac82086-9247-4b0b-ae65-cde09a7cbbce", digital_lending: "e6b3f084-ec4a-492b-8766-54d35c612c0f", insurance: "ddc12ce2-79b1-4cc9-90d2-a5cdd62b7205" };
const APP: Record<string, string> = { payments: "payments_nps", digital_lending: "digital_lending", insurance: "insurance" };
const ROUTE: Record<string, string> = { payments: "/comply/payments", digital_lending: "/comply/digital-lending", insurance: "/comply/insurance" };
const j = (v: unknown) => JSON.stringify(v).replace(/;/g, "~SC~");
const json = (v: unknown) => `replace($q$${j(v)}$q$, '~SC~', ';')::jsonb`;
const files: string[] = [];
const add = (name: string, sql: string) => { writeFileSync(`${out}/${name}.sql`, sql); files.push(name); };

// 1. programmes + regulator fields
const progRows = st.programmes.map((p, i) => ({ id: p.id, regulator_id: REG[p.id], name: p.name, blurb: p.blurb, application_key: APP[p.id], screens: "dedicated", route: ROUTE[p.id], status: "published", phases: p.phases, sort_order: i }));
add("01_programmes", `insert into prog_programmes (id, regulator_id, name, blurb, application_key, screens, route, status, phases, sort_order)
select x.id, x.regulator_id::uuid, x.name, x.blurb, x.application_key, x.screens, x.route, x.status, x.phases, x.sort_order
from jsonb_to_recordset(${json(progRows)}) as x(id text, regulator_id text, name text, blurb text, application_key text, screens text, route text, status text, phases text[], sort_order int)
on conflict (id) do nothing`);
const regRows = st.regulators.map((r) => ({ name: r.name, short: r.short, website: r.website, acronyms: r.acronyms }));
add("02_regulators", `update regulators r set short_name = x.short, website = x.website, acronyms = x.acronyms
from jsonb_to_recordset(${json(regRows)}) as x(name text, short text, website text, acronyms text) where r.name = x.name`);

// 2. questions + audiences
for (const p of st.programmes) {
  const q = p.questions.map((x, i) => ({ programme_id: p.id, key: x.key, label: x.label, help: x.help, kind: x.kind, options: x.options, sort_order: i }));
  const a = Object.entries(p.rules).map(([label, r]) => ({ programme_id: p.id, label, mode: r.mode, conds: r.conds }));
  add(`03_qa_${p.id}`, `insert into prog_questions (programme_id, key, label, help, kind, options, sort_order)
select x.programme_id, x.key, x.label, x.help, x.kind, x.options, x.sort_order from jsonb_to_recordset(${json(q)}) as x(programme_id text, key text, label text, help text, kind text, options jsonb, sort_order int) on conflict do nothing`);
  add(`04_aud_${p.id}`, `insert into prog_audiences (programme_id, label, mode, conds)
select x.programme_id, x.label, x.mode, x.conds from jsonb_to_recordset(${json(a)}) as x(programme_id text, label text, mode text, conds jsonb) on conflict do nothing`);
}

// 3. obligations, in chunks
// The fields already mapped to columns are not repeated; the rest (what to do, when, next step, links, legal clock...)
// travel in `extra`, so the generic Comply screen can show the same guidance as the dedicated ones.
const rawById: Record<string, Record<string, unknown>> = {};
for (const r of payments as unknown as Array<Record<string, unknown>>)
  rawById[`payments:${r.id}`] = { what_do: r.what_do, when: r.when, next: r.next, links: r.links, decision: r.decision, cta: r.cta, completion: r.completion, ui_placement: r.ui_placement, audit_note: r.audit_note };
for (const r of dlObl as unknown as Array<Record<string, any>>) // eslint-disable-line @typescript-eslint/no-explicit-any
  rawById[`digital_lending:${r.ID}`] = { legal_clock: r["Legal clock"], recipient: r.Recipient, do: r.guide?.do, when: r.guide?.when, domain: r.domain, source_url: r.sourceUrl };
for (const p of st.programmes) {
  const rows = p.obligations.map((o, i) => ({
    programme_id: p.id, ref: o.id, title: o.title, grp: o.group, obligation_type: o.type, source: o.source, guidance: o.guidance,
    evidence: o.evidence, applies: o.applies, status: "active", sort_order: i, extra: rawById[`${p.id}:${o.id}`] ?? {},
  }));
  const size = 30;
  for (let k = 0; k * size < rows.length; k++) {
    add(`05_obl_${p.id}_${String(k).padStart(2, "0")}`, `insert into prog_obligations (programme_id, ref, title, grp, obligation_type, source, guidance, evidence, applies, status, sort_order, extra)
select x.programme_id, x.ref, x.title, x.grp, x.obligation_type, x.source, x.guidance, x.evidence, x.applies, x.status, x.sort_order, x.extra
from jsonb_to_recordset(${json(rows.slice(k * size, (k + 1) * size))}) as x(programme_id text, ref text, title text, grp text, obligation_type text, source text, guidance text, evidence text, applies text, status text, sort_order int, extra jsonb)
on conflict (programme_id, ref) do nothing`);
  }
  const ev = p.events.map((e, i) => {
    const raw = p.id === "digital_lending" ? (dlEvents as Array<Record<string, unknown>>).find((r) => r.id === e.id) : undefined;
    return { programme_id: p.id, id: e.id, title: e.title, description: e.desc, obligation_refs: e.obligationIds, needs: e.needs, sort_order: i, extra: raw ? { cat: raw.cat, routes: raw.routes, fields: raw.fields, requires: raw.requires ?? null } : {} };
  });
  if (ev.length) add(`06_ev_${p.id}`, `insert into prog_events (programme_id, id, title, description, obligation_refs, needs, sort_order, extra)
select x.programme_id, x.id, x.title, x.description, x.obligation_refs, x.needs, x.sort_order, x.extra from jsonb_to_recordset(${json(ev)}) as x(programme_id text, id text, title text, description text, obligation_refs text[], needs jsonb, sort_order int, extra jsonb) on conflict do nothing`);
  const ct = p.controls.map((c, i) => ({ programme_id: p.id, id: c.id, title: c.title, obligation_refs: c.obligationIds, sort_order: i }));
  if (ct.length) add(`07_ctl_${p.id}`, `insert into prog_controls (programme_id, id, title, obligation_refs, sort_order)
select x.programme_id, x.id, x.title, x.obligation_refs, x.sort_order from jsonb_to_recordset(${json(ct)}) as x(programme_id text, id text, title text, obligation_refs text[], sort_order int) on conflict do nothing`);
}
console.log(files.sort().join("\n"));
