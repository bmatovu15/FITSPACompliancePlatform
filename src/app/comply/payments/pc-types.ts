import type { WorkspaceAdapter, StoredEvidenceFile } from "@/lib/comply/workspace";
import type { CalFilter, Clock, ObFilter, ObStateFilter, PcState, TabName, Task } from "@/lib/comply/payments-engine";

export type DrawerView =
  | { kind: "guide"; id: string }
  | { kind: "work"; id: string; taskKey: string | null }
  | { kind: "addEvidence" }
  | { kind: "event" }
  | { kind: "regulator" }
  | { kind: "expert"; contextId: string | null }
  | { kind: "question"; contextId: string | null }
  | { kind: "sent"; contextId: string | null }
  | { kind: "profile" };

export type Screen = "landing" | "licence" | "operating" | "baseline" | "app";

export interface PcCtx {
  state: PcState;
  update: (fn: (s: PcState) => PcState) => void;
  clock: Clock;
  tasks: Task[];
  adapter: WorkspaceAdapter;
  screen: Screen;
  setScreen: (s: Screen) => void;
  setupOrigin: "landing" | "app";
  setSetupOrigin: (o: "landing" | "app") => void;
  openDrawer: (view: DrawerView, back?: DrawerView | null) => void;
  closeDrawer: () => void;
  goTab: (tab: TabName) => void;
  obFilter: ObFilter;
  setObFilter: (f: ObFilter) => void;
  obStateFilter: ObStateFilter;
  setObStateFilter: (f: ObStateFilter) => void;
  calFilter: CalFilter;
  setCalFilter: (f: CalFilter) => void;
  obQuery: string;
  setObQuery: (q: string) => void;
  calQuery: string;
  setCalQuery: (q: string) => void;
  openEvidenceFile: (file: StoredEvidenceFile) => void;
  notify: (msg: string) => void;
  resetWorkspace: () => void;
}
