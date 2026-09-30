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
      <body className="min-h-full flex flex-col">
        <SiteChrome isSignedIn={!!user}>{children}</SiteChrome>
      </body>
    </html>
  );
}
