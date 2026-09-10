import { LandingPage } from "@/components/landing/landing-page";

export const dynamic = "force-static";
export const revalidate = 86_400;

export default function Home() {
  return <LandingPage />;
}
