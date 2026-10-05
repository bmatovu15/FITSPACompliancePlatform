"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The Beacon shell (home, /apply, /comply, /signup, /lookup, /login,
// /search) ships its own self-contained masthead per screen (bp-nav /
// ah-nav / ch-nav / su-nav in the ported template, now centralised as
// <BeaconNav /> -- see src/components/beacon-nav.tsx), so the legacy FITSPA
// site chrome below must not double up on top of it. /signup joined the
// Beacon shell in the Insurance round (superseding the narrower removal
// scope originally confirmed in strategy/beacon-template-redesign-plan.md
// §8.1), per an explicit request to keep the same UI template -- including
// the standard nav and "Search a member" -- on the signup page. /lookup,
// /login and /search joined in this round for the same reason, now that
// they share BeaconNav instead of each carrying their own copy of the
// masthead. /assistant joined in the same round too, so the AI Assistant
// page no longer swaps to a separate legacy header when you navigate to it
// from the Beacon nav. /dashboard and /admin are intentionally excluded:
// they keep this legacy authenticated chrome (sign-out, admin links) rather
// than the public Beacon shell.
function isBeaconShellRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/apply") ||
    pathname.startsWith("/comply") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/lookup") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/assistant") ||
    pathname.startsWith("/fitspa-admin")
  );
}

export default function SiteChrome({
  isSignedIn,
  children,
}: {
  isSignedIn: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (isBeaconShellRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="topbar-accent" />
      <header className="header-shell">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span
              className="text-lg font-bold tracking-tight"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-primary)" }}
            >
              FITSPA
            </span>
            <span
              className="hidden text-xs font-semibold uppercase tracking-wide sm:inline"
              style={{ color: "var(--color-accent)" }}
            >
              Compliance Platform
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link className="nav-link" href="/lookup">Member Lookup</Link>
            <Link className="nav-link" href="/assistant">AI Assistant</Link>
            <span className="mx-2 hidden h-6 w-px sm:block" style={{ background: "var(--color-border)" }} />
            {isSignedIn ? (
              <Link className="btn btn-primary" href="/dashboard">My Dashboard</Link>
            ) : (
              <>
                <Link className="nav-link" href="/login">Member Login</Link>
                {/* Same /login form as members -- it checks is_staff() after
                    sign-in and routes FITSPA staff to /admin automatically.
                    Shown separately so admins aren't hunting for the URL. */}
                <Link className="nav-link" href="/login">FITSPA Admin Login</Link>
                <Link className="btn btn-accent" href="/signup">Join FITSPA</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer
        className="border-t px-4 py-6 text-center text-sm sm:px-6"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
      >
        FITSPA Compliance Platform
      </footer>
    </div>
  );
}
