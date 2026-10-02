// Scoped, regulator-only web search -- used as a fallback when FITSPA's own
// indexed documents don't really cover a question (see
// src/app/api/assistant/route.ts for the two trigger conditions). This is
// deliberately NOT a general web search: results are restricted to a
// hand-verified allowlist of official Ugandan regulator domains below, and
// every answer built from it is labelled as web-sourced and kept visually
// separate from FITSPA's own document-grounded answers (see
// assistant.module.css's .webNotice / page.tsx's sourceType handling) --
// never silently blended, so a member can always tell an answer came from
// an uploaded, FITSPA-vetted document versus the open web. Full reasoning:
// strategy/ai-assistant-architecture.md §6 in the project.
//
// Domains verified individually (web search, 2026-10-02) against each
// regulator's actual official site -- not guessed:
export const OFFICIAL_REGULATOR_DOMAINS: Record<string, string[]> = {
  "Bank of Uganda (BOU)": ["bou.or.ug"],
  "Microfinance Regulatory Department (MRD)": ["finance.go.ug"],
  "Insurance Regulatory Authority (IRA)": ["ira.go.ug"],
  "Capital Markets Authority (CMA)": ["cmauganda.co.ug"],
  "Financial Intelligence Authority (FIA)": ["fia.go.ug"],
  "National IT Authority – Uganda (NITA-U)": ["nita.go.ug"],
  "National Personal Data Protection Office (PDPO)": ["pdpo.go.ug"],
  "Uganda Communications Commission (UCC)": ["ucc.co.ug"],
  "Uganda Registration Services Bureau (URSB)": ["ursb.go.ug"],
  "Uganda Revenue Authority (URA)": ["ura.go.ug"],
};

// Which regulators FITSPA actually has indexed documents for today (BOU,
// MRD, IRA) vs. the 7 with none (everything else above). Checked live
// post-deploy, 2026-10-02: search_document_chunks's loose "any word
// matches" fallback pass (src/lib/ingest.ts's comment on
// expandQueryForSearch explains why that pass exists) will return SOME
// chunks for almost any realistic question against FITSPA's 500+-chunk
// corpus, even when none of them are actually about the regulator being
// asked about -- e.g. "What is the TIN registration process at URA?"
// returned 10 BOU/MRD/IRA chunks matched only on generic words like
// "registration" and "process". So "zero chunks retrieved" alone is NOT a
// reliable signal that a question isn't about one of the uncovered
// regulators -- route.ts also calls detectUncoveredRegulatorTrigger()
// below and prefers the web fallback whenever a question explicitly names
// one of the 7 uncovered regulators, regardless of what the full-text
// search's loose pass happened to match on.
const UNCOVERED_REGULATOR_TRIGGERS: Record<string, string[]> = {
  "Capital Markets Authority (CMA)": ["cma", "capital markets authority"],
  "Financial Intelligence Authority (FIA)": ["fia", "financial intelligence authority"],
  "National IT Authority – Uganda (NITA-U)": [
    "nita-u",
    "nitau",
    "nita",
    "national information technology authority",
  ],
  "National Personal Data Protection Office (PDPO)": [
    "pdpo",
    "data protection office",
    "personal data protection",
  ],
  "Uganda Communications Commission (UCC)": ["ucc", "communications commission"],
  "Uganda Registration Services Bureau (URSB)": ["ursb", "registration services bureau"],
  "Uganda Revenue Authority (URA)": ["ura", "revenue authority", "tax identification number"],
};

// Returns the display name of the uncovered regulator a question explicitly
// names (by acronym or full name), or null if none matched. Single-word
// triggers (acronyms) match as a whole word only, same approach as
// expandQueryForSearch in src/lib/ingest.ts; multi-word triggers match as a
// literal substring.
export function detectUncoveredRegulatorTrigger(question: string): string | null {
  const q = question.toLowerCase();
  const words = new Set(q.match(/[a-z0-9-]+/g) ?? []);
  for (const [regulator, triggers] of Object.entries(UNCOVERED_REGULATOR_TRIGGERS)) {
    for (const trigger of triggers) {
      if (trigger.includes(" ") ? q.includes(trigger) : words.has(trigger)) {
        return regulator;
      }
    }
  }
  return null;
}

const ALL_ALLOWED_HOSTS = Array.from(new Set(Object.values(OFFICIAL_REGULATOR_DOMAINS).flat()));

function hostAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return ALL_ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export type WebResult = { title: string; link: string; snippet: string };

// Calls Google's Custom Search JSON API against a Programmable Search
// Engine the user configures themselves (its own dashboard should already
// be set to search ONLY the regulator domains above -- see the setup steps
// given alongside this round's delivery). Returns null when not configured
// (GOOGLE_CSE_API_KEY/GOOGLE_CSE_ID unset) or on any error, same graceful-
// skip pattern as OPENROUTER_API_KEY elsewhere in this app -- callers treat
// null exactly like "no web result available" and fall through to the
// existing "not covered" message.
export async function searchRegulatorWeb(opts: {
  apiKey: string;
  searchEngineId: string;
  query: string;
}): Promise<WebResult[] | null> {
  const { apiKey, searchEngineId, query } = opts;
  if (!apiKey || !searchEngineId) return null;
  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", searchEngineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "5");
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("regulator web search failed with status", res.status);
      return null;
    }
    const json = await res.json();
    const items: unknown[] = Array.isArray(json?.items) ? json.items : [];
    // Defense in depth: the Programmable Search Engine should already be
    // scoped to only these sites in its own configuration -- this filter is
    // a second, code-level check so a misconfigured or drifted search
    // engine can never cause a non-official domain to end up in an answer.
    return items
      .filter((it): it is { link: string; title?: string; snippet?: string } => {
        const link = (it as { link?: unknown })?.link;
        return typeof link === "string" && hostAllowed(link);
      })
      .map((it) => ({
        title: String(it.title || it.link),
        link: String(it.link),
        snippet: String(it.snippet || ""),
      }));
  } catch (e) {
    console.error("regulator web search failed", e);
    return null;
  }
}

function hostnameOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

// Mirrors askAssistant()/localSearchAnswer() in src/lib/ingest.ts, but for
// web results instead of indexed document chunks -- same "no synthesis
// available, show the raw best match plainly labelled" honesty when there
// is no AI key, and the same single-precise-cited-answer prompt when there
// is one. The prompt explicitly requires the answer to say it's web-sourced
// (not an uploaded FITSPA document), so this is never visually or textually
// confusable with the grounded-document answer path.
export async function askAssistantFromWeb(opts: {
  apiKey: string;
  model: string;
  question: string;
  results: WebResult[];
}): Promise<string> {
  const { apiKey, model, question, results } = opts;
  if (results.length === 0) return "";

  if (!apiKey) {
    const best = results[0];
    return `FITSPA's indexed documents don't cover this, and the AI summariser isn't configured -- so here is the closest-matching result from the official ${hostnameOf(best.link)} website, unedited:

${best.snippet}

This is a raw web search result, not a written answer, and it is not one of FITSPA's indexed documents. Open the link for full context: ${best.link}`;
  }

  const context = results
    .map((r, i) => `[Web ${i + 1}: ${r.title} — ${r.link}]\n${r.snippet}`)
    .join("\n\n---\n\n");
  const prompt = `You are FITSPA's regulatory compliance assistant for Uganda's fintech sector. FITSPA's own indexed documents do not cover this question, so you are answering from official Ugandan regulator website search results instead. The member must be able to tell this answer is web-sourced, not from an uploaded FITSPA-vetted document.

Rules:
1. Answer using ONLY the web results below. Never use outside knowledge, never guess a figure or deadline not explicitly stated in them.
2. Give exactly one direct answer, as short as fully answering the question allows -- normally one to three sentences.
3. Cite the specific result(s) inline, like [Web 1].
4. Start the answer by plainly flagging that this came from the open web, not an uploaded FITSPA document -- e.g. "Based on the official regulator website (not one of FITSPA's indexed documents): ...".
5. If the results don't actually answer the question, say so plainly rather than guessing.

WEB RESULTS:
${context}

QUESTION: ${question}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.1 }),
    });
    if (!res.ok) {
      console.error("web-assistant call failed with status", res.status);
      const best = results[0];
      return `FITSPA's indexed documents don't cover this, and the AI summariser returned an error -- so here is the closest-matching result from the official ${hostnameOf(best.link)} website, unedited:

${best.snippet}

This is a raw web search result, not a written answer, and it is not one of FITSPA's indexed documents. Open the link for full context: ${best.link}`;
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    return content || "";
  } catch (e) {
    console.error("web-assistant call failed", e);
    return "";
  }
}
