"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getCompany, getMe, updateCompany } from "@/lib/api";

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const companyQ = useQuery({
    queryKey: ["company", me?.company_id],
    queryFn: () => (me?.company_id ? getCompany(me.company_id) : null),
    enabled: !!me?.company_id,
  });

  const [form, setForm] = useState({ industry: "", company_size: "", website: "", location: "", description: "" });
  const company = companyQ.data;
  useEffect(() => {
    if (company) {
      setForm({
        industry: company.industry || "",
        company_size: company.company_size || "",
        website: company.website || "",
        location: company.location || "",
        description: company.description || "",
      });
    }
  }, [company]);

  const saveMut = useMutation({
    mutationFn: () => {
      // CompanyCreate requires name; send current values plus filled optionals.
      const payload: Record<string, string> = {
        name: company?.name || "",
        region: company?.region || form.location || "Remote",
      };
      (["industry", "company_size", "website", "location", "description"] as const).forEach((k) => {
        if (form[k].trim()) payload[k] = form[k].trim();
      });
      return updateCompany(me!.company_id as string, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", me?.company_id] });
      toast("Workspace ready", { variant: "success" });
      router.push("/company");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Save failed";
      toast("Save failed", { description: String(msg), variant: "error" });
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title={`Welcome, ${company?.name || "owner"}`} description="Complete company information to finish onboarding." />
        {companyQ.isLoading ? (
          <Skeleton className="h-64" />
        ) : companyQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load company.</p>
            <Button size="sm" variant="outline" onClick={() => companyQ.refetch()} className="mt-3">Retry</Button>
          </div>
        ) : (
          <form
            className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              saveMut.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Financial Technology" />
              <Select label="Company size" value={form.company_size} onChange={(e) => setForm({ ...form, company_size: e.target.value })}>
                <option value="">Select size</option>
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-200">51-200</option>
                <option value="201-1000">201-1,000</option>
                <option value="1000+">1,000+</option>
              </Select>
              <Input label="Website" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
              <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Casablanca" />
            </div>
            <Textarea label="Description" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does the company do?" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => router.push("/company")}>Skip for now</Button>
              <Button type="submit" loading={saveMut.isPending}>Finish setup</Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
