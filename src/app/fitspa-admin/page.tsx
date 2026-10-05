import BeaconNav from "@/components/beacon-nav";
import FitspaAdminDemo from "./fitspa-admin-demo";

export const metadata = {
  title: "FITSPA Admin (demonstration) | FITSPA Compliance Platform",
  description:
    "A login-free demonstration of how FITSPA manages every obligation and how those obligations appear on member pages. Sample data only.",
};

// Public demonstration of the FITSPA admin console. It deliberately has no
// login and no database access: it runs on the published obligation catalogue
// plus sample members, and every change lives only in this browser tab.
export default function FitspaAdminPage() {
  return (
    <>
      <BeaconNav active="home" />
      <FitspaAdminDemo />
    </>
  );
}
