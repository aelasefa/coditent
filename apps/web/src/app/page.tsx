import PremiumLanding from "@/components/premium-landing";

export const dynamic = "force-static";
export const revalidate = 86_400;

export default function Home() {
  return <PremiumLanding />;
}
