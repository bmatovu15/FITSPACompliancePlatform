"use client";

import { useState } from "react";
import type {
  ComplianceCalendarTask,
  ComplianceControl,
  ComplianceEvent,
  ComplianceHoliday,
  ComplianceReminderRule,
  ComplianceWorkflowState,
} from "@/lib/types";
import TasksTab from "./tasks-tab";
import EventsTab from "./events-tab";
import ControlsTab from "./controls-tab";
import WorkflowStatesTab from "./workflow-states-tab";
import ReminderRulesTab from "./reminder-rules-tab";
import HolidaysTab from "./holidays-tab";

export type RegulatorOption = { id: string; name: string };

type Tab = "tasks" | "events" | "controls" | "workflow" | "reminders" | "holidays";

export default function ComplianceCalendarAdminClient({
  tasks,
  events,
  controls,
  workflowStates,
  reminderRules,
  holidays,
  regulators,
}: {
  tasks: ComplianceCalendarTask[];
  events: ComplianceEvent[];
  controls: ComplianceControl[];
  workflowStates: ComplianceWorkflowState[];
  reminderRules: ComplianceReminderRule[];
  holidays: ComplianceHoliday[];
  regulators: RegulatorOption[];
}) {
  const [tab, setTab] = useState<Tab>("tasks");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "tasks", label: "Calendar tasks", count: tasks.length },
    { key: "events", label: "Events", count: events.length },
    { key: "controls", label: "Controls", count: controls.length },
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
        {tab === "tasks" && <TasksTab initial={tasks} regulators={regulators} />}
        {tab === "events" && <EventsTab initial={events} regulators={regulators} />}
        {tab === "controls" && <ControlsTab initial={controls} regulators={regulators} />}
        {tab === "workflow" && <WorkflowStatesTab initial={workflowStates} />}
        {tab === "reminders" && <ReminderRulesTab initial={reminderRules} />}
        {tab === "holidays" && <HolidaysTab initial={holidays} />}
      </div>
    </div>
  );
}
