"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { LogoutButton } from "@/components/logout-button";
import { MdCard } from "@/components/ui/md-card";
import { getAdminActivity, getAdminStats } from "@/lib/api";

export default function AdminDashboardPage() {
  const statsQuery = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: getAdminStats,
  });

  const activityQuery = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: getAdminActivity,
  });

  const stats = statsQuery.data;

  return (
    <main className="min-h-screen bg-md-background pb-14">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Admin workspace</p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Super admin dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link className="rounded-full border border-md-outline/60 px-4 py-2 text-sm text-md-primary" href="/admin/recruiters">
              Recruiters
            </Link>
            <Link className="rounded-full border border-md-outline/60 px-4 py-2 text-sm text-md-primary" href="/admin/users">
              Users
            </Link>
            <Link className="rounded-full border border-md-outline/60 px-4 py-2 text-sm text-md-primary" href="/admin/offers">
              Offers
            </Link>
            <LogoutButton />
          </div>
        </header>

        {statsQuery.isLoading ? <MdCard className="mt-6 p-6">Loading stats...</MdCard> : null}

        {stats ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MdCard className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Total users</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">{stats.total_users}</p>
            </MdCard>
            <MdCard className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Total candidates</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">{stats.total_candidates}</p>
            </MdCard>
            <MdCard className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Total recruiters</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">{stats.total_recruiters}</p>
            </MdCard>
            <MdCard className="p-5">
              <p className="text-sm text-md-onSurfaceVariant">Total offers</p>
              <p className="mt-2 text-2xl font-medium text-md-primary">{stats.total_offers}</p>
            </MdCard>
          </div>
        ) : null}

        <MdCard className="mt-6 p-6">
          <h2 className="text-xl font-medium">Recent admin activity</h2>
          {activityQuery.isLoading ? <p className="mt-3 text-sm text-md-onSurfaceVariant">Loading activity...</p> : null}
          {activityQuery.data?.length ? (
            <div className="mt-4 space-y-3">
              {activityQuery.data.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-md-outline/30 px-4 py-3">
                  <p className="text-sm font-medium">{entry.action}</p>
                  <p className="mt-1 text-xs text-md-onSurfaceVariant">
                    {entry.admin_email}
                    {entry.target_user_email ? ` -> ${entry.target_user_email}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </MdCard>
      </div>
    </main>
  );
}
