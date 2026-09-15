import { createClient } from "@/lib/supabase/server";
import DigitalCreditPathwayClient, {
  type DigitalCreditItem,
  type DigitalCreditFee,
} from "./digital-credit-pathway-client";

export const metadata = {
  title: "Digital Credit Licence Pathway — FITSPA Compliance Platform",
  description:
    "UMRA Tier 4 Microfinance Institutions and Money Lenders Act digital credit licence pathway — a phase-by-phase requirements map with fees for your route.",
};

export default async function DigitalCreditPathwayPage() {
  const supabase = await createClient();
  const [{ data: items }, { data: fees }, { data: { user } }] = await Promise.all([
    supabase.from("digital_credit_requirements").select("*").order("seq"),
    supabase.from("digital_credit_fees").select("*").order("sort_order"),
    supabase.auth.getUser(),
  ]);

  return (
    <DigitalCreditPathwayClient
      items={(items ?? []) as DigitalCreditItem[]}
      fees={(fees ?? []) as DigitalCreditFee[]}
      isLoggedIn={!!user}
    />
  );
}
