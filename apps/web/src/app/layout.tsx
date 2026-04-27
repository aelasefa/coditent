import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";

const LoadingScreen = dynamic(() => import("@/components/LoadingScreen"), { ssr: false });
const DarkVeil = dynamic(() => import("@/components/DarkVeil"), { ssr: false });

export const metadata: Metadata = {
  title: "Coditent",
  description: "Coditent talent workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-md-background text-md-foreground">
        <LoadingScreen />
        <div
          className="darkVeilWrapper"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            opacity: 0.55,
          }}
        >
          <DarkVeil
            hueShift={270}
            noiseIntensity={0.03}
            scanlineIntensity={0}
            speed={0.25}
            scanlineFrequency={0}
            warpAmount={0.015}
            resolutionScale={0.65}
          />
        </div>
        <QueryProvider>
          <div className="siteContentLayer">{children}</div>
        </QueryProvider>
      </body>
    </html>
  );
}
