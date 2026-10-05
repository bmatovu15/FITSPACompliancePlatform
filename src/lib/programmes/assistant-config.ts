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

/**
 * One acronym per line, e.g. "NPS = National Payment System; National Payments System".
 * Also tolerates several acronyms on one line separated by semicolons ("BOU = Bank of Uganda; NPS = ..."):
 * a segment with "=" starts a new acronym, a segment without it is another spelling of the previous one.
 */
export function parseAcronyms(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of (text || "").split(/\r?\n/)) {
    let current: string | null = null;
    for (const segment of line.split(";")) {
      const m = segment.match(/^\s*([A-Za-z0-9-]{2,20})\s*(?:=|:)\s*(.+)$/);
      if (m) {
        current = m[1].toLowerCase();
        const phrase = m[2].trim().toLowerCase().replace(/"/g, "");
        if (phrase) (out[current] ??= []).push(phrase);
      } else if (current) {
        const phrase = segment.trim().toLowerCase().replace(/"/g, "");
        if (phrase) out[current].push(phrase);
      }
    }
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
