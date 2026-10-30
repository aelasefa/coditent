import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { PwaRegistration } from "@/components/pwa-registration";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CODITENT — AI-Powered Careers & Recruiting",
  description:
    "Discover relevant jobs and internships, prove skills through practical evaluations, and connect with recruiters. Companies publish roles, review candidates and hire.",
  applicationName: "CODITENT",
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
    <html lang="en" className={`${inter.variable} h-full`}>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
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
