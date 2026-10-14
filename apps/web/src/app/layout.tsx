import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { PwaRegistration } from "@/components/pwa-registration";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "CODITENT — AI-Powered Careers & Recruiting",
  description:
    "Discover relevant jobs and internships, prove skills through practical evaluations, and connect with recruiters. Companies publish roles, review candidates and hire.",
  applicationName: "CODITENT",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CODITENT",
  },
  openGraph: {
    title: "CODITENT — AI-Powered Careers & Recruiting",
    description:
      "Opportunities matched to your profile, practical skill evaluations, and a clear path from application to hire.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#194d38",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-background text-foreground">
        <QueryProvider>
          <ToastProvider>
            <div className="siteContentLayer">{children}</div>
            <PwaRegistration />
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
