import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadApplyClasses, loadApplyTemplates, loadProgramme, loadReadinessCounts } from "@/lib/programmes/load";
import { readiness, readyScore } from "@/lib/programmes/readiness";
import OverviewTab from "./overview-tab";
import QuestionsTab from "./questions-tab";
import RulesTab from "./rules-tab";
import ObligationsTab from "./obligations-tab";
import EventsTab from "./events-tab";
import ControlsTab from "./controls-tab";
import ClassesTab from "./classes-tab";
import RequirementsTab from "./requirements-tab";
import RegulatorTab from "./regulator-tab";
import DocumentsTab, { type DocRow } from "./documents-tab";

export const metadata = { title: "Programme | FITSPA Admin" };

const TABS = [
  ["overview", "Overview & publish"],
  ["regulator", "Regulator & AI"],
  ["classes", "Classes & fees"],
  ["requirements", "Requirements"],
  ["questions", "Profile questions"],
  ["rules", "Applicability rules"],
  ["obligations", "Obligations"],
  ["events", "Events"],
  ["controls", "Control areas"],
  ["documents", "Documents"],
] as const;

export default async function ProgrammeAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some(([k]) => k === rawTab) ? (rawTab as (typeof TABS)[number][0]) : "overview";

  const data = await loadProgramme(id);
  if (!data) notFound();
  const { programme } = data;
  const readOnly = programme.screens === "dedicated";
  const key = programme.application_key;

  const supabase = await createClient();
  const [counts, classes, templates, docsRes] = await Promise.all([
    loadReadinessCounts(programme),
    key ? loadApplyClasses(key) : Promise.resolve([]),
    key ? loadApplyTemplates(key) : Promise.resolve([]),
    supabase.from("documents").select("id,title,doc_kind,audience,index_status,programme_id").eq("regulator_id", programme.regulator_id).order("created_at", { ascending: false }),
  ]);
  const items = readiness({ data, ...counts });
  const score = readyScore(items);

  return (
    <div>
      <p className="text-sm mb-5"><Link className="underline" href="/admin/programmes">← All programmes</Link></p>
      <h1 className="mt-3" style={{ fontFamily: "var(--font-serif)" }}>{programme.name}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`badge ${programme.status === "published" ? "badge-green" : "badge-amber"}`}>{programme.status === "published" ? "Published" : "Draft"}</span>
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{data.regulator?.name} · {score.done}/{score.total} ready</span>
      </div>

      <nav className="ab-tabs" aria-label="Programme sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/programmes/${id}?tab=${k}`} className={`ab-tab ${tab === k ? "ab-tab-on" : ""}`} aria-current={tab === k ? "page" : undefined}>{label}</Link>
        ))}
      </nav>

      <div className="mt-7">
        {tab === "overview" && <OverviewTab programme={programme} items={items} missingRequired={score.requiredMissing.length} />}
        {tab === "regulator" && <RegulatorTab regulator={data.regulator} />}
        {tab === "classes" && <ClassesTab applicationKey={key} classes={classes} />}
        {tab === "requirements" && <RequirementsTab applicationKey={key} phases={programme.phases} templates={templates} />}
        {tab === "questions" && <QuestionsTab programmeId={id} questions={data.questions} rules={data.rules} readOnly={readOnly} />}
        {tab === "rules" && <RulesTab programmeId={id} questions={data.questions} rules={data.rules} obligations={data.obligations} readOnly={readOnly} />}
        {tab === "obligations" && <ObligationsTab programmeId={id} obligations={data.obligations} rules={data.rules} readOnly={readOnly} />}
        {tab === "events" && <EventsTab programmeId={id} events={data.events} questions={data.questions} obligations={data.obligations} readOnly={readOnly} />}
        {tab === "controls" && <ControlsTab programmeId={id} controls={data.controls} obligations={data.obligations} readOnly={readOnly} />}
        {tab === "documents" && <DocumentsTab programmeId={id} regulatorId={programme.regulator_id} regulatorName={data.regulator?.name ?? ""} docs={(docsRes.data ?? []) as DocRow[]} />}
      </div>
    </div>
  );
}
