"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The FITSPA Admin console bar. Same black bar, brand mark, underline-on-active links and
// user/sign-out area as the /fitspa-admin demonstration, so the real admin and the
// demonstration read as one product. Primary sections sit in the bar; the older reference
// tools are under "More".
const MAIN: { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/programmes", label: "Programmes" },
  { href: "/admin/regulators", label: "Regulators" },
  { href: "/admin/licences", label: "Licences" },
  { href: "/admin/registrations", label: "Registry" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/documents", label: "Documents & AI" },
  { href: "/admin/obligations", label: "Obligations" },
];

const MORE: { href: string; label: string }[] = [
  { href: "/admin/verticals", label: "Fintech verticals" },
  { href: "/admin/requirements-pathway", label: "Requirements pathway" },
  { href: "/admin/nps-pathway", label: "NPS pathway" },
  { href: "/admin/digital-credit-pathway", label: "Digital credit pathway" },
  { href: "/admin/compliance-calendar", label: "Compliance calendar" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

export default function AdminBar({ email, activePath }: { email: string; activePath?: string }) {
  const livePath = usePathname() ?? "";
  const pathname = activePath ?? livePath;
  const moreActive = MORE.some((m) => isActive(pathname, m.href));
  const initials = (email.split("@")[0] || "FA").slice(0, 2).toUpperCase();

  return (
    <div className="ab-bar">
      <div className="ab-inner">
        <Link className="ab-brand" href="/admin">
          <span className="ab-mark" aria-hidden="true" />
          <span>
            FITSPA Admin
            <small>Regulatory console</small>
          </span>
        </Link>

        <nav className="ab-nav" aria-label="Admin sections">
          {MAIN.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`ab-link ${isActive(pathname, t.href) ? "ab-link-on" : ""}`}
              aria-current={isActive(pathname, t.href) ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
          <details className="ab-more">
            <summary className={`ab-link ${moreActive ? "ab-link-on" : ""}`}>More</summary>
            <div className="ab-menu">
              {MORE.map((m) => (
                <Link key={m.href} href={m.href} className={isActive(pathname, m.href) ? "ab-menu-on" : ""}>
                  {m.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <div className="ab-tools">
          <a className="ab-ghost" href="/" target="_blank" rel="noreferrer">Public site ↗</a>
          <span className="ab-user">
            <span className="ab-avatar" aria-hidden="true">{initials}</span>
            <span className="ab-email">{email}</span>
          </span>
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="ab-signout">Sign out</button>
          </form>
        </div>
      </div>
    </div>
  );
}
