import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Backs the "Speak to an expert" panels on both the Apply hub (/apply) and
// the Comply hub (/comply) -- the template's own `ah-support-send` /
// `ch-support-send` handlers just show a fake client-side "captured"
// message with no backend at all. Per the confirmed decision in
// strategy/beacon-template-redesign-plan.md §8.4, these now land in the
// `expert_support_requests` table (Admin → Expert Requests queue + email
// notification are Phase 5 work; the row lands regardless so nothing sent
// through Beacon between now and then is lost).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sourceModule, contextKey, contactName, contactEmail, message } = body ?? {};

  if (sourceModule !== "apply" && sourceModule !== "comply") {
    return NextResponse.json({ error: "sourceModule must be 'apply' or 'comply'" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let memberId: string | null = null;
  if (user) {
    const { data: member } = await supabase.from("members").select("id").eq("auth_user_id", user.id).maybeSingle();
    memberId = member?.id ?? null;
  }

  const { error } = await supabase.from("expert_support_requests").insert({
    member_id: memberId,
    source_module: sourceModule,
    context_key: typeof contextKey === "string" ? contextKey : "general",
    contact_name: typeof contactName === "string" ? contactName : null,
    contact_email: typeof contactEmail === "string" ? contactEmail : null,
    message: message.trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
