import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAssistantConfig, type AssistantConfig } from "./assistant-config";

/** Reads every active regulator's website and acronyms. Never throws: the assistant must keep working if this fails. */
export async function loadAssistantConfig(supabase: SupabaseClient): Promise<AssistantConfig> {
  try {
    const { data } = await supabase.from("regulators").select("website,acronyms").eq("status", "Active");
    return buildAssistantConfig((data ?? []) as { website: string | null; acronyms: string | null }[]);
  } catch {
    return { domains: [], acronyms: {} };
  }
}
