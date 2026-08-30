import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "FITSPA Compliance Platform",
  description:
    "Regulatory compliance platform for FITSPA members — obligations, licences, and regulator document library.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <div className="flex flex-1 flex-col">
          <header
            className="border-b"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/" className="flex items-baseline gap-2">
                <span
                  className="text-lg font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-serif)", color: "var(--color-primary)" }}
                >
                  FITSPA
                </span>
                <span className="hidden text-sm sm:inline" style={{ color: "var(--color-text-muted)" }}>
                  Compliance Platform
                </span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link className="btn btn-ghost" href="/search">Search</Link>
                <Link className="btn btn-ghost" href="/lookup">Member Lookup</Link>
                <Link className="btn btn-ghost" href="/wizard">Requirements Wizard</Link>
                <Link className="btn btn-ghost" href="/assistant">AI Assistant</Link>
                <span className="mx-1 hidden h-6 w-px sm:block" style={{ background: "var(--color-border)" }} />
                {user ? (
                  <Link className="btn btn-primary" href="/dashboard">My Dashboard</Link>
                ) : (
                  <>
                    <Link className="btn btn-ghost" href="/login">Member Login</Link>
                    <Link className="btn btn-primary" href="/signup">Join FITSPA</Link>
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
      </body>
    </html>
  );
}
