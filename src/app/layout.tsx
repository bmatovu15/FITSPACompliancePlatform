import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import SiteChrome from "@/components/site-chrome";

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
      <head>
        {/* Montserrat is self-hosted (see @font-face in globals.css); the Google stylesheet below only adds characters outside the latin subset. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteChrome isSignedIn={!!user}>{children}</SiteChrome>
      </body>
    </html>
  );
}
