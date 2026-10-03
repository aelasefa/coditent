"use client";

import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelAccountDeletion, downloadAccountData, getAccountDeletion, getTwoFactorStatus, scheduleAccountDeletion } from "@/lib/api";


function errorText(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return "The request could not be completed. Please try again.";
}

export function AccountDataControls() {
  const queryClient = useQueryClient();
  const twoFactorQ = useQuery({ queryKey: ["two-factor-status"], queryFn: getTwoFactorStatus });
  const deletionQ = useQuery({ queryKey: ["account-deletion"], queryFn: getAccountDeletion });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const credentials = () => ({ current_password: password, two_factor_code: code || undefined });
  const clearSecretInputs = () => { setPassword(""); setCode(""); };

  const exportMut = useMutation({
    mutationFn: () => downloadAccountData(credentials()),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "coditent-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
      clearSecretInputs();
      setError(null);
      setNotice("Your account export was downloaded.");
    },
    onError: (value) => { setNotice(null); setError(errorText(value)); },
  });
  const scheduleMut = useMutation({
    mutationFn: () => scheduleAccountDeletion({ ...credentials(), confirmation: "DELETE" }),
    onSuccess: (value) => {
      queryClient.setQueryData(["account-deletion"], value);
      clearSecretInputs(); setConfirmation(""); setError(null);
      setNotice("Account deletion is scheduled. You can cancel it before the execution date.");
    },
    onError: (value) => { setNotice(null); setError(errorText(value)); },
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelAccountDeletion(credentials()),
    onSuccess: (value) => {
      queryClient.setQueryData(["account-deletion"], value);
      clearSecretInputs(); setError(null); setNotice("Account deletion was canceled.");
    },
    onError: (value) => { setNotice(null); setError(errorText(value)); },
  });
  const pendingDeletion = deletionQ.data && ["scheduled", "retry"].includes(deletionQ.data.status);

  return (
    <section className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5" aria-labelledby="account-data-heading">
      <div><h2 id="account-data-heading" className="font-semibold text-foreground">Your data</h2><p className="text-sm text-muted-foreground">Download your account data or schedule erasure. Deletion has a seven-day grace period and preserves anonymized hiring records required for integrity.</p></div>
      {error ? <p role="alert" className="rounded-lg bg-danger-background p-3 text-sm text-danger">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-success-background p-3 text-sm text-success">{notice}</p> : null}
      {pendingDeletion ? <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">Deletion scheduled for <strong>{new Date(deletionQ.data!.execute_after).toLocaleString()}</strong>. Private storage must be removed successfully before anonymization completes.</p> : null}
      <Input label="Current password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      {twoFactorQ.data?.is_2fa_enabled ? <Input label="Authenticator or recovery code" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.slice(0, 20))} required /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" loading={exportMut.isPending} disabled={!password} onClick={() => exportMut.mutate()}>Download my data</Button>
        {pendingDeletion ? <Button type="button" variant="secondary" loading={cancelMut.isPending} disabled={!password} onClick={() => cancelMut.mutate()}>Cancel deletion</Button> : null}
      </div>
      {!pendingDeletion ? (
        <div className="space-y-3 border-t border-border-subtle pt-4">
          <div><h3 className="text-sm font-semibold text-danger">Delete account</h3><p className="text-xs text-muted-foreground">Company owners must transfer ownership or archive the company first. Type DELETE to confirm.</p></div>
          <Input label="Confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="DELETE" />
          <Button type="button" variant="danger" loading={scheduleMut.isPending} disabled={!password || confirmation !== "DELETE"} onClick={() => scheduleMut.mutate()}>Schedule account deletion</Button>
        </div>
      ) : null}
    </section>
  );
}
