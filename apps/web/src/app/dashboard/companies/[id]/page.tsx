"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FiArrowLeft, FiArrowUpRight } from "react-icons/fi";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { companyLogoSrc, getCompany } from "@/lib/api";

function websiteUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const input = value.trim();
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function CandidateCompanyProfilePage({ params, searchParams }: { params: { id: string }; searchParams?: { app?: string; from?: string } }) {
  const companyQuery = useQuery({
    queryKey: ["company-profile", params.id],
    queryFn: () => getCompany(params.id),
    retry: false,
  });
  const company = companyQuery.data;
  const website = websiteUrl(company?.website);
  const fromDiscover = searchParams?.from === "discover";
  const backHref = fromDiscover
    ? "/dashboard/recommendations"
    : searchParams?.app
      ? `/dashboard/applications?app=${encodeURIComponent(searchParams.app)}`
      : "/dashboard/applications";
  const backLabel = fromDiscover ? "Back to Discover" : "Back to applications";
  const facts = company ? [
    ["Industry", company.industry],
    ["Location", company.location || company.region],
    ["Company size", company.company_size],
  ].filter(([, value]) => Boolean(value)) : [];

  return (
    <PageContainer variant="wide" className="pb-16">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
        <FiArrowLeft aria-hidden="true" /> {backLabel}
      </Link>

      {companyQuery.isLoading ? (
        <div role="status" aria-label="Loading company profile" className="mt-8 space-y-6">
          <div className="flex items-center gap-4"><Skeleton className="h-16 w-16 rounded-full" /><div className="space-y-3"><Skeleton className="h-10 w-64 max-w-full" /><Skeleton className="h-4 w-36" /></div></div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : companyQuery.isError || !company ? (
        <div role="alert" className="mt-8 rounded-xl border border-border bg-surface p-6">
          <h1 className="font-serif text-3xl text-foreground">Company profile unavailable</h1>
          <p className="mt-2 text-sm text-foreground-secondary">We couldn’t load this company’s details right now.</p>
          <button type="button" onClick={() => void companyQuery.refetch()} className="mt-4 text-sm font-semibold text-primary underline underline-offset-4">Try again</button>
        </div>
      ) : (
        <>
          <header className="mt-8 flex flex-wrap items-start justify-between gap-5 border-b border-border pb-8">
            <div className="flex min-w-0 items-start gap-4">
              <Avatar name={company.name} src={companyLogoSrc(company)} size="xl" className="border border-border-subtle bg-surface" />
              <div className="min-w-0">
                <span className="text-[0.7rem] font-bold uppercase tracking-[0.13em] text-primary">Company profile</span>
                <h1 className="mt-1 font-serif text-[clamp(2.2rem,4vw,3.8rem)] leading-[1.05] tracking-[-0.045em] text-foreground">{company.name}</h1>
                {company.industry || company.location || company.region ? <p className="mt-3 text-sm text-foreground-secondary">{[company.industry, company.location || company.region].filter(Boolean).join(" · ")}</p> : null}
              </div>
            </div>
            {website ? <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">Visit website <FiArrowUpRight aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a> : null}
          </header>

          <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(14rem,0.7fr)]">
            <section aria-labelledby="company-about-heading">
              <h2 id="company-about-heading" className="font-serif text-[clamp(1.7rem,2.5vw,2.2rem)] tracking-[-0.035em] text-foreground">About {company.name}</h2>
              <p className="mt-4 max-w-[65ch] whitespace-pre-line text-[0.95rem] leading-7 text-foreground-secondary">{company.description?.trim() || "This company has not added a description yet."}</p>
            </section>
            {facts.length > 0 ? <aside aria-label="Company details" className="border-t border-border-subtle pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <h2 className="text-sm font-bold text-foreground">At a glance</h2>
              <dl className="mt-4 space-y-5">
                {facts.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt><dd className="mt-1 text-sm text-foreground">{value}</dd></div>)}
              </dl>
            </aside> : null}
          </div>
        </>
      )}
    </PageContainer>
  );
}
