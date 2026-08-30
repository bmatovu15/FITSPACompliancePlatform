import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chunkText, extractTextFromBuffer, proposeObligations } from "@/lib/ingest";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "@/lib/server-config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // The file itself is uploaded directly from the browser to Supabase Storage
  // (see documents-client.tsx) — this route only receives JSON metadata plus
  // the storage path and then reads the file back server-side. Vercel's
  // Serverless Functions enforce a hard ~4.5MB request-body cap that can't be
  // raised in code; routing large files through this route's own body (the
  // previous approach, using formData()) silently hung on anything bigger
  // than that (no server log at all — the platform edge drops it before the
  // function ever runs) and left the UI stuck on "Uploading & processing…"
  // forever since the client fetch had no error handling either.
  const body = await req.json().catch(() => null);
  const storagePath = body?.storagePath as string | undefined;
  const fileName = (body?.fileName as string | undefined) || "Untitled";
  const fileType = body?.fileType as string | undefined;
  const regulatorId = body?.regulatorId as string | undefined;
  const docKind = body?.docKind as string | undefined;
  const title = (body?.title as string) || fileName;
  if (!storagePath || !regulatorId || !docKind) {
    return NextResponse.json({ error: "storagePath, regulatorId and docKind are required" }, { status: 400 });
  }

  const { data: regulator } = await supabase.from("regulators").select("name").eq("id", regulatorId).single();

  const { data: fileBlob, error: dlErr } = await supabase.storage.from("regulatory-library").download(storagePath);
  if (dlErr || !fileBlob) {
    return NextResponse.json({ error: `could not read uploaded file from storage: ${dlErr?.message ?? "not found"}` }, { status: 500 });
  }
  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  void fileType;

  const text = await extractTextFromBuffer(buffer, ext);
  const hasText = text.replace(/\s+/g, "").length > 200;

  const { data: docRow, error: docErr } = await supabase
    .from("documents")
    .insert({
      regulator_id: regulatorId,
      title,
      doc_kind: docKind,
      status: "Published",
      storage_path: storagePath,
      file_name: fileName,
      ocr_status: hasText ? "done" : ext === "pdf" ? "pending" : "not_needed",
      index_status: hasText ? "indexed" : "failed",
    })
    .select()
    .single();
  if (docErr) return NextResponse.json({ error: `document insert failed: ${docErr.message}` }, { status: 500 });

  let chunkCount = 0;
  let obligationCount = 0;

  if (hasText) {
    const chunks = chunkText(text);
    chunkCount = chunks.length;
    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50).map((content, idx) => ({
        document_id: docRow.id,
        chunk_index: i + idx,
        content,
      }));
      await supabase.from("document_chunks").insert(batch);
    }

    const apiKey = OPENROUTER_API_KEY;
    if (apiKey && !["Form", "Checklist", "Reporting Template", "Template"].includes(docKind)) {
      const proposed = await proposeObligations({
        apiKey,
        model: OPENROUTER_MODEL,
        regulatorName: regulator?.name ?? "",
        title,
        text,
      });
      if (proposed.length) {
        const rows = proposed.map((o: any) => ({
          regulator_id: regulatorId,
          title: o.title || "Untitled obligation",
          legal_ref: o.legal_ref || null,
          description: o.description || null,
          frequency: o.frequency || null,
          penalty: o.penalty || null,
          risk: ["High", "Medium", "Low"].includes(o.risk) ? o.risk : null,
          requires_evidence: !!o.requires_evidence,
          source: "ai_extracted",
          source_document_id: docRow.id,
          status: "Pending Approval",
        }));
        const { error: obErr } = await supabase.from("obligations").insert(rows);
        if (!obErr) obligationCount = rows.length;
      }
    }
  }

  return NextResponse.json({
    document: docRow,
    hasText,
    chunkCount,
    obligationCount,
    note: !hasText && ext === "pdf" ? "This looks like a scanned PDF with no text layer — OCR needs to be run out-of-band before it can be indexed for search or AI extraction." : undefined,
  });
}
