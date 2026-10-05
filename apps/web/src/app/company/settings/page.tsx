"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { CompanyLogoSection } from "@/components/company/CompanyLogoSection";
import { PageHeader } from "@/components/company/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getMe, getCompany, updateCompany, getCompanySubscription } from "@/lib/api";
import { can } from "@/lib/permissions";
import type { Company } from "@/lib/types";
import { FiBriefcase, FiCheck, FiCreditCard, FiMail, FiMapPin, FiRotateCcw, FiSave, FiSettings, FiShield } from "react-icons/fi";
import { TwoFactorSecurity } from "@/components/security/two-factor-security";

// Mirrors apps/api/app/core/permissions.py via lib/permissions.ts. Backend remains authority.
const MATRIX: Array<{ capability: string; roles: string[] }> = [
  { capability: "View company and pipeline", roles: ["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"] },
  { capability: "Edit company profile", roles: ["OWNER", "ADMIN"] },
  { capability: "Invite team members", roles: ["OWNER", "ADMIN"] },
  { capability: "Change roles and remove members", roles: ["OWNER", "ADMIN"] },
  { capability: "Publish job offers", roles: ["OWNER", "ADMIN", "HR", "RECRUITER"] },
  { capability: "Edit job offers", roles: ["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"] },
  { capability: "Delete job offers", roles: ["OWNER", "ADMIN"] },
  { capability: "Review and advance candidates", roles: ["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"] },
  { capability: "View assessments and insights", roles: ["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"] },
  { capability: "Manage subscription", roles: ["OWNER"] },
];

const ROLE_ORDER = ["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"] as const;

interface CompanyForm {
  name: string;
  industry: string;
  region: string;
  location: string;
  website: string;
  company_size: string;
  contact_email: string;
  contact_phone: string;
  description: string;
}

const EMPTY_COMPANY_FORM: CompanyForm = {
  name: "",
  industry: "",
  region: "",
  location: "",
  website: "",
  company_size: "",
  contact_email: "",
  contact_phone: "",
  description: "",
};

