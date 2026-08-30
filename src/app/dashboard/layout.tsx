import Link from "next/link";
import { requireMember } from "@/lib/current-member";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-6 sm:flex-row">
        <aside className="sm:w-56 shrink-0">
          <div className="card p-4">
            {member.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.logo_url} alt="" className="mb-2 h-10 w-10 rounded object-cover" />
            )}
            <p className="font-semibold text-sm">{member.company_name}</p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{member.status}</p>
          </div>
          <nav className="mt-4 flex flex-col gap-1 text-sm">
            <Link className="btn btn-ghost justify-start" href="/dashboard">Overview</Link>
            <Link className="btn btn-ghost justify-start" href="/dashboard/licences">My licences</Link>
            <Link className="btn btn-ghost justify-start" href="/dashboard/vault">Document vault</Link>
            <Link className="btn btn-ghost justify-start" href="/assistant">AI assistant</Link>
            <form action="/api/auth/signout" method="post">
              <button className="btn btn-ghost justify-start w-full text-left" type="submit">Sign out</button>
            </form>
          </nav>
        </aside>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
