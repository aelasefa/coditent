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
import { useTheme } from "@/lib/theme-context";
import { can } from "@/lib/permissions";
import { FiCheck, FiMoon, FiSun } from "react-icons/fi";
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

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { theme, setTheme } = useTheme();

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

  const [form, setForm] = useState({
    name: "",
    industry: "",
    region: "",
    location: "",
    website: "",
    company_size: "",
    contact_email: "",
    contact_phone: "",
    description: "",
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || "",
        industry: company.industry || "",
        region: company.region || "",
        location: company.location || "",
        website: company.website || "",
        company_size: company.company_size || "",
        contact_email: company.contact_email || "",
        contact_phone: company.contact_phone || "",
        description: company.description || "",
      });
    }
  }, [company]);

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
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader title="Settings" subtitle="Company profile, access policy, plan and appearance." />

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
                      className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (canEditCompany) updateMut.mutate();
                      }}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input label="Company name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEditCompany} />
                        <Input label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} disabled={!canEditCompany} placeholder="e.g. Financial Technology" />
                        <Input label="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} disabled={!canEditCompany} placeholder="e.g. Casablanca" />
                        <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={!canEditCompany} placeholder="e.g. Marina office" />
                        <Input label="Website" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} disabled={!canEditCompany} placeholder="https://" error={form.website && !form.website.startsWith("http") ? "Use full URL starting with https://" : undefined} />
                        <Select label="Company size" value={form.company_size} onChange={(e) => setForm({ ...form, company_size: e.target.value })} disabled={!canEditCompany}>
                          <option value="">Select size</option>
                          <option value="1-10">1-10</option>
                          <option value="11-50">11-50</option>
                          <option value="51-200">51-200</option>
                          <option value="201-1000">201-1,000</option>
                          <option value="1000+">1,000+</option>
                        </Select>
                        <Input label="Contact email" type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} disabled={!canEditCompany} autoComplete="email" />
                        <Input label="Contact phone" type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} disabled={!canEditCompany} autoComplete="tel" />
                      </div>
                      <Textarea label="Description" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canEditCompany} />
                      {canEditCompany ? (
                        <div className="flex justify-end">
                          <Button type="submit" loading={updateMut.isPending}>Save changes</Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Read-only for your role. Only Owner and Admin can edit company details.</p>
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
                <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-4 py-3">Capability</th>
                        {ROLE_ORDER.map((r) => (
                          <th scope="col" key={r} className="px-3 py-3 text-center">{r === "HIRING_MANAGER" ? "Hiring Mgr" : r === "OWNER" ? "Owner" : r === "ADMIN" ? "Admin" : r === "HR" ? "HR" : "Recruiter"}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {MATRIX.map((row) => (
                        <tr key={row.capability}>
                          <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">{row.capability}</th>
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
                  <p className="border-t border-border-subtle px-4 py-3 text-[11px] text-muted-foreground">Enforced by backend on every request. Frontend reflects, never grants.</p>
                </div>
              ),
            },
            {
              id: "plan",
              label: "Plan",
              content: (
                <div className="rounded-xl border border-border-subtle bg-surface p-5">
                  {subQ.isLoading ? (
                    <Skeleton className="h-20" />
                  ) : subQ.isError || !subQ.data ? (
                    <div>
                      <p className="text-sm font-semibold text-foreground">Plan details unavailable</p>
                      <p className="mt-1 text-[13px] text-muted-foreground">Subscription service did not return plan data. Billing management is limited to workspace owner through existing channels.</p>
                      <Button size="sm" variant="outline" onClick={() => subQ.refetch()} className="mt-3">Retry</Button>
                    </div>
                  ) : (
                    <dl className="grid gap-2 text-sm sm:grid-cols-3">
                      <div className="rounded-lg bg-surface-secondary/50 px-3 py-2">
                        <dt className="text-xs text-muted-foreground">Status</dt>
                        <dd className="font-semibold text-foreground">{String((subQ.data as { status?: string }).status ?? "Unknown")}</dd>
                      </div>
                      <div className="rounded-lg bg-surface-secondary/50 px-3 py-2">
                        <dt className="text-xs text-muted-foreground">Company</dt>
                        <dd className="font-semibold text-foreground">{company?.name ?? "—"}</dd>
                      </div>
                      <div className="rounded-lg bg-surface-secondary/50 px-3 py-2">
                        <dt className="text-xs text-muted-foreground">Account</dt>
                        <dd className="truncate font-semibold text-foreground">{me?.email ?? "—"}</dd>
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
            {
              id: "appearance",
              label: "Appearance",
              content: (
                <div className="rounded-xl border border-border-subtle bg-surface p-5">
                  <h3 className="text-sm font-semibold text-foreground">Interface theme</h3>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">Stored on this device. Applies immediately.</p>
                  <div className="mt-3 grid max-w-md grid-cols-2 gap-3" role="group" aria-label="Theme">
                    {(
                      [
                        { id: "light", label: "Light", Icon: FiSun },
                        { id: "dark", label: "Dark", Icon: FiMoon },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTheme(id)}
                        aria-pressed={theme === id}
                        className={theme === id ? "flex items-center gap-3 rounded-xl border border-primary bg-primary/5 p-3 text-xs font-semibold text-foreground" : "flex items-center gap-3 rounded-xl border border-border p-3 text-xs font-semibold text-muted-foreground hover:text-foreground"}
                      >
                        <Icon aria-hidden className="h-4 w-4" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 text-[13px] text-muted-foreground">Notification preferences are not configurable yet. No alert settings are stored.</p>
                </div>
              ),
            },
          ]}
        />
      </div>
    </AppShell>
  );
}
