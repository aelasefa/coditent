"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  companyLogoSrc,
  deleteCompanyLogo,
  uploadCompanyLogo,
  validateCompanyLogoFile,
} from "@/lib/api";
import type { Company } from "@/lib/types";

interface CompanyLogoSectionProps {
  company: Company | null | undefined;
  canEdit: boolean;
}

export function CompanyLogoSection({ company, canEdit }: CompanyLogoSectionProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentSrc = company ? companyLogoSrc(company) : null;
  const shownSrc = preview ?? currentSrc;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateCompanyLogoFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setPendingFile(file);
    setError(null);
  }

  async function onSave() {
    if (!company || !pendingFile || saving) return;
    setSaving(true);
    setProgress(0);
    setError(null);
    setSaved(false);
    try {
      await uploadCompanyLogo(company.id, pendingFile, (p) => setProgress(p));
      setPendingFile(null);
      if (preview) {
        URL.revokeObjectURL(preview);
        setPreview(null);
      }
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["company", company.id] });
      qc.invalidateQueries({ queryKey: ["company-profile", company.id] });
      toast("Company logo updated", { variant: "success" });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ||
        (e as Error)?.message ||
        "Upload failed";
      setError(String(msg));
      toast("Logo upload failed", { description: String(msg), variant: "error" });
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  function onCancelPreview() {
    setPendingFile(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
    setError(null);
  }

  async function onRemove() {
    if (!company || removing) return;
    setRemoving(true);
    setError(null);
    setSaved(false);
    try {
      await deleteCompanyLogo(company.id);
      onCancelPreview();
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["company", company.id] });
      qc.invalidateQueries({ queryKey: ["company-profile", company.id] });
      toast("Company logo removed", { variant: "success" });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ||
        (e as Error)?.message ||
        "Remove failed";
      setError(String(msg));
      toast("Logo remove failed", { description: String(msg), variant: "error" });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section
      aria-label="Company logo"
      className="rounded-xl border border-border-subtle bg-surface p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">Company logo</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        PNG, JPG, or WebP up to 2MB. Shown on job cards, offer pages, and your workspace.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Avatar
          src={shownSrc}
          name={company?.name || "Company"}
          size="xl"
          className="border border-border-subtle"
        />
        <div className="min-w-0 flex-1">
          {pendingFile ? (
            <p className="text-[13px] text-foreground-secondary">
              Preview: <span className="font-medium text-foreground">{pendingFile.name}</span> — review, then save.
            </p>
          ) : currentSrc ? (
            <p className="text-[13px] text-foreground-secondary">Current logo. Upload a new file to replace it.</p>
          ) : (
            <p className="text-[13px] text-foreground-secondary">
              No logo yet — showing company initials. Upload one to personalize your postings.
            </p>
          )}
          {progress !== null && saving ? (
            <div className="mt-2" role="status" aria-label="Uploading logo">
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Uploading… {progress}%</p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          {saved && !error ? (
            <p role="status" className="mt-2 text-[13px] font-medium text-success">
              Saved.
            </p>
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Native label opens the file dialog without JS, so a blocked
              programmatic click can never leave the button dead. */}
          <label
            className={cn(
              "inline-flex h-8 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-foreground hover:bg-surface-secondary",
              (saving || removing) && "pointer-events-none opacity-50"
            )}
            aria-disabled={saving || removing}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Choose company logo"
              disabled={saving || removing}
              onChange={onFileChange}
            />
            <span>{currentSrc || pendingFile ? "Change logo" : "Upload logo"}</span>
          </label>
          {pendingFile ? (
            <>
              <Button type="button" size="sm" onClick={onSave} loading={saving}>
                Save logo
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onCancelPreview} disabled={saving}>
                Cancel
              </Button>
            </>
          ) : null}
          {currentSrc && !pendingFile ? (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove} loading={removing}>
              Remove
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Read-only for your role. Only Owner and Admin can change the logo.</p>
      )}
    </section>
  );
}
