"use client";

import { createContext, useContext } from "react";
import type { WorkspaceAdapter } from "@/lib/comply/workspace";
import type { Clock, DLState, ExpertCtx, FileRef } from "@/lib/comply/digital-engine";
import { fileName } from "@/lib/comply/digital-engine";

export type DrawerState =
  | { kind: "guide"; id: string }
  | { kind: "obligation"; id: string }
  | { kind: "occurrence"; uid: string }
  | { kind: "control"; idx: number }
  | { kind: "eventStart" }
  | { kind: "event"; id: string }
  | { kind: "regulator" }
  | { kind: "profile" }
  | { kind: "expert"; ctx: ExpertCtx };

export type TabName = "dashboard" | "calendar" | "obligations" | "controls";

export interface AppApi {
  state: DLState;
  getState: () => DLState;
  clock: Clock;
  /** Replace the state document (marks it dirty so it is saved). */
  commit: (next: DLState) => void;
  /** Update a slice of UI state that is part of the document (filters/search). */
  patch: (p: Partial<DLState>) => void;
  adapter: WorkspaceAdapter;
  openDrawer: (d: DrawerState) => void;
  closeDrawer: () => void;
  goSetup: () => void;
  openEvidenceFile: (f: FileRef | string) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(AppContext);
  if (!v) throw new Error("AppContext missing");
  return v;
}

export function Info({ onClick, attr }: { onClick: () => void; attr?: Record<string, string> }) {
  return (
    <button type="button" className="info" aria-label="Requirement guidance" onClick={onClick} {...attr}>
      i
    </button>
  );
}

/** Saved evidence file name; opens through the adapter when stored in the bucket. */
export function SavedFileName({ file }: { file: FileRef | string }) {
  const { openEvidenceFile } = useApp();
  const name = fileName(file);
  const hasPath = typeof file !== "string" && !!file.path;
  if (!hasPath) return <>{name}</>;
  return (
    <button type="button" className="file-link" onClick={() => openEvidenceFile(file)}>
      {name}
    </button>
  );
}

export function SavedFileList({ files, empty }: { files: (FileRef | string)[]; empty: string }) {
  if (!files.length) return <>{empty}</>;
  return (
    <>
      {files.map((f, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          <SavedFileName file={f} />
        </span>
      ))}
    </>
  );
}

/** Inline replacement for the prototype's window.alert (same wording). */
export function InlineMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="note warn" role="alert" data-inline-message>
      {message}
    </div>
  );
}

export function filePlaceholder(f: File): FileRef {
  return { name: f.name, size: f.size, mime: f.type || "" };
}
