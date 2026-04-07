import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Candidate Dashboard</h1>
        <LogoutButton />
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link className="rounded border border-slate-200 bg-white p-4" href="/dashboard/profile">
          Update Profile
        </Link>
        <Link
          className="rounded border border-slate-200 bg-white p-4"
          href="/dashboard/recommendations"
        >
          Recommendations
        </Link>
      </div>
    </main>
  );
}
