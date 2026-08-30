import type { SupabaseClient } from "@supabase/supabase-js";

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
  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.doc_title}${c.regulator_name ? ` — ${c.regulator_name}` : ""}]\n${c.content}`)
    .join("\n\n---\n\n");
  const prompt = `You are FITSPA's regulatory compliance assistant for Uganda's fintech sector. Answer the question using ONLY the source excerpts below — do not use outside knowledge. Cite sources inline like [Source 1]. If the excerpts don't contain the answer, say clearly that you don't have that in the indexed documents and suggest the person contact FITSPA — never guess.

SOURCES:
${context}

QUESTION: ${question}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.1 }),
    });
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      console.error("assistant call returned no content", res.status, JSON.stringify(json));
      return `Sorry, I couldn't generate a response just now. (debug: status=${res.status} body=${JSON.stringify(json).slice(0, 500)})`;
    }
    return content;
  } catch (e) {
    console.error("assistant call failed", e);
    return "Sorry, the AI assistant is temporarily unavailable.";
  }
}
