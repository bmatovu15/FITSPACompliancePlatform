"use client";

import { useState } from "react";
import type {
  ComplianceCalendarTask,
  ComplianceCatalogFee,
  ComplianceControl,
  ComplianceEvent,
  ComplianceHoliday,
  ComplianceReminderRule,
  ComplianceWorkflowState,
  Obligation,
  SourceRegister,
} from "@/lib/types";
import TasksTab from "./tasks-tab";
import EventsTab from "./events-tab";
import ControlsTab from "./controls-tab";
import WorkflowStatesTab from "./workflow-states-tab";
import ReminderRulesTab from "./reminder-rules-tab";
import HolidaysTab from "./holidays-tab";
import FeesTab from "./fees-tab";
import SourceRegistersTab from "./source-registers-tab";
import ObligationsTab from "./obligations-tab";

export type RegulatorOption = { id: string; name: string };

type Tab = "tasks" | "events" | "controls" | "workflow" | "reminders" | "holidays" | "fees" | "sources" | "obligations";

export default function ComplianceCalendarAdminClient({
  catalogKey,
  tasks,
  events,
  controls,
  workflowStates,
  reminderRules,
  holidays,
  regulators,
  fees,
  sourceRegisters,
  obligations,
}: {
  catalogKey: string;
  tasks: ComplianceCalendarTask[];
  events: ComplianceEvent[];
  controls: ComplianceControl[];
  workflowStates: ComplianceWorkflowState[];
  reminderRules: ComplianceReminderRule[];
  holidays: ComplianceHoliday[];
  regulators: RegulatorOption[];
  fees: ComplianceCatalogFee[];
  sourceRegisters: SourceRegister[];
  obligations: Obligation[];
}) {
  const [tab, setTab] = useState<Tab>("tasks");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "tasks", label: "Calendar tasks", count: tasks.length },
    { key: "events", label: "Events", count: events.length },
    { key: "controls", label: "Controls", count: controls.length },
    { key: "fees", label: "Fees", count: fees.length },
    { key: "sources", label: "Source registers", count: sourceRegisters.length },
    { key: "obligations", label: "Obligations", count: obligations.length },
    { key: "workflow", label: "Workflow states", count: workflowStates.length },
    { key: "reminders", label: "Reminder rules", count: reminderRules.length },
    { key: "holidays", label: "Holidays", count: holidays.length },
  ];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "tasks" && <TasksTab initial={tasks} regulators={regulators} catalogKey={catalogKey} />}
        {tab === "events" && <EventsTab initial={events} regulators={regulators} catalogKey={catalogKey} />}
        {tab === "controls" && <ControlsTab initial={controls} regulators={regulators} catalogKey={catalogKey} />}
        {tab === "fees" && <FeesTab initial={fees} catalogKey={catalogKey} />}
        {tab === "sources" && <SourceRegistersTab initial={sourceRegisters} catalogKey={catalogKey} />}
        {tab === "obligations" && <ObligationsTab initial={obligations} catalogKey={catalogKey} regulators={regulators} />}
        {tab === "workflow" && <WorkflowStatesTab initial={workflowStates} />}
        {tab === "reminders" && <ReminderRulesTab initial={reminderRules} />}
        {tab === "holidays" && <HolidaysTab initial={holidays} />}
      </div>
    </div>
  );
}
