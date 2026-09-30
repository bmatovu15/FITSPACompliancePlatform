import Link from "next/link";
import ahStyles from "../apply-hub.module.css";
import { createClient } from "@/lib/supabase/server";
import PaymentsWizardClient from "./payments-wizard-client";
import type {
  LicenceApplicationFeeTier,
  LicenceApplicationTemplate,
  LicenceApplicationWizardClass,
} from "@/lib/types";

export const metadata = {
  title: "Payments application — Beacon | FITSPA Compliance Platform",
  description:
    "Prepare a Bank of Uganda payments licence application (PSO, PSP/EMI or payment instrument issuer) — no login required. Classify your business, work through the requirements checklist, and track your progress in this browser.",
};

const APPLICATION_KEY = "payments_nps";

// The Payments "Apply" wizard: public, no-login, anonymous-by-default (same
// pattern as Digital Lending -- member_id stays null on the underlying
// member_licence_applications row; RLS scopes access to knowing the row's own
// id, held in the visitor's localStorage). The 58-item template catalog, the
// 14 wizard classes (6 PSO transaction bands, 6 PSP/EMI trust-account bands,
// PSP-other, and the payment-instrument-issuer class) and the fee schedule
// are all seeded, admin-authored reference data -- this page just reads them
// and hands them to the client wizard, which owns all applicant-specific
// state (including the multi-select classification, stored in `facts`
// rather than the single `class_key` column since combined licences are
// allowed). See strategy/beacon-template-redesign-plan.md §9.5 for the
// audited Payments schema.
export default async function ApplyPaymentsPage() {
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
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <header className={ahStyles["ah-nav"]}>
        <Link className={ahStyles["ah-brand"]} href="/" aria-label="Beacon home">
          <span className={ahStyles["ah-brand-mark"]} aria-hidden="true"></span>Beacon
        </Link>
        <nav className={ahStyles["ah-nav-links"]} aria-label="Primary">
          <button className={`${ahStyles["ah-nav-link"]} ${ahStyles.muted}`} type="button" disabled>
            Explore
          </button>
          <Link className={`${ahStyles["ah-nav-link"]} ${ahStyles.active}`} href="/apply">Apply</Link>
          <Link className={ahStyles["ah-nav-link"]} href="/comply">Comply</Link>
        </nav>
        <Link className={ahStyles["ah-home"]} href="/apply">← Applications</Link>
      </header>
      <PaymentsWizardClient
        applicationKey={APPLICATION_KEY}
        templates={templates}
        wizardClasses={wizardClasses}
        feeTiers={feeTiers}
      />
    </div>
  );
}
