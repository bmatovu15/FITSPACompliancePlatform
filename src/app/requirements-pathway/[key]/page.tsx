import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PathwayFee, PathwayRegulator, PathwayRequirement } from "@/lib/types";
import GenericPathwayClient from "./generic-pathway-client";

// The two regulators that already have a bespoke, hand-built wizard live at
// their own top-level routes and should never be served by the generic
// engine here.
const BESPOKE_ROUTES: Record<string, string> = {
  nps: "/nps-pathway",
  digital_credit: "/digital-credit-pathway",
};

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (BESPOKE_ROUTES[key]) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("pathway_regulators").select("title, subtitle").eq("key", key).maybeSingle();
  if (!data) return {};
  return {
    title: `${data.title} — FITSPA Compliance Platform`,
    description: data.subtitle || "Licence readiness checklist and fee estimate.",
  };
}

// Numeric columns come back from Postgres/Supabase as strings -- normalize
// once at the fetch boundary so the client component can trust PathwayFee's
// numeric fields.
function normalizeFee(row: any): PathwayFee {
  return {
    ...row,
    application_fee: row.application_fee === null ? null : Number(row.application_fee),
    licensing_fee: row.licensing_fee === null ? null : Number(row.licensing_fee),
    annual_fee: row.annual_fee === null ? null : Number(row.annual_fee),
    min_capital: row.min_capital === null ? null : Number(row.min_capital),
    amount: row.amount === null ? null : Number(row.amount),
  };
}

export default async function GenericPathwayPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  if (BESPOKE_ROUTES[key]) {
    redirect(BESPOKE_ROUTES[key]);
  }

  const supabase = await createClient();
  const [{ data: regulator }, { data: items }, { data: fees }, { data: { user } }] = await Promise.all([
    supabase.from("pathway_regulators").select("*").eq("key", key).maybeSingle(),
    supabase.from("pathway_requirements").select("*").eq("pathway_key", key).order("seq"),
    supabase.from("pathway_fees").select("*").eq("pathway_key", key).order("sort_order"),
    supabase.auth.getUser(),
  ]);

  const reg = regulator as PathwayRegulator | null;
  // Not found, or not published (see isPublished's note in the hub page) --
  // don't serve a wizard the hub wouldn't have linked to.
  if (!reg || reg.status !== "Active") {
    notFound();
  }

  return (
    <GenericPathwayClient
      regulator={reg}
      items={(items ?? []) as PathwayRequirement[]}
      fees={(fees ?? []).map(normalizeFee)}
      isLoggedIn={!!user}
    />
  );
}
