import { Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import DigitalLendingWizardClient from "./digital-lending-wizard-client";
import type { LicenceApplicationTemplate, LicenceApplicationWizardClass } from "@/lib/types";

export const metadata = {
  title: "Digital Lending Licence Application | Beacon",
  description:
    "Prepare a Money Lender or NDTMFI digital lending licence application — no login required. Pick your route, work through the requirements, and track your progress in this browser.",
};

// Montserrat is the Beacon design system's typeface; it was previously only
// named in CSS and never actually loaded. Scoped to this module via the
// --dl-montserrat variable on the .dl-apply wrapper (see digital-lending-apply.css).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--dl-montserrat",
  display: "swap",
});

const APPLICATION_KEY = "digital_lending";

// The Digital Lending "Apply" module: public, no-login, anonymous-by-default
// (member_id null on the underlying member_licence_applications row). The
// 21-item template catalogue and the 2 wizard classes (Money Lender / NDTMFI)
// are admin-authored reference data; this page reads them and hands them to
// the client, which owns all applicant-specific state. The module renders its
// own masthead per screen (as in the Beacon design), so no site nav is added here.
export default async function ApplyDigitalLendingPage() {
  const supabase = await createClient();

  const [{ data: templateRows }, { data: classRows }] = await Promise.all([
    supabase.from("licence_application_templates").select("*").eq("application_key", APPLICATION_KEY).order("seq", { ascending: true }),
    supabase.from("licence_application_wizard_classes").select("*").eq("application_key", APPLICATION_KEY).order("sort_order", { ascending: true }),
  ]);

  return (
    <div className={montserrat.variable}>
      <DigitalLendingWizardClient
        applicationKey={APPLICATION_KEY}
        templates={(templateRows ?? []) as LicenceApplicationTemplate[]}
        wizardClasses={(classRows ?? []) as LicenceApplicationWizardClass[]}
      />
    </div>
  );
}
