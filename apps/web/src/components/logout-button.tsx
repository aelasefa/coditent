"use client";

import { useRouter } from "next/navigation";

import { removeToken } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      className="rounded border border-slate-300 px-3 py-1 text-sm"
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
