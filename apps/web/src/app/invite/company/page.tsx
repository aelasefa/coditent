import { redirect } from "next/navigation";

export default async function InviteCompanyRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  redirect(token ? `/company/invite/accept?token=${encodeURIComponent(token)}` : "/company/invite/accept");
}
