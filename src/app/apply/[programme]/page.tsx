import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadApplyClasses, loadApplyTemplates, loadProgramme } from "@/lib/programmes/load";
import BeaconNav from "@/components/beacon-nav";
import GenericApplyClient from "./generic-apply-client";

// Apply for any regulator programme created by FITSPA staff. Public and anonymous like the dedicated wizards:
// progress is stored against an application row whose id the visitor keeps in this browser.
export async function generateMetadata({ params }: { params: Promise<{ programme: string }> }) {
  const { programme } = await params;
  const data = await loadProgramme(programme);
  return { title: `Apply: ${data?.programme.name ?? "Licence"} | FITSPA Compliance Platform` };
}

export default async function GenericApplyPage({ params }: { params: Promise<{ programme: string }> }) {
  const { programme: id } = await params;
  const data = await loadProgramme(id);
  if (!data || data.programme.screens !== "generic" || !data.programme.application_key) notFound();
  const supabase = await createClient();
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (data.programme.status !== "published" && !isStaff) notFound();
  const key = data.programme.application_key;
  const [classes, templates] = await Promise.all([loadApplyClasses(key), loadApplyTemplates(key)]);

  return (
    <>
      <BeaconNav active="apply" backHref="/apply" backLabel="← Applications" />
      <GenericApplyClient
        applicationKey={key}
        programmeName={data.programme.name}
        regulatorName={data.regulator?.name ?? ""}
        blurb={data.programme.blurb}
        phases={data.programme.phases}
        classes={classes}
        templates={templates.filter((t) => !t.workspace_hidden)}
        draftPreview={data.programme.status !== "published"}
      />
    </>
  );
}
