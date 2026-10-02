import type { SupabaseClient } from "@supabase/supabase-js";

// Uganda fintech/regulatory acronyms that show up constantly in questions
// ("What are BOU's capital requirements for a PSP licence?") but almost
// never appear as literal acronyms in the source Acts/regulations/forms
// themselves -- those spell the term out in full ("Payment Service
// Provider", "electronic money issuer", ...). search_document_chunks does
// plain PostgreSQL full-text search (websearch_to_tsquery), which only
// matches literal words, so an acronym-only question used to fall straight
// through to its "loose OR" fallback branch and surface whatever long,
// word-dense Act happened to share a few common words with the question
// (e.g. "licence", "requirements") instead of the short, precise,
// genuinely relevant chunk. Expanding known acronyms into " OR <full term>"
// clauses before the query reaches websearch_to_tsquery fixes this at the
// query layer, with no change to the ranking function itself needed --
// confirmed directly against the live index: the unexpanded question
// "What are BOU's capital requirements for a PSP licence?" surfaced the
// Tier-4 Microfinance/Money Lenders Act and the Financial Institutions Act
// (both irrelevant); expanding "PSP" alone surfaces the National Payments
// Systems Act and the BOU minimum-capital checklist (the actually correct
// sources) instead.
const REGULATORY_ACRONYMS: Record<string, string[]> = {
  psp: ["payment service provider"],
  pso: ["payment system operator"],
  emi: ["electronic money issuer"],
  nps: ["national payment system", "national payments system"],
  mdi: ["microfinance deposit-taking institution"],
  ndtmfi: ["non-deposit-taking microfinance institution", "non deposit taking microfinance institution"],
  bou: ["bank of uganda"],
  umra: ["uganda microfinance regulatory authority"],
  mrd: ["microfinance regulatory department"],
  kyc: ["know your customer"],
  aml: ["anti-money laundering", "anti money laundering"],
  cft: ["combating the financing of terrorism"],
  fia: ["financial intelligence authority"],
  "nita-u": ["national information technology authority"],
  nitau: ["national information technology authority"],
  ira: ["insurance regulatory authority"],
  hmo: ["health membership organisation", "health membership organization"],
  cdfi: ["community development finance institution"],
};

// Expands recognised acronyms in a user's question into extra
// websearch_to_tsquery OR-clauses, so a question phrased in acronyms still
// matches source documents that only ever spell the term out in full. Only
// appends clauses for acronyms actually present (as a whole word) in the
// question, so an unrelated question isn't padded with noise. Safe against
// quote-breaking: expansion phrases are our own fixed strings, never
// user input.
export function expandQueryForSearch(question: string): string {
  const seen = new Set<string>();
  const extra: string[] = [];
  const words = question.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
  for (const w of words) {
    const expansions = REGULATORY_ACRONYMS[w];
    if (!expansions) continue;
    for (const phrase of expansions) {
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      extra.push(`OR "${phrase}"`);
    }
  }
  if (extra.length === 0) return question;
  return `${question} ${extra.join(" ")}`;
}

export function chunkText(text: string, size = 1600, overlap = 200): string[] {
  // Collapse whitespace runs to a single space. This used to be
  // `text.replace(/ /g, "")`, which deleted every space character outright
  // instead of collapsing them -- every chunk got stored as one run-on word
  // ("PriortoapplyingtotheBankofUganda...") with no word boundaries at all.
  // That silently broke full-text search (search_document_chunks tokenizes
  // on words) and fed garbled text to the LLM for obligation extraction and
  // the assistant, without ever raising an error.
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    chunks.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - overlap;
  }
  return chunks.filter((c) => c.trim().length > 30);
}

export async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string> {
  if (ext === "pdf") {
    try {
      // unpdf wraps pdfjs-dist with the polyfills it needs to run in a
      // Node serverless runtime (no DOM/canvas available) — the plain
      // "pdf-parse" package fails there with "DOMMatrix is not defined".
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return text || "";
    } catch (e) {
      console.error("pdf text extraction failed", e);
      return "";
    }
  }
  if (ext === "xlsx" || ext === "xls") {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      const lines: string[] = [];
      for (const sheetName of wb.SheetNames) {
        lines.push(`### Sheet: ${sheetName}`);
        const sheet = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        for (const row of rows) {
          const cells = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
          if (cells.length) lines.push(cells.join(" | "));
        }
      }
      return lines.join("\n");
    } catch (e) {
      console.error("xlsx parse failed", e);
      return "";
    }
  }
  return "";
}

export async function proposeObligations(opts: {
  apiKey: string;
  model: string;
  regulatorName: string;
  title: string;
  text: string;
}): Promise<any[]> {
  const { apiKey, model, regulatorName, title, text } = opts;
  const excerpt = text.slice(0, 12000);
  if (!excerpt.trim()) return [];
  const prompt = `You are a compliance analyst. Read this excerpt from "${title}" (a ${regulatorName} regulatory document for Uganda's fintech sector). Extract concrete, ongoing COMPLIANCE OBLIGATIONS a licensed fintech must meet (reporting duties, capital/reserve requirements, notification duties, conduct rules, record-keeping, etc). For each obligation return JSON with fields: title (short), legal_ref (section/clause number if visible, else null), description (1-3 sentences, grounded only in the text), frequency (e.g. "Annual", "Quarterly", "One-time", "Ongoing", or null), penalty (only if the text states one, else null), risk ("High","Medium","Low" - your best judgement), requires_evidence (boolean). Return ONLY a JSON array, max 12 items, no prose. If nothing concrete is found, return [].

TEXT:
"""
${excerpt}
"""`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0 }),
    });
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || "[]";
    const match = content.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(match ? match[0] : content);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("LLM extraction failed", e);
    return [];
  }
}

