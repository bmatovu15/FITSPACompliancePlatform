import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askAssistant, expandQueryForSearch } from "@/lib/ingest";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL, GOOGLE_CSE_API_KEY, GOOGLE_CSE_ID } from "@/lib/server-config";
import { searchRegulatorWeb, askAssistantFromWeb, detectUncoveredRegulatorTrigger } from "@/lib/web-search";

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
  const searchQuery = expandQueryForSearch(question);
  const { data: chunks, error } = await supabase.rpc("search_document_chunks", { q: searchQuery, limit_n: 10 });

  const usableChunks = ((chunks ?? []) as SearchChunkRow[]).map((c) => ({
    content: c.content,
    doc_title: c.doc_title,
    regulator_name: c.regulator_name,
  }));

  const answer = await askAssistant({
    apiKey: OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL,
    question,
    chunks: usableChunks,
  });

  const allChunks = (chunks ?? []) as SearchChunkRow[];
  // Surface only the sources the answer actually cites (parsed from its
  // "[Source N]" markers), not every candidate chunk retrieval happened to
  // pull in -- returning all 10 candidates as "sources" under a two-
  // sentence answer read as noisy and made the assistant look like it was
  // hedging across many documents instead of giving one precise, grounded
  // answer. Falls back to every retrieved chunk only if the answer cited
  // none (e.g. a "not covered" response still worth showing what was
  // searched) or isn't in the expected "[Source N]" form (the local,
  // no-LLM fallback already cites exactly its one excerpt as "Source 1").
  const citedIndexes = new Set(
    Array.from(answer.matchAll(/\[Source (\d+)\]/g)).map((m) => parseInt(m[1], 10) - 1)
  );
  const citedChunks = citedIndexes.size > 0 ? allChunks.filter((_, i) => citedIndexes.has(i)) : allChunks;

  const sources = citedChunks.map((c) => ({
    title: c.doc_title,
    regulator: c.regulator_name,
    storage_path: c.storage_path,
    doc_kind: c.doc_kind,
  }));

  // Scoped web-search fallback. Two trigger conditions, both needed because
  // of something confirmed live post-deploy: search_document_chunks's loose
  // "any word matches" fallback pass (see expandQueryForSearch's comment in
  // src/lib/ingest.ts) will return SOME chunks for almost any realistic
  // question against FITSPA's 500+-chunk corpus, even when none of them
  // are actually about the regulator being asked about -- e.g. "What is
  // the TIN registration process at URA?" matched 10 BOU/MRD/IRA chunks on
  // generic words like "registration", none of them about URA at all. So
  // "zero chunks retrieved" alone badly under-triggers this fallback for
  // real questions about the 7 regulators with no indexed documents (CMA,
  // FIA, NITA-U, PDPO, UCC, URSB, URA -- see
  // strategy/ai-assistant-architecture.md §2/§6 in the project).
  //
  // 1. usableChunks.length === 0 -- retrieval found literally nothing
  //    (askAssistant() above already returned its fixed "I couldn't find
  //    anything..." message in that case).
  // 2. detectUncoveredRegulatorTrigger(question) matches -- the question
  //    explicitly names one of the 7 uncovered regulators by acronym or
  //    name. When this matches, the web fallback is PREFERRED over
  //    whatever document chunks were retrieved, since we know with
  //    certainty those chunks aren't really about the regulator asked
  //    about, however they happened to match on generic words.
  //
  // Neither condition touches the well-covered BOU/MRD/IRA document-
  // grounded path for a question that doesn't name one of the 7 uncovered
  // regulators -- that path (the answer/sources computed above) is
  // completely unaffected and returned unchanged. searchRegulatorWeb()
  // restricts results to a hand-verified allowlist of official regulator
  // domains (never a general web search) and returns null if
  // GOOGLE_CSE_API_KEY/GOOGLE_CSE_ID aren't configured, in which case this
  // whole block is a no-op and the original document-grounded answer/
  // sources above are returned unchanged.
  const uncoveredRegulator = detectUncoveredRegulatorTrigger(question);
  if (usableChunks.length === 0 || uncoveredRegulator) {
    const webResults = await searchRegulatorWeb({
      apiKey: GOOGLE_CSE_API_KEY,
      searchEngineId: GOOGLE_CSE_ID,
      query: question,
    });
    if (webResults && webResults.length > 0) {
      const webAnswer = await askAssistantFromWeb({
        apiKey: OPENROUTER_API_KEY,
        model: OPENROUTER_MODEL,
        question,
        results: webResults,
      });
      if (webAnswer) {
        return NextResponse.json({
          answer: webAnswer,
          sources: [],
          sourceType: "web",
          webSources: webResults.map((r) => ({ title: r.title, link: r.link })),
        });
      }
    }
  }

  return NextResponse.json({ answer, sources, sourceType: "documents", error: error?.message });
}
