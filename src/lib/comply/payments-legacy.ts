// Pre-fills the Payments setup profile from an old `member_compliance_profile`
// row (the yes/no wizard the Comply module used before the Beacon rebuild) so a
// member with no workspace row yet does not start from a blank form. Only fields
// that map cleanly are carried over; the member still walks through the
// 3-step setup and confirms everything.
import { blankProfile, type Profile } from "./payments-engine";

export interface LegacyPaymentsProfile {
  is_pso?: string | null;
  is_psp?: string | null;
  is_instrument?: string | null;
  pso_class?: string | null;
  pso_band?: string | null;
  emi?: string | null;
  emi_band?: string | null;
  cards?: string | null;
  agent?: string | null;
  sfi?: string | null;
  participant?: string | null;
}

const yn = (v?: string | null): boolean | null => (v === "Yes" ? true : v === "No" ? false : null);

export function profileFromLegacy(row: LegacyPaymentsProfile | null | undefined): Profile | null {
  if (!row) return null;
  const p = blankProfile();
  let any = false;
  if (row.is_pso === "Yes") {
    p.categories.pso = true;
    any = true;
    if (row.pso_class === "funds_transfer") {
      if (row.pso_band && ["large", "medium", "small"].includes(row.pso_band)) p.psoClasses = [`funds_${row.pso_band}`];
    } else if (row.pso_class && ["clearing", "settlement", "third_party"].includes(row.pso_class)) {
      p.psoClasses = [row.pso_class];
    }
  }
  if (row.is_psp === "Yes") {
    p.categories.psp = true;
    any = true;
    p.pspClasses = [row.emi === "Yes" ? "emi" : "other_psp"];
    if (row.emi === "Yes" && row.emi_band) p.emiBand = row.emi_band;
  }
  if (row.is_instrument === "Yes") {
    p.categories.instrument = true;
    any = true;
    if (row.cards === "Yes") p.instrumentClasses = ["cards"];
  }
  p.agents = yn(row.agent);
  p.cards = yn(row.cards);
  p.participant = yn(row.participant);
  if (isEmiLegacy(row)) p.fiMdi = yn(row.sfi);
  return any ? p : null;
}

function isEmiLegacy(row: LegacyPaymentsProfile) {
  return row.is_psp === "Yes" && row.emi === "Yes";
}
