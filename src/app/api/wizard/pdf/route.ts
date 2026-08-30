import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function POST(req: NextRequest) {
  const { licenceIds } = await req.json();
  if (!Array.isArray(licenceIds) || licenceIds.length === 0) {
    return NextResponse.json({ error: "licenceIds required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: licences } = await supabase.from("licences").select("id,name,regulator_id").in("id", licenceIds);
  const regulatorIds = Array.from(new Set((licences ?? []).map((l) => l.regulator_id)));
  const { data: regulators } = await supabase.from("regulators").select("id,name").in("id", regulatorIds);
  const regMap = new Map((regulators ?? []).map((r) => [r.id, r.name]));

  const { data: obligations } = await supabase
    .from("obligations")
    .select("*")
    .in("licence_id", licenceIds)
    .is("member_id", null)
    .eq("status", "Active");

  const { data: docs } = await supabase
    .from("documents")
    .select("title,doc_kind")
    .in("regulator_id", regulatorIds)
    .eq("status", "Published");

  const sorted = (obligations ?? []).slice().sort((a: any, b: any) => {
    const ra = regMap.get(a.regulator_id) ?? "";
    const rb = regMap.get(b.regulator_id) ?? "";
    return ra.localeCompare(rb) || a.title.localeCompare(b.title);
  });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 40;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function newPageIfNeeded(minY: number) {
    if (y < minY) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  page.drawText("FITSPA Compliance Platform", { x: margin, y, size: 10, font, color: rgb(0.42, 0.47, 0.32) });
  y -= 20;
  page.drawText("Regulatory Requirements Checklist", { x: margin, y, size: 18, font: bold });
  y -= 18;
  page.drawText(`Licence(s): ${(licences ?? []).map((l) => l.name).join(", ")}`, { x: margin, y, size: 10, font });
  y -= 14;
  page.drawText(`Generated: ${new Date().toISOString().slice(0, 10)}`, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 26;

  const colX = { reg: margin, title: margin + 90, freq: margin + 330, risk: margin + 430 };
  const colWidth = { title: 230, reg: 85 };

  newPageIfNeeded(80);
  page.drawText("Regulator", { x: colX.reg, y, size: 9, font: bold });
  page.drawText("Requirement", { x: colX.title, y, size: 9, font: bold });
  page.drawText("Frequency", { x: colX.freq, y, size: 9, font: bold });
  page.drawText("Risk", { x: colX.risk, y, size: 9, font: bold });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 12;

  if (sorted.length === 0) {
    page.drawText("No published requirements catalogued yet for this selection.", { x: margin, y, size: 10, font });
    y -= 16;
  }

  for (const o of sorted) {
    const regName = regMap.get(o.regulator_id) ?? "—";
    const titleLines = wrapText(o.title + (o.description ? ` — ${o.description}` : ""), font, 9, colWidth.title);
    const regLines = wrapText(regName, font, 9, colWidth.reg);
    const rowLines = Math.max(titleLines.length, regLines.length, 1);
    newPageIfNeeded(30 + rowLines * 11);

    regLines.forEach((l, i) => page.drawText(l, { x: colX.reg, y: y - i * 11, size: 9, font }));
    titleLines.forEach((l, i) => page.drawText(l, { x: colX.title, y: y - i * 11, size: 9, font }));
    page.drawText(o.frequency ?? (o.due_date ?? "—"), { x: colX.freq, y, size: 9, font });
    page.drawText(o.risk ?? "—", { x: colX.risk, y, size: 9, font });
    if (o.legal_ref) {
      page.drawText(`Ref: ${o.legal_ref}`, { x: colX.title, y: y - titleLines.length * 11, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    }
    if (o.penalty) {
      const penLines = wrapText(`Penalty: ${o.penalty}`, font, 8, colWidth.title);
      penLines.forEach((l, i) =>
        page.drawText(l, { x: colX.title, y: y - (titleLines.length + (o.legal_ref ? 1 : 0) + i) * 11, size: 8, font, color: rgb(0.6, 0.3, 0.2) })
      );
    }
    y -= (rowLines + (o.legal_ref ? 1 : 0) + (o.penalty ? 1 : 0)) * 11 + 10;
  }

  newPageIfNeeded(60 + (docs?.length ?? 0) * 14);
  y -= 10;
  page.drawText("Related documents & forms to download", { x: margin, y, size: 12, font: bold });
  y -= 16;
  if (!docs || docs.length === 0) {
    page.drawText("No published documents yet for these regulators.", { x: margin, y, size: 9, font });
  } else {
    for (const d of docs) {
      newPageIfNeeded(20);
      page.drawText(`• ${d.title} (${d.doc_kind})`, { x: margin, y, size: 9, font });
      y -= 14;
    }
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="fitspa-requirements-checklist.pdf"',
    },
  });
}