function companyFormValues(company?: Company | null): CompanyForm {
  if (!company) return EMPTY_COMPANY_FORM;
  return {
    name: company.name || "",
    industry: company.industry || "",
    region: company.region || "",
    location: company.location || "",
    website: company.website || "",
    company_size: company.company_size || "",
    contact_email: company.contact_email || "",
    contact_phone: company.contact_phone || "",
    description: company.description || "",
  };
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const companyId = me?.company_id;
  const canEditCompany = can(me ?? null, "edit_company");

  const { data: company, isLoading, isError, refetch } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => (companyId ? getCompany(companyId) : null),
    enabled: !!companyId,
  });
  const subQ = useQuery({
    queryKey: ["company-subscription", companyId],
    queryFn: () => (companyId ? getCompanySubscription(companyId) : null),
    enabled: !!companyId,
    retry: false,
  });

  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY_FORM);

  useEffect(() => {
    if (company) setForm(companyFormValues(company));
  }, [company]);

  const savedForm = companyFormValues(company);
  const isDirty = company ? (Object.keys(form) as Array<keyof CompanyForm>).some((key) => form[key] !== savedForm[key]) : false;
  const websiteError = form.website && !/^https?:\/\//i.test(form.website) ? "Use a full URL starting with https://" : undefined;

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!companyId) return;
      if (!form.name.trim()) throw new Error("Company name cannot be empty");
      return updateCompany(companyId, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", companyId] });
      qc.invalidateQueries({ queryKey: ["company-profile", companyId] });
      toast("Company updated", { variant: "success" });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail || (e as Error)?.message || "Save failed";
      toast("Save failed", { description: String(msg), variant: "error" });
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          tone="green"
          center
          icon={<FiSettings />}
          eyebrow="Workspace settings"
          title="Shape your company workspace."
          subtitle="Keep your company profile, team access, plan and account security in one place."
        />

        <Tabs
          items={[
            {
              id: "company",
              label: "Company",
              content: (
                <div>
                  {isLoading ? (
                    <div role="status" aria-label="Loading company"><Skeleton className="h-64" /></div>
                  ) : isError ? (
                    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
                      <p className="text-sm font-semibold text-danger">Could not load company.</p>
                      <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3">Retry</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <CompanyLogoSection company={company ?? null} canEdit={canEditCompany} />
                      <form
                        className="company-settings-form overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-sm"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (canEditCompany && isDirty && !websiteError) updateMut.mutate();
                        }}
                      >
                        <section className="space-y-4 p-5 sm:p-6" aria-labelledby="company-profile-heading">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FiBriefcase aria-hidden className="h-4 w-4" /></span>
                            <div>
                              <h3 id="company-profile-heading" className="text-sm font-semibold text-foreground">Company profile</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">The core information candidates see across your job postings.</p>
                            </div>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Input label="Company name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEditCompany} />
                            <Input label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} disabled={!canEditCompany} placeholder="e.g. Financial Technology" />
                            <Select label="Company size" value={form.company_size} onChange={(e) => setForm({ ...form, company_size: e.target.value })} disabled={!canEditCompany}>
                              <option value="">Select size</option>
                              <option value="1-10">1-10</option>
                              <option value="11-50">11-50</option>
                              <option value="51-200">51-200</option>
                              <option value="201-1000">201-1,000</option>
                              <option value="1000+">1,000+</option>
                            </Select>
                            <Input label="Website" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} disabled={!canEditCompany} placeholder="https://example.com" error={websiteError} />
                          </div>
                          <Textarea label="Company description" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canEditCompany} helper="Share what your company does and what makes it a strong place to work." />
                        </section>

                        <section className="space-y-4 border-t border-border-subtle p-5 sm:p-6" aria-labelledby="company-location-heading">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FiMapPin aria-hidden className="h-4 w-4" /></span>
                            <div>
                              <h3 id="company-location-heading" className="text-sm font-semibold text-foreground">Location</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">Help candidates understand where your team is based.</p>
                            </div>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Input label="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} disabled={!canEditCompany} placeholder="e.g. Casablanca" />
                            <Input label="Office location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={!canEditCompany} placeholder="e.g. Casablanca Marina" />
                          </div>
                        </section>

                        <section className="space-y-4 border-t border-border-subtle p-5 sm:p-6" aria-labelledby="company-contact-heading">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FiMail aria-hidden className="h-4 w-4" /></span>
                            <div>
                              <h3 id="company-contact-heading" className="text-sm font-semibold text-foreground">Contact details</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">Where hiring-related communication should be directed.</p>
                            </div>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Input label="Contact email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} disabled={!canEditCompany} autoComplete="email" placeholder="hiring@company.com" />
                            <Input label="Contact phone" type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} disabled={!canEditCompany} autoComplete="tel" placeholder="+212 5 00 00 00 00" />
                          </div>
                        </section>

                        {canEditCompany ? (
                          <div className="company-settings-save flex flex-col gap-3 border-t border-border-subtle bg-surface-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <p className="text-xs font-medium text-muted-foreground" aria-live="polite">{isDirty ? "You have unsaved changes." : "All company details are up to date."}</p>
                            <div className="flex gap-2">
                              <Button type="button" variant="ghost" onClick={() => setForm(savedForm)} disabled={!isDirty || updateMut.isPending}>
                                <FiRotateCcw aria-hidden className="h-4 w-4" />
                                Reset
                              </Button>
                              <Button type="submit" loading={updateMut.isPending} disabled={!isDirty || Boolean(websiteError)}>
                                <FiSave aria-hidden className="h-4 w-4" />
                                Save changes
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="border-t border-border-subtle bg-surface-secondary/40 p-4 text-xs text-muted-foreground sm:px-6">Read-only for your role. Only Owner and Admin can edit company details.</p>
                        )}
                      </form>
                    </div>
                  )}
                </div>
              ),
            },
            {
              id: "roles",
              label: "Roles",
              content: (
                <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-sm">
                  <div className="flex items-start gap-3 border-b border-border-subtle p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FiShield aria-hidden className="h-4 w-4" /></span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Role permissions</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">Compare what each company role can view and manage.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="sticky left-0 z-10 bg-surface-secondary px-4 py-3">Capability</th>
                        {ROLE_ORDER.map((r) => (
                          <th scope="col" key={r} className="px-3 py-3 text-center">{r === "HIRING_MANAGER" ? "Hiring Mgr" : r === "OWNER" ? "Owner" : r === "ADMIN" ? "Admin" : r === "HR" ? "HR" : "Recruiter"}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {MATRIX.map((row) => (
                        <tr key={row.capability}>
                          <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left font-medium text-foreground">{row.capability}</th>
                          {ROLE_ORDER.map((r) => (
                            <td key={r} className="px-3 py-3 text-center">
                              {row.roles.includes(r) ? (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-background text-success" role="img" aria-label={`${r} allowed`}>
                                  <FiCheck aria-hidden className="h-3.5 w-3.5" />
                                </span>
                              ) : (
                                <span aria-hidden className="text-muted-foreground">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <p className="border-t border-border-subtle px-5 py-3 text-xs text-muted-foreground">Owners and admins can update teammate roles from the Team page.</p>
                </div>
              ),
            },
            {
              id: "plan",
              label: "Plan",
              content: (
                <div className="rounded-xl border border-border-subtle bg-surface p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FiCreditCard aria-hidden className="h-4 w-4" /></span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Subscription overview</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">Review the plan connected to this workspace.</p>
                    </div>
                  </div>
                  {subQ.isLoading ? (
                    <Skeleton className="h-20" />
                  ) : subQ.isError || !subQ.data ? (
                    <div>
                      <p className="text-sm font-semibold text-foreground">Plan details unavailable</p>
                      <p className="mt-1 text-[13px] text-muted-foreground">Subscription service did not return plan data. Billing management is limited to workspace owner through existing channels.</p>
                      <Button size="sm" variant="outline" onClick={() => subQ.refetch()} className="mt-3">Retry</Button>
                    </div>
                  ) : (
                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-lg border border-border-subtle bg-surface-secondary/50 p-4">
                        <dt className="text-xs text-muted-foreground">Status</dt>
                        <dd className="mt-1 font-semibold capitalize text-foreground">{String((subQ.data as { status?: string }).status ?? "Unknown")}</dd>
                      </div>
                      <div className="rounded-lg border border-border-subtle bg-surface-secondary/50 p-4">
                        <dt className="text-xs text-muted-foreground">Company</dt>
                        <dd className="mt-1 font-semibold text-foreground">{company?.name ?? "—"}</dd>
                      </div>
                      <div className="rounded-lg border border-border-subtle bg-surface-secondary/50 p-4">
                        <dt className="text-xs text-muted-foreground">Account</dt>
                        <dd className="mt-1 truncate font-semibold text-foreground">{me?.email ?? "—"}</dd>
                      </div>
                    </dl>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">Plan changes are handled outside this panel. Only Owner manages subscription per platform policy.</p>
                </div>
              ),
            },
            {
              id: "security",
              label: "Security",
              content: <TwoFactorSecurity />,
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
