"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/company/AppShell";
import { PageHeader } from "@/components/company/PageHeader";
import { getMe, getCompany, updateCompany, getCompanySubscription } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { can } from "@/lib/permissions";
import {
  FiBriefcase,
  FiShield,
  FiCreditCard,
  FiBell,
  FiCheck,
  FiAlertCircle,
  FiCheckCircle,
  FiSave,
  FiGlobe,
  FiMapPin,
  FiMail,
  FiPhone,
  FiSun,
  FiMoon,
} from "react-icons/fi";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { theme, setTheme } = useTheme();

  const companyId = me?.company_id;
  const canEditCompany = can(me ?? null, "edit_company");
  const canManageSub = can(me ?? null, "manage_subscription");

  const [activeTab, setActiveTab] = useState<"profile" | "permissions" | "subscription" | "notifications">("profile");

  const { data: company, isLoading } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => (companyId ? getCompany(companyId) : null),
    enabled: !!companyId,
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

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || "",
        industry: company.industry || "",
        region: company.region || "",
        location: company.location || "",
        website: company.website || "",
        company_size: company.company_size || "1-50",
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
      return await updateCompany(companyId, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", companyId] });
      qc.invalidateQueries({ queryKey: ["company-profile", companyId] });
      setStatusMessage({ text: "Company settings updated successfully." });
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (e: any) => {
      setStatusMessage({
        text: e?.response?.data?.detail || e?.message || "Failed to update company settings",
        isError: true,
      });
    },
  });

  const permissionMatrix = [
    { action: "View Company Portal & Pipeline", roles: ["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"] },
    { action: "Edit Company Profile & Settings", roles: ["OWNER", "ADMIN"] },
    { action: "Invite & Manage Team Roles", roles: ["OWNER", "ADMIN"] },
    { action: "Publish & Edit Job Offers", roles: ["OWNER", "ADMIN", "RECRUITER"] },
    { action: "Move Candidate Pipeline Stages", roles: ["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"] },
    { action: "Manage Subscription & Billing", roles: ["OWNER"] },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Company Workspace Settings"
          subtitle="Configure your organization profile, permission policies, theme, and subscription plan."
        />

        {statusMessage && (
          <div
            className={`flex items-center gap-2 rounded-lg p-3 text-xs font-medium border ${
              statusMessage.isError
                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300"
                : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
            }`}
          >
            {statusMessage.isError ? (
              <FiAlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <FiCheckCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold overflow-x-auto">
          {[
            { key: "profile", label: "Company Profile", icon: FiBriefcase },
            { key: "permissions", label: "Roles & Permissions", icon: FiShield },
            { key: "subscription", label: "Plan & Billing", icon: FiCreditCard },
            { key: "notifications", label: "Preferences & Theme", icon: FiBell },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 -mb-px whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-bold"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Profile Form */}
        {activeTab === "profile" && (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Organization Details</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Public and workspace information about your company.
                </p>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Workspace ID: <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-800 dark:text-zinc-200 font-mono text-[11px]">{companyId || "—"}</code>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canEditCompany) updateMut.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Industry / Sector
                  </label>
                  <input
                    type="text"
                    disabled={!canEditCompany}
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    placeholder="e.g. Financial Technology / AI SaaS"
                    className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Headquarters Region
                  </label>
                  <div className="relative">
                    <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="text"
                      disabled={!canEditCompany}
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })}
                      placeholder="e.g. Europe / Remote"
                      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-8 pr-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Website URL
                  </label>
                  <div className="relative">
                    <FiGlobe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="url"
                      disabled={!canEditCompany}
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      placeholder="https://acme.com"
                      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-8 pr-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Company Size
                  </label>
                  <select
                    disabled={!canEditCompany}
                    value={form.company_size}
                    onChange={(e) => setForm({ ...form, company_size: e.target.value })}
                    className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                  >
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-1000">201-1,000 employees</option>
                    <option value="1000+">1,000+ employees</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Contact Email
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="email"
                      disabled={!canEditCompany}
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                      placeholder="recruitment@company.com"
                      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-8 pr-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Contact Phone
                  </label>
                  <div className="relative">
                    <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                      type="tel"
                      disabled={!canEditCompany}
                      value={form.contact_phone}
                      onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-8 pr-3 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Company Description
                </label>
                <textarea
                  rows={3}
                  disabled={!canEditCompany}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Provide an overview of your organization, mission, and working culture..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-500"
                />
              </div>

              {canEditCompany ? (
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={updateMut.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                  >
                    <FiSave className="h-3.5 w-3.5" />
                    <span>{updateMut.isPending ? "Saving Changes…" : "Save Changes"}</span>
                  </button>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                  Only OWNER and ADMIN roles have permission to modify company details.
                </p>
              )}
            </form>
          </div>
        )}

        {/* Tab 2: Permissions Matrix */}
        {activeTab === "permissions" && (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs space-y-4">
            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Role & Permission Policy</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Summary of access levels enforced across the CODITENT platform.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th className="px-4 py-3">Permission Capability</th>
                    <th className="px-3 py-3 text-center">Owner</th>
                    <th className="px-3 py-3 text-center">Admin</th>
                    <th className="px-3 py-3 text-center">HR</th>
                    <th className="px-3 py-3 text-center">Recruiter</th>
                    <th className="px-3 py-3 text-center">Hiring Mgr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {permissionMatrix.map((row, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-850 transition-colors">
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{row.action}</td>
                      {["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"].map((r) => {
                        const hasPerm = row.roles.includes(r);
                        return (
                          <td key={r} className="px-3 py-3 text-center">
                            {hasPerm ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                                <FiCheck className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Subscription */}
        {activeTab === "subscription" && (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs space-y-4">
            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Subscription & Tier</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Workspace license, billing cycle, and hiring tier details.
              </p>
            </div>

            {canManageSub ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">CODITENT Enterprise Workspace</span>
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      Active
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Workspace ID</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{companyId}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Account Owner</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{me?.email}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Includes AI Candidate Screening, Practical Skills Assessment tests, ATS Pipeline Management, and Multi-user Collaboration.
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Subscription and billing settings can only be viewed and managed by the <strong>OWNER</strong> role.
              </p>
            )}
          </div>
        )}

        {/* Tab 4: Preferences & Theme */}
        {activeTab === "notifications" && (
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#121215] p-6 shadow-xs space-y-5">
            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Appearance & Recruiter Preferences</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure your theme appearance and recruiter automation triggers.
              </p>
            </div>

            {/* Appearance Mode Selection */}
            <div className="pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <label className="block text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                Interface Theme
              </label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    theme === "light"
                      ? "border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 ring-1 ring-zinc-900 dark:ring-zinc-100"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <FiSun className="h-4 w-4 text-amber-500" />
                  <span>Light Mode</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    theme === "dark"
                      ? "border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 ring-1 ring-zinc-900 dark:ring-zinc-100"
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  <FiMoon className="h-4 w-4 text-indigo-400" />
                  <span>Dark Mode</span>
                </button>
              </div>
            </div>

            {/* Notification Toggles */}
            <div className="space-y-3 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">New Candidate Application Alerts</p>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">Receive immediate notifications when a candidate submits an application.</p>
                </div>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-900" />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">Practical Assessment Completion Alerts</p>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">Notify when a candidate completes technical skills tests.</p>
                </div>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-900" />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">Weekly Recruitment Digest</p>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">Summary of applications, conversion funnel, and team activity.</p>
                </div>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-900" />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