// Builds a usable answer straight from the indexed document chunks, with no
// LLM call at all. Used whenever OpenRouter is unreachable, out of credits,
// or not configured -- the assistant should still surface real, cited
// material from whatever has been indexed (currently BOU and MRD/UMRA
// documents) rather than just apologizing. Deliberately returns exactly
// ONE excerpt (the single best-ranked match), not a dump of the top 5 --
// the whole point of this assistant is "ask a question, get one precise
// answer", and a pile of unedited raw passages (even cited ones) reads as
// noise and undermines trust even when synthesis genuinely isn't
// available. search_document_chunks already orders by relevance, so
// chunks[0] is the engine's best guess; surface that one, clearly labelled
// as raw indexed text rather than a written answer, and point the person
// at the Obligations/Fees tabs or the document itself for the rest.
function localSearchAnswer(
  chunks: { content: string; doc_title: string; regulator_name: string | null; storage_path?: string | null }[],
  reason: string
): string {
  const best = chunks[0];
  const label = `${best.doc_title}${best.regulator_name ? ` — ${best.regulator_name}` : ""}`;
  const snippet = best.content.length > 900 ? `${best.content.slice(0, 900)}...` : best.content;
  return `The AI summariser is temporarily unavailable (${reason}), so here is the single closest-matching passage from FITSPA's indexed regulator documents, unedited:

[${label}]
${snippet}

This is raw indexed text, not a written answer -- it may not fully answer your question. Open the source document for the full context, or try again shortly once the summariser is back.`;
}

export async function askAssistant(opts: {
  apiKey: string;
  model: string;
  question: string;
  chunks: { content: string; doc_title: string; regulator_name: string | null }[];
}): Promise<string> {
  const { apiKey, model, question, chunks } = opts;
  if (chunks.length === 0) {
    return "I couldn't find anything in the indexed regulator documents that answers this. Please rephrase, or contact FITSPA directly for a tailored answer.";
  }

  // No key configured at all -- go straight to the local index, no point
  // attempting a call that can't succeed.
  if (!apiKey) {
    return localSearchAnswer(chunks, "no AI API key configured");
  }

  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.doc_title}${c.regulator_name ? ` — ${c.regulator_name}` : ""}]\n${c.content}`)
    .join("\n\n---\n\n");
  // Tightened for a single, precise, directly-usable answer rather than a
  // hedged survey of possibilities: give the one correct answer the
  // sources support, state the number/threshold/deadline/condition exactly
  // as written (don't round or paraphrase a figure), and keep it to the
  // shortest form that fully answers the question -- a sentence or two,
  // or a short list only when the question genuinely asks for multiple
  // items (e.g. "what documents do I need"). Still grounded-only and still
  // cited, so it stays verifiable rather than just terser.
  const prompt = `You are FITSPA's regulatory compliance assistant for Uganda's fintech sector. A member is asking a specific compliance question and needs ONE precise, directly usable answer -- not a survey of possibilities, not multiple interpretations, not hedging.

Rules:
1. Answer using ONLY the source excerpts below. Never use outside knowledge, and never guess or estimate a figure, threshold, or deadline that isn't explicitly stated in the excerpts.
2. Give exactly one direct answer to the question asked. State any number, currency amount, percentage, or deadline exactly as written in the source -- don't round, average, or approximate it.
3. Cite the specific source(s) the answer comes from inline, like [Source 1]. If the answer draws on more than one source, cite all of them.
4. Keep the answer as short as fully answering the question allows -- normally one to three sentences. Only use a short list if the question itself asks for multiple distinct items (e.g. "what documents are required").
5. If the excerpts partially answer the question, answer the part they support and say plainly what's missing -- don't fill the gap with outside knowledge.
6. If the excerpts don't contain the answer at all, say clearly that this isn't in FITSPA's indexed documents and suggest the person contact FITSPA directly -- never guess.

SOURCES:
${context}

QUESTION: ${question}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.1 }),
    });
    if (!res.ok) {
      // Covers the 402 "insufficient credits" case (and any other non-2xx
      // response) -- fall back to the local index instead of surfacing raw
      // billing errors to end users. Logs the real status for diagnosis
      // (check Vercel runtime logs for "assistant call failed with
      // status") but shows end users a plain-language reason instead of a
      // raw HTTP code.
      console.error("assistant call failed with status", res.status);
      const reason = res.status === 402 ? "the AI service's usage credit is exhausted" : "the AI service returned an error";
      return localSearchAnswer(chunks, reason);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      console.error("assistant call returned no content", res.status, JSON.stringify(json));
      return localSearchAnswer(chunks, "the AI service returned an empty response");
    }
    return content;
  } catch (e) {
    console.error("assistant call failed", e);
    return localSearchAnswer(chunks, "the AI service is temporarily unreachable");
  }
}
