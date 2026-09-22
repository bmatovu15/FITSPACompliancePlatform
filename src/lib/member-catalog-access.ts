import type { createClient } from "@/lib/supabase/server";
import type { ComplianceCatalog } from "./types";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type MemberCatalogAccess = {
  // The catalogs this member should be offered -- narrowed to the
  // regulator(s) their recorded licence(s) fall under. A member licensed
  // only under BOU sees just the Payments assistant; one licensed only
  // under MRD sees just Digital Lending; one holding licences under both
  // regulators sees both.
  allowed: ComplianceCatalog[];
  // True once the member has at least one licence on file (any status --
  // this is about which regulator's obligations apply to their business,
  // not whether FITSPA has verified the licence number yet).
  hasLicenceOnFile: boolean;
  // True when the member has licence(s) on file but none of the matching
  // regulators have a published compliance assistant, or a member has no
  // licence on file at all -- in either case `allowed` falls back to every
  // catalog so the member isn't locked out, and the caller can show a note
  // explaining why nothing was narrowed.
  fellBackToAll: boolean;
};

// Looks up which regulator(s) a member is licensed under (via
// member_licences -> licences.regulator_id) and narrows the given catalog
// list to just the assistant(s) for those regulators. Not all members hold
// licences under every regulator FITSPA covers, so the Compliance Pathway
// Wizard and the Overview dashboard should only offer the assistant(s) that
// match what the member is actually licensed to do.
export async function getMemberCatalogAccess(
  supabase: ServerSupabaseClient,
  memberId: string,
  allCatalogs: ComplianceCatalog[]
): Promise<MemberCatalogAccess> {
  const { data: memberLicenceRows } = await supabase
    .from("member_licences")
    .select("licence_id, licences(regulator_id)")
    .eq("member_id", memberId);

  const regulatorIds = new Set<string>();
  (memberLicenceRows ?? []).forEach((row: { licences: { regulator_id: string | null } | { regulator_id: string | null }[] | null }) => {
    const licence = Array.isArray(row.licences) ? row.licences[0] : row.licences;
    if (licence?.regulator_id) regulatorIds.add(licence.regulator_id);
  });

  const hasLicenceOnFile = regulatorIds.size > 0;
  const matched = allCatalogs.filter((c) => c.regulator_id && regulatorIds.has(c.regulator_id));

  if (matched.length > 0) {
    return { allowed: matched, hasLicenceOnFile, fellBackToAll: false };
  }
  return { allowed: allCatalogs, hasLicenceOnFile, fellBackToAll: true };
}
