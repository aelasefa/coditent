"use client";

import { useRouter } from "next/navigation";

import { MdButton } from "@/components/ui/md-button";
import { removeToken } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  return (
    <MdButton
      size="sm"
      onClick={() => {
        removeToken();
        router.push("/login");
      }}
      variant="outlined"
    >
      Logout
    </MdButton>
  );
}
