import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Coditent",
  description: "AI-powered hiring platform for candidates and recruiters.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${manrope.variable} min-h-full bg-slate-50 text-slate-900`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
