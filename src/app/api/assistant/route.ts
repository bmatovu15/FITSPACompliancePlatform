import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { askAssistant } from "@/lib/ingest";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "@/lib/server-config";

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: chunks, error } = await supabase.rpc("search_document_chunks", { q: question, limit_n: 6 });

  const usableChunks = (chunks ?? []).map((c: any) => ({
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

  const sources = (chunks ?? []).map((c: any) => ({
    title: c.doc_title,
    regulator: c.regulator_name,
    storage_path: c.storage_path,
    doc_kind: c.doc_kind,
  }));

  return NextResponse.json({ answer, sources, error: error?.message });
}
