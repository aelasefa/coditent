import { redirect } from "next/navigation";

export default function InviteCompanyRedirectPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams?.token;
  redirect(token ? `/company/invite/accept?token=${encodeURIComponent(token)}` : "/company/invite/accept");
}
