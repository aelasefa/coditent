"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/company/PageHeader";
import { StatusBadge } from "@/components/company/StatusBadge";
import { EmptyState } from "@/components/company/EmptyState";
import { Drawer } from "@/components/company/Drawer";
import { TableSkeleton } from "@/components/company/LoadingSkeleton";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getAdminOffers, getCompanies, getCompany, getCompanyRecruiters } from "@/lib/api";
import type { Company } from "@/lib/types";
import { FiSearch, FiShield } from "react-icons/fi";

export default function AdminCompaniesPage() {
  const companiesQ = useQuery({ queryKey: ["companies"], queryFn: getCompanies });
  const offersQ = useQuery({ queryKey: ["admin-offers"], queryFn: getAdminOffers });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const companies = companiesQ.data ?? [];
  const filtered = useMemo(() => {
    let list = companies;
    if (statusFilter !== "all") list = list.filter((c) => (c.status || "active") === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.industry || "").toLowerCase().includes(q));
    }
    return list;
  }, [companies, search, statusFilter]);

  const selected = companies.find((c) => c.id === selectedId) ?? null;
  const detailQ = useQuery({
    queryKey: ["company", selectedId],
    queryFn: () => getCompany(selectedId as string),
    enabled: !!selectedId,
  });
  const membersQ = useQuery({
    queryKey: ["company-recruiters", selectedId],
    queryFn: () => getCompanyRecruiters(selectedId as string),
    enabled: !!selectedId,
  });
  const companyOffers = useMemo(
    () => (offersQ.data ?? []).filter((o) => o.company_id === selectedId),
    [offersQ.data, selectedId]
  );

  return (
    <AdminShell>
      <div className="space-y-6">
        <PageHeader
          title="Companies"
          subtitle={`${companies.length} workspaces on the platform.`}
          badge={<span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground-secondary">{filtered.length} shown</span>}
        />

        <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor="companies-search" className="sr-only">Search companies</label>
            <FiSearch aria-hidden className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="companies-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or industry"
              className="h-9 w-full rounded-lg border border-border bg-surface-secondary/60 pl-8 pr-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter" className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {companiesQ.isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : companiesQ.isError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-6 text-center">
            <p className="text-sm font-semibold text-danger">Could not load companies.</p>
            <Button size="sm" variant="outline" onClick={() => companiesQ.refetch()} className="mt-3">Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FiShield} title={companies.length === 0 ? "No companies yet" : "No companies match filters"} description="Accepted invitations create workspaces here." />
        ) : (
          <ul className="space-y-2" aria-label="Companies">
            {filtered.map((c: Company) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-label={`View ${c.name}`}
                  className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface p-4 text-left hover:border-border-strong"
                >
                  <Avatar name={c.name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.industry || "No industry"} · Joined {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <StatusBadge status={c.status || "active"} size="sm" showDot={false} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Drawer
          isOpen={!!selected}
          onClose={() => setSelectedId(null)}
          title={selected?.name ?? "Company"}
          subtitle={selected ? `${selected.industry || "No industry"} · Joined ${new Date(selected.created_at).toLocaleDateString()}` : undefined}
          width="lg"
        >
          {selected && (
            <div className="space-y-5">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["Status", selected.status || "active"],
                  ["Region", detailQ.data?.region || selected.region || "—"],
                  ["Website", detailQ.data?.website || selected.website || "—"],
                  ["Size", detailQ.data?.company_size || selected.company_size || "—"],
                  ["Contact", detailQ.data?.contact_email || selected.contact_email || "—"],
                  ["Offers", String(companyOffers.length)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface-secondary/50 px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {selected.description && <p className="text-sm leading-relaxed text-foreground-secondary">{selected.description}</p>}
              <section aria-label="Members">
                <h3 className="text-sm font-semibold text-foreground">Members ({membersQ.data?.length ?? 0})</h3>
                {membersQ.isLoading ? (
                  <p className="mt-1 text-[13px] text-muted-foreground" role="status">Loading members…</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {(membersQ.data ?? []).map((m: { id: string; full_name: string; email: string; company_role: string }) => (
                      <li key={m.id} className="flex items-center gap-2.5 rounded-lg bg-surface-secondary/50 px-3 py-2">
                        <Avatar name={m.full_name || m.email} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{m.full_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                        </span>
                        <StatusBadge status={m.company_role} size="sm" showDot={false} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Offers">
                <h3 className="text-sm font-semibold text-foreground">Offers ({companyOffers.length})</h3>
                <ul className="mt-2 space-y-1.5">
                  {companyOffers.slice(0, 8).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-secondary/50 px-3 py-2 text-[13px]">
                      <span className="truncate font-medium">{o.title}</span>
                      <StatusBadge status={o.active ? "active" : "paused"} size="sm" showDot={false} />
                    </li>
                  ))}
                  {companyOffers.length === 0 && <li className="text-[13px] text-muted-foreground">No offers published.</li>}
                </ul>
              </section>
            </div>
          )}
        </Drawer>
      </div>
    </AdminShell>
  );
}
