import "../beacon-theme.css";
import "./admin-shell.css";
import AdminBar from "@/components/admin-bar";
import { requireStaff } from "@/lib/current-member";

// The admin uses the same Beacon look as the rest of the platform and the /fitspa-admin
// demonstration: Montserrat, black and white, a dark console bar and underline tabs.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <div className="admin-shell bk">
      <AdminBar email={user.email ?? "admin"} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
