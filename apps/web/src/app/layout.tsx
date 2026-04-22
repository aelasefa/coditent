import type { Metadata } from "next";
import { Outfit, Space_Mono, Syne } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";

export const metadata: Metadata = {
  title: "Coditent",
  description: "Coditent talent workflows",
};

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-outfit",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-syne",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${outfit.variable} ${syne.variable} ${spaceMono.variable} min-h-full bg-md-background text-md-foreground`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
