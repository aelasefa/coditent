"use client";

import { useRouter } from "next/navigation";

import { MdButton } from "@/components/ui/md-button";
import { logoutSession } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();

  return (
    <MdButton
      size="sm"
      onClick={async () => {
        await logoutSession().catch(() => undefined);
        router.push("/login");
      }}
      variant="outlined"
    >
      Logout
    </MdButton>
  );
}
