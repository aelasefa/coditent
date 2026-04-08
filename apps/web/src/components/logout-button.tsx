"use client";

import { useRouter } from "next/navigation";

import { removeToken } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
      onClick={() => {
        removeToken();
        router.push("/login");
      }}
      type="button"
    >
      Logout
    </button>
  );
}
