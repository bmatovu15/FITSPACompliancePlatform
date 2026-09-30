import Link from "next/link";
import ahStyles from "../apply-hub.module.css";
import { createClient } from "@/lib/supabase/server";
import DigitalLendingWizardClient from "./digital-lending-wizard-client";
import type {
  LicenceApplicationFeeTier,
  LicenceApplicationTemplate,
  LicenceApplicationWizardClass,
} from "@/lib/types";

export const metadata = {
  title: "Digital Lending application | FITSPA Compliance Platform",
  description:
    "Prepare a Money Lender or NDTMFI digital lending licence application — no login required. Pick your route, work through the requirements checklist, and track your progress in this browser.",
};

const APPLICATION_KEY = "digital_lending";

// The Digital Lending "Apply" wizard: public, no-login, anonymous-by-default
// (member_id null on the underlying member_licence_applications row -- RLS
// scopes access to knowing the row's own id, held in the visitor's
// localStorage). The 21-item template catalog, the 2 wizard classes (Money
// Lender / NDTMFI) and the 2 flat application-fee tiers are all seeded,
// admin-authored reference data -- this page just reads them and hands them
// to the client wizard, which owns all applicant-specific state. See
// strategy/beacon-template-redesign-plan.md §9.1 for the audited schema.
export default async function ApplyDigitalLendingPage() {
  const supabase = await createClient();

  const [{ data: templateRows }, { data: classRows }, { data: feeRows }] = await Promise.all([
    supabase
      .from("licence_application_templates")
      .select("*")
      .eq("application_key", APPLICATION_KEY)
      .order("seq", { ascending: true }),
    supabase
      .from("licence_application_wizard_classes")
      .select("*")
      .eq("application_key", APPLICATION_KEY)
      .order("sort_order", { ascending: true }),
    supabase
      .from("licence_application_fee_tiers")
      .select("*")
      .eq("application_key", APPLICATION_KEY)
      .order("sort_order", { ascending: true }),
  ]);

  const templates = (templateRows ?? []) as LicenceApplicationTemplate[];
  const wizardClasses = (classRows ?? []) as LicenceApplicationWizardClass[];
  const feeTiers = (feeRows ?? []) as LicenceApplicationFeeTier[];

  return (
    <div className={ahStyles.ahRoot} style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <header className={ahStyles["ah-nav"]}>
        <Link className={ahStyles["ah-brand"]} href="/" aria-label="FITSPA Compliance Platform home">
          <span className={ahStyles["ah-brand-mark"]} aria-hidden="true"></span>FITSPA Compliance Platform
        </Link>
        <nav className={ahStyles["ah-nav-links"]} aria-label="Primary">
          <button className={`${ahStyles["ah-nav-link"]} ${ahStyles.muted}`} type="button" disabled>
            Explore
          </button>
          <Link className={`${ahStyles["ah-nav-link"]} ${ahStyles.active}`} href="/apply">Apply</Link>
          <Link className={ahStyles["ah-nav-link"]} href="/comply">Comply</Link>
          <Link className={ahStyles["ah-nav-link"]} href="/assistant">AI Assistant</Link>
        </nav>
        <div className={ahStyles["ah-nav-actions"]}>
          <Link className={ahStyles["ah-nav-search"]} href="/lookup">Search a member</Link>
          <Link className={ahStyles["ah-nav-register"]} href="/signup">Register</Link>
          <Link className={ahStyles["ah-nav-back"]} href="/apply">← Applications</Link>
        </div>
      </header>
      <DigitalLendingWizardClient applicationKey={APPLICATION_KEY} templates={templates} wizardClasses={wizardClasses} feeTiers={feeTiers} />
    </div>
  );
}
