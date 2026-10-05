import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askAssistantCombined, expandQueryForSearch } from "@/lib/ingest";
import {
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  OPENROUTER_FALLBACK_MODELS,
  GOOGLE_CSE_API_KEY,
  GOOGLE_CSE_ID,
} from "@/lib/server-config";
import { searchRegulatorWeb, type WebResult } from "@/lib/web-search";
import { loadAssistantConfig } from "@/lib/programmes/assistant-config-load";

type SearchChunkRow = {
  content: string;
  doc_title: string;
  doc_kind: string;
  regulator_name: string | null;
  storage_path: string | null;
};

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }

  const supabase = await createClient();
  // Expand recognised acronyms (PSP, EMI, BOU, UMRA, ...) into the full
  // terms the source Acts/regulations actually use before searching --
  // see expandQueryForSearch's comment in src/lib/ingest.ts for why this
  // matters: an acronym-only question used to surface irrelevant
  // word-dense Acts instead of the short, precise, actually-relevant
  // chunk. limit_n raised from 6 to 10 so the richer, better-targeted
  // candidate set still gives the LLM enough context once a genuinely
  // relevant chunk is a few ranks down rather than #1.
  // Regulators added by staff in the admin contribute their own website domain and acronyms here.
  const config = await loadAssistantConfig(supabase);
  const searchQuery = expandQueryForSearch(question, config.acronyms);

  // Every question now searches FITSPA's indexed documents AND the scoped
  // regulator-website search IN PARALLEL (your explicit choice: let the AI
  // pick the best of both, rather than only falling back to the web when
  // document retrieval comes up empty). Run together with Promise.all so
  // this doesn't cost extra latency over the old either/or design. Note:
  // this does mean every question now spends one Google Custom Search call
  // (100/day free quota) even when FITSPA's documents already answer it
  // well -- see strategy/ai-assistant-architecture.md for the quota
  // discussion. searchRegulatorWeb() already returns null gracefully if
  // GOOGLE_CSE_API_KEY/GOOGLE_CSE_ID aren't configured or the quota is
  // exhausted, in which case this is a no-op and the assistant behaves
  // exactly as it did on documents alone.
  const [{ data: chunks, error }, webResults] = await Promise.all([
    supabase.rpc("search_document_chunks", { q: searchQuery, limit_n: 10 }),
    searchRegulatorWeb({ apiKey: GOOGLE_CSE_API_KEY, searchEngineId: GOOGLE_CSE_ID, query: question, extraAllowedHosts: config.domains }),
  ]);

  const allChunks = (chunks ?? []) as SearchChunkRow[];
  const usableChunks = allChunks.map((c) => ({
    content: c.content,
    doc_title: c.doc_title,
    regulator_name: c.regulator_name,
  }));
  const usableWebResults: WebResult[] = webResults ?? [];

  const answer = await askAssistantCombined({
    apiKey: OPENROUTER_API_KEY,
    models: [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS],
    question,
    chunks: usableChunks,
    webResults: usableWebResults,
  });

  // Figure out which kind(s) of material the answer actually drew on by
  // parsing its own citation markers -- [Source N] for FITSPA's indexed
  // documents, [Web N] for the regulator-website results (see
  // askAssistantCombined's prompt in src/lib/ingest.ts, which requires this
  // citation convention). This is what lets the UI label an answer
  // "documents", "web", or "mixed" accurately, and show only the sources it
  // actually cited rather than every candidate retrieval happened to pull
  // in -- returning all 10 document candidates and 5 web candidates under a
  // two-sentence answer would read as noisy, hedging-across-many-sources
  // clutter instead of one precise, grounded answer.
  const citedDocIndexes = new Set(
    Array.from(answer.matchAll(/\[Source (\d+)\]/g)).map((m) => parseInt(m[1], 10) - 1)
  );
  const citedWebIndexes = new Set(
    Array.from(answer.matchAll(/\[Web (\d+)\]/g)).map((m) => parseInt(m[1], 10) - 1)
  );
  const hasDocCitations = citedDocIndexes.size > 0;
  const hasWebCitations = citedWebIndexes.size > 0;

  // sourceType drives the UI: a "mixed" answer shows both the normal
  // document-source list and the amber "web result" notice/list side by
  // side, so a member can always tell exactly which parts of an answer are
  // FITSPA-vetted and which came from the open web -- never silently
  // blended. When the answer has no parseable [Source N]/[Web N] markers at
  // all (the raw-excerpt fallback used when the AI summariser is
  // unavailable, or a genuine "not covered" response), fall back to
  // whatever was actually retrieved so the member can still see what was
  // searched, preferring documents since that's what the fallback itself
  // prefers (see rawExcerptFallback in src/lib/ingest.ts).
  let sourceType: "documents" | "web" | "mixed" | "none";
  if (hasDocCitations && hasWebCitations) sourceType = "mixed";
  else if (hasDocCitations) sourceType = "documents";
  else if (hasWebCitations) sourceType = "web";
  else sourceType = allChunks.length > 0 ? "documents" : usableWebResults.length > 0 ? "web" : "none";

  const citedChunks = hasDocCitations
    ? allChunks.filter((_, i) => citedDocIndexes.has(i))
    : sourceType === "documents"
      ? allChunks
      : [];
  const citedWebResults = hasWebCitations
    ? usableWebResults.filter((_, i) => citedWebIndexes.has(i))
    : sourceType === "web"
      ? usableWebResults
      : [];

  const sources = citedChunks.map((c) => ({
    title: c.doc_title,
    regulator: c.regulator_name,
    storage_path: c.storage_path,
    doc_kind: c.doc_kind,
  }));
  const webSources = citedWebResults.map((r) => ({ title: r.title, link: r.link }));

  return NextResponse.json({ answer, sources, sourceType, webSources, error: error?.message });
}
