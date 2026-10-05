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
//
// Also backs the dedicated consultation-booking screen in each Apply flow's
// front-door assessment (landing -> wizard -> "activity isn't listed" triage
// -> speak to an expert). That screen's own template (`screen-expert`) only
// ever wrote to localStorage (`nps_expert_request_v1`) with a comment saying
// "In the live product, the request would be sent to the expert team" --
// this route is that real send. requestType defaults to "question" so every
// existing ad-hoc panel keeps behaving exactly as before; the booking screen
// passes requestType: "consultation_booking" plus the extra fields below.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    sourceModule,
    contextKey,
    contactName,
    contactEmail,
    message,
    requestType,
    businessName,
    contactPhone,
    preferredDate,
    preferredTime,
    catalogKey,
    applicationKey,
    contextLabel,
    applicationId,
    externalId,
  } = body ?? {};

  if (sourceModule !== "apply" && sourceModule !== "comply") {
    return NextResponse.json({ error: "sourceModule must be 'apply' or 'comply'" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  const resolvedRequestType =
    requestType === "consultation_booking" || requestType === "compliance_review" || requestType === "application_review"
      ? requestType
      : "question";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let memberId: string | null = null;
  if (user) {
    const { data: member } = await supabase.from("members").select("id").eq("auth_user_id", user.id).maybeSingle();
    memberId = member?.id ?? null;
  }

  const row = {
    member_id: memberId,
    source_module: sourceModule,
    context_key: typeof contextKey === "string" ? contextKey : "general",
    catalog_key: typeof catalogKey === "string" && catalogKey ? catalogKey : null,
    application_key: typeof applicationKey === "string" && applicationKey ? applicationKey : null,
    contact_name: typeof contactName === "string" ? contactName : null,
    contact_email: typeof contactEmail === "string" ? contactEmail : null,
    contact_phone: typeof contactPhone === "string" && contactPhone.trim() ? contactPhone.trim() : null,
    message: (typeof contextLabel === "string" && contextLabel ? `[${contextLabel}] ` : "") + message.trim(),
    request_type: resolvedRequestType,
    business_name: typeof businessName === "string" && businessName.trim() ? businessName.trim() : null,
    preferred_date: typeof preferredDate === "string" && preferredDate.trim() ? preferredDate.trim() : null,
    preferred_time: typeof preferredTime === "string" && preferredTime.trim() ? preferredTime.trim() : null,
  };

  // Optional application / requirement link (Digital Lending Apply). These
  // columns come from db/migrations/0110_*.sql; if they are not there yet the
  // row is still stored without them so no expert request is ever lost.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const link: Record<string, string> = {};
  if (typeof applicationId === "string" && UUID.test(applicationId)) link.application_id = applicationId;
  if (typeof externalId === "string" && externalId.trim()) link.external_id = externalId.trim().slice(0, 64);

  let { error } = await supabase.from("expert_support_requests").insert({ ...row, ...link });
  if (error && Object.keys(link).length > 0 && /application_id|external_id|column/i.test(`${error.message} ${error.code}`)) {
    ({ error } = await supabase.from("expert_support_requests").insert(row));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
