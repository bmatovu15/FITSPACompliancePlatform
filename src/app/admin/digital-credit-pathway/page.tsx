import { createClient } from "@/lib/supabase/server";
import DigitalCreditPathwayAdminClient from "./digital-credit-pathway-admin-client";

export default async function DigitalCreditPathwayAdminPage() {
  const supabase = await createClient();
  const [{ data: requirements }, { data: fees }] = await Promise.all([
    supabase.from("digital_credit_requirements").select("*").order("seq"),
    supabase.from("digital_credit_fees").select("*").order("sort_order"),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>Digital Credit Licence Pathway</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Manage the checklist requirements and fee schedule that power the member-facing Digital Credit Licence Pathway tool.
      </p>
      <DigitalCreditPathwayAdminClient requirements={requirements ?? []} fees={fees ?? []} />
    </div>
  );
}
