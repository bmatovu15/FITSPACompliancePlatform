// Shared persistence for the FITSPA Compliance Platform "Comply" workspaces (Payments, Digital
// Lending). The design prototypes keep their whole state in one JSON document
// in localStorage; in production that same document lives in
// public.member_comply_workspace (one row per member + module), protected by
// row-level security, and evidence files go to the private
// `compliance-evidence` storage bucket. Components never talk to Supabase
// directly: they receive a `WorkspaceAdapter` so the same UI can run against
// an in-memory adapter in tests.
import { createClient } from "@/lib/supabase/client";

export type ComplyModuleKey = "payments" | "digital_lending";

export interface StoredEvidenceFile {
  path: string; // storage path inside the compliance-evidence bucket
  name: string;
  size: number;
  mime: string;
}

export interface WorkspaceAdapter {
  /** Persist the whole state document. Must be safe to call often (debounced by the caller). */
  save(state: unknown, profileSet: boolean): Promise<{ ok: boolean; error?: string }>;
  /** Upload an evidence file; returns the stored reference. */
  uploadEvidence(file: File): Promise<{ ok: true; file: StoredEvidenceFile } | { ok: false; error: string }>;
  /** Short-lived signed URL to open a stored file. */
  openEvidence(path: string): Promise<string | null>;
  /** Send an expert-support inquiry or compliance-review request. */
  sendExpertRequest(input: {
    kind: "question" | "compliance_review";
    message: string;
    contextKey?: string;
    contextLabel?: string;
  }): Promise<{ ok: boolean; error?: string }>;
}

export function createSupabaseWorkspaceAdapter(opts: {
  memberId: string;
  moduleKey: ComplyModuleKey;
  catalogKey: string;
  businessName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
}): WorkspaceAdapter {
  const supabase = createClient();
  const { memberId, moduleKey } = opts;
  return {
    async save(state, profileSet) {
      const { error } = await supabase.from("member_comply_workspace").upsert(
        {
          member_id: memberId,
          module_key: moduleKey,
          state: state as never,
          profile_set: profileSet,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "member_id,module_key" },
      );
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    async uploadEvidence(file) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
      const path = `${memberId}/${moduleKey}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage
        .from("compliance-evidence")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) return { ok: false, error: error.message };
      return { ok: true, file: { path, name: file.name, size: file.size, mime: file.type || "" } };
    },
    async openEvidence(path) {
      const { data } = await supabase.storage.from("compliance-evidence").createSignedUrl(path, 120);
      return data?.signedUrl ?? null;
    },
    async sendExpertRequest(input) {
      try {
        const res = await fetch("/api/expert-support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceModule: "comply",
            catalogKey: opts.catalogKey,
            contextKey: input.contextKey || "workspace",
            contextLabel: input.contextLabel,
            requestType: input.kind,
            message: input.message,
            businessName: opts.businessName ?? undefined,
            contactName: opts.contactName ?? undefined,
            contactEmail: opts.contactEmail ?? undefined,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          return { ok: false, error: j.error || `HTTP ${res.status}` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Network error" };
      }
    },
  };
}

/** In-memory adapter used by tests / the local verification harness. */
export function createMemoryWorkspaceAdapter(): WorkspaceAdapter & { saved: unknown[]; expert: unknown[] } {
  const saved: unknown[] = [];
  const expert: unknown[] = [];
  return {
    saved,
    expert,
    async save(state) {
      saved.push(JSON.parse(JSON.stringify(state)));
      return { ok: true };
    },
    async uploadEvidence(file) {
      return { ok: true, file: { path: `memory/${file.name}`, name: file.name, size: file.size, mime: file.type } };
    },
    async openEvidence() {
      return null;
    },
    async sendExpertRequest(input) {
      expert.push(input);
      return { ok: true };
    },
  };
}
