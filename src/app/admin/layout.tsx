import Link from "next/link";
import { requireStaff } from "@/lib/current-member";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-6 sm:flex-row">
        <aside className="sm:w-56 shrink-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            FITSPA Admin
          </p>
          <nav className="flex flex-col gap-1 text-sm">
            <Link className="btn btn-ghost justify-start" href="/admin">Overview</Link>
            <Link className="btn btn-ghost justify-start" href="/admin/regulators">Regulators</Link>
            <Link className="btn btn-ghost justify-start" href="/admin/licences">Licences</Link>
            <Link className="btn btn-ghost justify-start" href="/admin/registrations">Registry (member IDs)</Link>
            <Link className="btn btn-ghost justify-start" href="/admin/members">Members &amp; licences</Link>
            <Link className="btn btn-ghost justify-start" href="/admin/verticals">Fintech verticals</Link>
            <Link className="btn btn-ghost justify-start" href="/admin/documents">Documents</Link>
            <Link className="btn btn-ghost justify-start" href="/admin/obligations">Obligations</Link>
            <form action="/api/auth/signout" method="post">
              <button className="btn btn-ghost justify-start w-full text-left" type="submit">Sign out</button>
            </form>
          </nav>
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
