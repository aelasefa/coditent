"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";

import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { getAdminUsers, impersonateUser } from "@/lib/api";
import { saveToken } from "@/lib/auth";

export default function AdminUsersPage() {
  const router = useRouter();

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: getAdminUsers,
  });

  const impersonateMutation = useMutation({
    mutationFn: impersonateUser,
    onSuccess: (data) => {
      saveToken(data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      if (data.user.role === "RECRUITER") {
        router.push("/recruiter");
        return;
      }
      router.push("/dashboard");
    },
  });

  return (
    <main className="min-h-screen bg-md-background pb-14">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">Admin workspace</p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight">All users</h1>
          </div>
          <Link className="rounded-full border border-md-outline/60 px-4 py-2 text-sm text-md-primary" href="/admin">
            Back to dashboard
          </Link>
        </header>

        {usersQuery.isLoading ? <MdCard className="mt-6 p-6">Loading users...</MdCard> : null}

        <div className="mt-6 space-y-4">
          {usersQuery.data?.map((user) => (
            <MdCard key={user.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-medium">{user.full_name}</p>
                <p className="text-sm text-md-onSurfaceVariant">{user.email}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-md-onSurfaceVariant">
                  {user.role} {user.role === "RECRUITER" ? `- ${user.is_approved ? "approved" : "pending"}` : ""}
                </p>
              </div>
              {user.role !== "ADMIN" ? (
                <MdButton
                  disabled={impersonateMutation.isPending}
                  onClick={() => impersonateMutation.mutate(user.id)}
                  size="sm"
                  variant="outlined"
                >
                  Login as user
                </MdButton>
              ) : null}
            </MdCard>
          ))}
        </div>
      </div>
    </main>
  );
}
