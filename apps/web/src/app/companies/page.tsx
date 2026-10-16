"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCompanies, createCompany, joinCompany } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { PageContainer, PageHeader } from "@/components/shell/page-container";

export default function CompaniesPage() {
  const qc = useQueryClient();
  const { data: companies } = useQuery({ queryKey: ["companies"], queryFn: getCompanies });
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => createCompany({ name, region: region || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); setMsg("Company created & joined"); setName(""); setRegion(""); },
    onError: (error: unknown) => setMsg(
      (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed"
    ),
  });
  const joinMut = useMutation({
    mutationFn: (id: string) => joinCompany(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies"] }); setMsg("Joined company"); },
    onError: (error: unknown) => setMsg(
      (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed"
    ),
  });

  return (
    <div className="company-theme min-h-screen bg-background text-foreground">
      <header className="border-b border-border-subtle bg-surface/95">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-4 sm:px-6 lg:px-8"><Logo size="md" /></div>
      </header>
      <main>
        <PageContainer>
          <PageHeader title="Companies" description="Create a company workspace or join an existing team." />

          <Card className="p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">For recruiters</p>
            <h2 className="ct-section-title mt-2">Create a company workspace</h2>
            <p className="mt-1 text-sm text-muted-foreground">Set up the shared space where your team publishes roles and reviews candidates.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_15rem_auto] sm:items-end">
              <Input label="Company name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Company name" />
              <Input label="Region" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Casablanca" />
              <Button loading={createMut.isPending} disabled={name.trim().length < 2} onClick={() => createMut.mutate()}>Create company</Button>
            </div>
            {msg ? <p className="mt-3 text-sm font-medium text-foreground-secondary" role="status">{msg}</p> : null}
          </Card>

          <section className="mt-8" aria-labelledby="company-directory-title">
            <h2 id="company-directory-title" className="ct-section-title">Company directory</h2>
            <p className="mt-1 text-sm text-muted-foreground">Join the workspace your organization already uses.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {companies?.map((company) => (
                <Card key={company.id} className="flex items-center gap-4 p-5">
                  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-secondary font-bold text-primary">{company.name.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{company.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{company.region || "Region not set"} · {company.recruiter_count} recruiter{company.recruiter_count === 1 ? "" : "s"}</p>
                    {company.description ? <p className="mt-2 line-clamp-2 text-sm text-foreground-secondary">{company.description}</p> : null}
                  </div>
                  <Button variant="outline" size="sm" loading={joinMut.isPending && joinMut.variables === company.id} onClick={() => joinMut.mutate(company.id)}>Join</Button>
                </Card>
              ))}
            </div>
            {companies?.length === 0 ? <Card className="mt-4 border-dashed p-8 text-center text-sm text-muted-foreground">No company workspaces are available yet.</Card> : null}
          </section>
        </PageContainer>
      </main>
    </div>
  );
}
