"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getMe, logoutAllDevices } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-error";

export function LogoutAllDevices() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function close() {
    if (pending.current) return;
    setOpen(false);
    setError(null);
  }

  async function confirmLogout() {
    if (!open || !me || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);

    try {
      await logoutAllDevices();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not log out of all devices. Please try again."));
      pending.current = false;
      setBusy(false);
      return;
    }

    // Clear rather than invalidate: refetching here would use a revoked session.
    queryClient.clear();
    setOpen(false);
    toast("Logged out of all devices", { variant: "success", description: "Sign in again to continue." });
    router.replace(me.role === "ADMIN" ? "/admin/login" : "/login");
  }

  if (!me) return null;

  return (
    <section aria-labelledby="device-sessions-heading" className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
      <div>
        <h2 id="device-sessions-heading" className="text-base font-semibold text-foreground">Device sessions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          End your sessions on every device, including this one. You will need to sign in again.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={busy}>
        Log out of all devices
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Log out of all devices?"
        description="This includes your current browser."
        size="md"
        initialFocusRef={cancelRef}
        dismissOnOverlayClick={!busy}
        footer={
          <>
            <Button ref={cancelRef} type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={confirmLogout} loading={busy}>
              {busy ? "Logging out…" : "Log out everywhere"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground-secondary">You will be returned to the login page. Your account and saved work will not be deleted.</p>
        {busy ? <p role="status" className="mt-3 text-sm text-muted-foreground">Ending your sessions…</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-lg bg-danger-background p-3 text-sm text-danger">{error}</p> : null}
      </Dialog>
    </section>
  );
}
