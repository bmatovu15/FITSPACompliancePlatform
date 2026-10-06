import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/current-member";
import { loadProgramme } from "@/lib/programmes/load";
import "../../beacon-theme.css";
import BeaconNav from "@/components/beacon-nav";
import GenericComplyClient from "./generic-comply-client";

// Comply for any regulator programme created by FITSPA staff in /admin/programmes. Everything on the screen
// (questions, obligations, rules, events, controls) comes from the database, so adding a regulator needs no code.
// The dedicated Payments, Digital Lending and Insurance screens are static routes and take precedence over this one.
export async function generateMetadata({ params }: { params: Promise<{ programme: string }> }) {
  const { programme } = await params;
  const data = await loadProgramme(programme);
  return { title: `${data?.programme.name ?? "Compliance"} | FITSPA Compliance Platform` };
}

export default async function GenericComplyPage({ params }: { params: Promise<{ programme: string }> }) {
  const { programme: id } = await params;
  const member = await requireMember();
  const supabase = await createClient();
  const data = await loadProgramme(id);
  if (!data || data.programme.screens !== "generic") notFound();
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (data.programme.status !== "published" && !isStaff) notFound();

  const { data: workspace } = await supabase
    .from("member_comply_workspace")
    .select("state, profile_set")
    .eq("member_id", member.id)
    .eq("module_key", id)
    .maybeSingle();

  return (
    <>
      <BeaconNav active="comply" backHref="/comply" backLabel="← Compliance" />
      <GenericComplyClient
        memberId={member.id}
        data={data}
        initialState={(workspace?.state as unknown) ?? null}
        draftPreview={data.programme.status !== "published"}
      />
    </>
  );
}
