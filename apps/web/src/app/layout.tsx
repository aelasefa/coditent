import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { ThemeProvider } from "@/lib/theme-context";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "CODITENT — AI-Powered Careers & Recruiting",
  description:
    "Discover relevant jobs and internships, prove skills through practical evaluations, and connect with recruiters. Companies publish roles, review candidates and hire.",
  openGraph: {
    title: "CODITENT — AI-Powered Careers & Recruiting",
    description:
      "Opportunities matched to your profile, practical skill evaluations, and a clear path from application to hire.",
    type: "website",
  },
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
          <ThemeProvider>
            <ToastProvider>
              <div className="siteContentLayer">{children}</div>
            </ToastProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
