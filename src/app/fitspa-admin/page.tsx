import FitspaAdminGate from "./fitspa-admin-gate";

export const metadata = {
  title: "FITSPA Admin (demonstration) | FITSPA Compliance Platform",
  description:
    "A presentation sign-in and demonstration of how FITSPA manages every obligation and how those obligations appear on member pages. Sample data only.",
};

// Presentation demonstration of the FITSPA admin console. The sign-in is a
// cosmetic client-side gate with displayed demo credentials (not real auth). It
// has no database access: it runs on the published obligation catalogue plus
// sample members, and every change lives only in this browser tab.
export default function FitspaAdminPage() {
  return (
    <FitspaAdminGate />
  );
}
