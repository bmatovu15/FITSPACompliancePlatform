// What the AI assistant knows about each regulator comes from the regulators table (website + acronyms, edited by
// FITSPA staff in /admin/programmes), so adding a regulator needs no code change. The built-in lists in web-search.ts
// and ingest.ts stay as the baseline; these values add to them.

/** "bou.or.ug, https://www.finance.go.ug/path" -> ["bou.or.ug", "finance.go.ug"] */
export function parseDomains(text: string): string[] {
  return (text || "")
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
    .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s));
}

/** One per line: "NPS = National Payment System; National Payments System" -> { nps: [...] } */
export function parseAcronyms(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of (text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9-]{2,20})\s*(?:=|:|-)\s*(.+)$/);
    if (!m) continue;
    const phrases = m[2].split(/;/).map((p) => p.trim().toLowerCase().replace(/"/g, "")).filter(Boolean);
    if (phrases.length) out[m[1].toLowerCase()] = phrases;
  }
  return out;
}

export interface AssistantConfig {
  domains: string[];
  acronyms: Record<string, string[]>;
}

type RegulatorSettings = { website: string | null; acronyms: string | null };

export function buildAssistantConfig(rows: RegulatorSettings[]): AssistantConfig {
  const domains = new Set<string>();
  const acronyms: Record<string, string[]> = {};
  for (const r of rows) {
    parseDomains(r.website ?? "").forEach((d) => domains.add(d));
    for (const [k, v] of Object.entries(parseAcronyms(r.acronyms ?? ""))) acronyms[k] = Array.from(new Set([...(acronyms[k] ?? []), ...v]));
  }
  return { domains: Array.from(domains), acronyms };
}
