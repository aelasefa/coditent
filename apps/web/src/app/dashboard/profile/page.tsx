"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FiEdit2, FiFileText, FiTrash2, FiUpload, FiUser, FiX } from "react-icons/fi";
import {
  deleteCV,
  getAssessments,
  getCVMeta,
  getCVDownloadUrl,
  getMe,
  getProfile,
  parseCV,
  updateAvatar,
  updateProfile,
  uploadCV,
} from "@/lib/api";
import type { CVExtracted } from "@/lib/types";
import { api } from "@/lib/api";
import { isQualityBio } from "@/lib/bio-utils";
import { PageContainer, PageHeader } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

const urlField = z.union([z.literal(""), z.string().url("Enter a valid URL starting with https://")]);

const profileSchema = z.object({
  headline: z.string().max(120, "Headline must be 120 characters or less"),
  bio: z.string().max(500, "Bio must be 500 characters or less"),
  skills: z.string().max(500),
  years_of_experience: z
    .string()
    .regex(/^\d*$/, "Years must be a number")
    .refine((v) => v === "" || Number(v) <= 40, "Years must be 40 or less"),
  city: z.string().max(100),
  phone: z.string().max(30),
  field_of_study: z.string().max(120),
  university: z.string().max(160),
  study_level: z.enum(["", "BAC", "LICENCE", "MASTER", "DOCTORAT"]),
  linkedin_url: urlField,
  portfolio_url: urlField,
});

type ProfileValues = z.infer<typeof profileSchema>;

const KNOWN_FIELDS = [
  "headline",
  "bio",
  "skills",
  "years_of_experience",
  "city",
  "phone",
  "field_of_study",
  "university",
  "study_level",
  "linkedin_url",
  "portfolio_url",
] as const;

type SheetKind = null | "basics" | "summary" | "details" | "skills" | "links" | "photo" | "cv";

function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return "U";
  const parts = fullName.split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

export default function ProfileBuilderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState<"headline" | "bio" | null>(null);
  const [cvMeta, setCvMeta] = useState<{ filename?: string | null } | null>(null);
  const [cvProgress, setCvProgress] = useState(0);
  const [cvBusy, setCvBusy] = useState<"idle" | "uploading" | "parsing">("idle");
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvOk, setCvOk] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<CVExtracted | null>(null);
  const [cvWarnings, setCvWarnings] = useState<string[]>([]);
  const [reviewValues, setReviewValues] = useState<Record<string, string>>({});
  const [useExtracted, setUseExtracted] = useState<Record<string, boolean>>({});
  const cvFileRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      headline: "",
      bio: "",
      skills: "",
      years_of_experience: "",
      city: "",
      phone: "",
      field_of_study: "",
      university: "",
      study_level: "",
      linkedin_url: "",
      portfolio_url: "",
    },
  });

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const userQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const cvMetaQuery = useQuery({ queryKey: ["cv-meta"], queryFn: getCVMeta, retry: false });
  const assessmentsQuery = useQuery({
    queryKey: ["my-assessments"],
    queryFn: getAssessments,
    retry: false,
  });
  const appsQuery = useQuery({
    queryKey: ["my-applications"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/applications");
        return (data.applications ?? []) as Array<{
          id: string;
          status: string;
          ai_score?: number | null;
          ai_report?: string | null;
          opportunity?: { title?: string; company?: string } | null;
        }>;
      } catch {
        return [];
      }
    },
  });

  useEffect(() => {
    if (cvMetaQuery.data) setCvMeta(cvMetaQuery.data);
    if (profileQuery.data?.cv_url && !cvMetaQuery.data) {
      setCvMeta({ filename: profileQuery.data.cv_url.split("/").pop() });
    }
  }, [cvMetaQuery.data, profileQuery.data]);

  useEffect(() => {
    if (userQuery.data?.avatar_url && !photoPreview && !photoFile) setPhotoPreview(userQuery.data.avatar_url);
  }, [userQuery.data, photoPreview, photoFile]);

  useEffect(() => {
    if (!profileQuery.data) return;
    form.reset({
      headline: profileQuery.data.headline ?? "",
      bio: profileQuery.data.bio ?? "",
      skills: profileQuery.data.skills ?? "",
      years_of_experience:
        profileQuery.data.years_of_experience !== null && profileQuery.data.years_of_experience !== undefined
          ? String(profileQuery.data.years_of_experience)
          : "",
      city: profileQuery.data.city ?? "",
      phone: profileQuery.data.phone ?? "",
      field_of_study: profileQuery.data.field_of_study ?? "",
      university: profileQuery.data.university ?? "",
      study_level: profileQuery.data.study_level ?? "",
      linkedin_url: profileQuery.data.linkedin_url ?? "",
      portfolio_url: profileQuery.data.portfolio_url ?? "",
    });
    if (profileQuery.data.skills) setSkills(profileQuery.data.skills.split(",").map((s) => s.trim()).filter(Boolean));
  }, [profileQuery.data, form]);

  const values = form.watch();
  const completedRequired = useMemo(() => {
    let done = 0;
    KNOWN_FIELDS.forEach((k) => {
      if (String(values[k] ?? "").trim().length > 0) done += 1;
    });
    return done;
  }, [values]);
  const hasAvatar = Boolean(photoPreview || userQuery.data?.avatar_url);
  const hasCv = Boolean(cvMeta?.filename || profileQuery.data?.cv_url);
  // Deterministic: 11 known fields + avatar + CV = 13 total.
  const doneCount = completedRequired + (hasAvatar ? 1 : 0) + (hasCv ? 1 : 0);
  const totalCount = KNOWN_FIELDS.length + 2;

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast("Profile updated", { variant: "success" });
      setSheet(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Profile save failed";
      toast("Profile save failed", { description: msg, variant: "error" });
    },
  });

  const handleGenerateHeadline = async () => {
    if (skills.length === 0) {
      toast("Add skills first", { description: "AI headline needs at least one skill.", variant: "warning" });
      return;
    }
    setAiLoading("headline");
    try {
      const res = await fetch("/api/ai/generate-headline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills, fieldOfStudy: form.getValues("field_of_study") }),
      });
      const data = await res.json();
      if (data.headline) form.setValue("headline", String(data.headline).slice(0, 120), { shouldDirty: true });
      else toast("AI headline failed", { description: "No headline returned.", variant: "error" });
    } catch {
      toast("AI headline failed", { description: "Retry or write headline manually.", variant: "error" });
    } finally {
      setAiLoading(null);
    }
  };

  const BIO_REQUEST_TIMEOUT_MS = 45000;
  const bioGenRef = useRef(false);

  const handleGenerateBio = async () => {
    // Duplicate guard: ref blocks same-tick double clicks, state blocks later ones
    if (aiLoading || bioGenRef.current) return;
    bioGenRef.current = true;
    if (skills.length === 0) {
      toast("Add skills first", { description: "AI bio needs at least one skill.", variant: "warning" });
      return;
    }
    setAiLoading("bio");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BIO_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/ai/generate-bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills,
          fieldOfStudy: form.getValues("field_of_study"),
          headline: form.getValues("headline"),
        }),
        signal: controller.signal,
      });
      let data: { success?: boolean; bio?: unknown; error?: unknown } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      // Contract: { success: true, bio } — legacy keys normalized intentionally.
      // Client-side quality defense: server already validates, never trust blindly.
      const raw = data && typeof data === "object" ? (data.bio ?? (data as Record<string, unknown>)["text"] ?? (data as Record<string, unknown>)["result"] ?? (data as Record<string, unknown>)["content"] ?? "") : "";
      const bio = typeof raw === "string" ? raw.trim() : "";
      if (res.ok && data && (data as { success?: boolean }).success !== false && isQualityBio(bio)) {
        form.setValue("bio", bio.slice(0, 500), { shouldDirty: true });
        form.clearErrors("bio");
      } else {
        const serverMsg = data && typeof data === "object" && typeof (data as Record<string, unknown>)["error"] === "string" ? String((data as Record<string, unknown>)["error"]) : "";
        toast("Could not generate your bio. Please try again.", { description: serverMsg || undefined, variant: "error" });
      }
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      const offline = error instanceof TypeError;
      toast(timedOut ? "Bio generation timed out. Please try again." : offline ? "Unable to connect to the server. Please check your connection and try again." : "Could not generate your bio. Please try again.", {
        variant: "error",
      });
    } finally {
      clearTimeout(timeout);
      bioGenRef.current = false;
      setAiLoading(null);
    }
  };

  const getApiError = (err: unknown, fallback: string): string => {
    const data = (err as { response?: { data?: { detail?: unknown; message?: unknown } } })?.response?.data;
    const detail = data?.detail;
    if (typeof detail === "string" && detail) return detail;
    if (typeof data?.message === "string" && data.message) return data.message;
    return err instanceof Error && err.message ? err.message : fallback;
  };

  const runParse = async () => {
    setCvBusy("parsing");
    setCvError(null);
    try {
      const parsed = await parseCV();
      setExtracted(parsed.extracted);
      setCvWarnings(parsed.warnings ?? []);
      const init: Record<string, string> = {
        city: parsed.extracted.city ?? "",
        phone: parsed.extracted.phone ?? "",
        field_of_study: parsed.extracted.field_of_study ?? "",
        university: parsed.extracted.university ?? "",
        study_level: parsed.extracted.study_level ?? "",
        years_of_experience: parsed.extracted.years_of_experience?.toString() ?? "",
        linkedin_url: parsed.extracted.linkedin_url ?? "",
        portfolio_url: parsed.extracted.portfolio_url ?? "",
      };
      setReviewValues(init);
      const cur = form.getValues();
      const use: Record<string, boolean> = {};
      Object.keys(init).forEach((k) => {
        const existing = String((cur as Record<string, unknown>)[k] ?? "");
        use[k] = !existing.trim() && Boolean(init[k]);
      });
      use["skills"] = true;
      setUseExtracted(use);
      setCvOk("Extraction done. Review below, then apply and save.");
    } catch (err: unknown) {
      setCvError(getApiError(err, "Extraction failed. Retry or fill profile manually."));
    } finally {
      setCvBusy("idle");
    }
  };

  const handleCVSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvError(null);
    setCvOk(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") {
      setCvError("Invalid file type. Only PDF and DOCX are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCvError("File too large. Maximum size is 5MB.");
      return;
    }
    setCvBusy("uploading");
    setCvProgress(0);
    try {
      const meta = await uploadCV(file, setCvProgress);
      setCvMeta(meta);
      setExtracted(null);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["cv-meta"] });
      setCvOk("CV uploaded. Extracting info...");
      await runParse();
    } catch (err: unknown) {
      setCvError(getApiError(err, "CV upload failed. Retry."));
      setCvBusy("idle");
    } finally {
      if (cvFileRef.current) cvFileRef.current.value = "";
    }
  };

  const handleCVDelete = async () => {
    setCvError(null);
    try {
      await deleteCV();
      setCvMeta(null);
      setExtracted(null);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["cv-meta"] });
      toast("CV deleted", { variant: "success" });
    } catch {
      setCvError("CV delete failed.");
    }
  };

  const applyExtractedToForm = () => {
    if (!extracted) return;
    Object.keys(reviewValues).forEach((k) => {
      if (!useExtracted[k]) return;
      form.setValue(k as keyof ProfileValues, reviewValues[k] ?? "", { shouldDirty: true });
    });
    if (useExtracted["skills"] && extracted.skills?.length) {
      const merged: string[] = [...skills];
      extracted.skills.forEach((s) => {
        if (!merged.some((m) => m.toLowerCase() === s.toLowerCase()) && merged.length < 20) merged.push(s);
      });
      setSkills(merged);
      form.setValue("skills", merged.join(", "), { shouldDirty: true });
    }
    setCvOk("Extracted values applied. Review and save profile.");
  };

  const handleSave = form.handleSubmit(async (vals) => {
    try {
      if (photoFile && photoPreview) {
        await updateAvatar(photoPreview);
        queryClient.invalidateQueries({ queryKey: ["me"] });
        setPhotoFile(null);
      }
      const years = vals.years_of_experience.trim();
      updateMutation.mutate({
        headline: vals.headline.trim() || null,
        bio: vals.bio.trim() || null,
        skills: skills.length > 0 ? skills.join(", ") : null,
        years_of_experience: years ? Number(years) : null,
        city: vals.city.trim() || null,
        phone: vals.phone.trim() || null,
        field_of_study: vals.field_of_study.trim() || null,
        university: vals.university.trim() || null,
        study_level: vals.study_level || null,
        linkedin_url: vals.linkedin_url.trim() || null,
        portfolio_url: vals.portfolio_url.trim() || null,
      });
    } catch {
      toast("Profile save failed", { variant: "error" });
    }
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const addSkill = (raw: string) => {
    const skill = raw.trim().replace(/,$/, "");
    if (!skill || skills.includes(skill) || skills.length >= 20) return;
    const next = [...skills, skill];
    setSkills(next);
    form.setValue("skills", next.join(", "), { shouldDirty: true });
  };
  const removeSkill = (skill: string) => {
    const next = skills.filter((s) => s !== skill);
    setSkills(next);
    form.setValue("skills", next.join(", "), { shouldDirty: true });
  };

  const bioChars = (form.watch("bio") ?? "").length;
  const fullName = userQuery.data?.full_name ?? "Candidate";
  const loading = profileQuery.isLoading || userQuery.isLoading;
  const evaluated = (appsQuery.data ?? []).filter((a) => a.ai_score != null || a.ai_report);
  const assessmentStatuses = useMemo(() => {
    const list = assessmentsQuery.data?.assessments ?? [];
    const counts: Record<string, number> = {};
    list.forEach((a) => {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    });
    return { total: list.length, counts };
  }, [assessmentsQuery.data]);

  const sheetFooter = (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={() => setSheet(null)}>
        Cancel
      </Button>
      <Button onClick={handleSave} loading={updateMutation.isPending}>
        Save changes
      </Button>
    </div>
  );

  return (
    <PageContainer>
      <PageHeader title="Profile" description="What recruiters understand about you. Edit by section." />

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading profile">
          <Skeleton className="h-32" />
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <section aria-label="Profile header" className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-start gap-4">
                {photoPreview ? (
                  <Avatar name={fullName} size="xl" src={photoPreview} />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary text-lg font-bold text-foreground-secondary" aria-hidden>
                    {getInitials(fullName)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-foreground">{fullName}</h2>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {values.headline || form.getValues("headline") || profileQuery.data?.headline || "No headline yet"}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {[profileQuery.data?.city || values.city, profileQuery.data?.field_of_study || values.field_of_study]
                      .filter(Boolean)
                      .join(" · ") || "Location and field not set"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setSheet("photo")}>
                  <FiUser aria-hidden className="h-3.5 w-3.5" /> Edit photo
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSheet("basics")}>
                  <FiEdit2 aria-hidden className="h-3.5 w-3.5" /> Edit basics
                </Button>
              </div>
            </section>

            <section aria-label="Professional summary" className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="ct-card-title">Professional summary</h3>
                <Button size="sm" variant="ghost" onClick={() => setSheet("summary")}>
                  Edit
                </Button>
              </div>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground-secondary">
                {profileQuery.data?.bio || values.bio || "No summary yet. Add a short bio about experience and goals."}
              </p>
            </section>

            <section aria-label="Skills" className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="ct-card-title">Skills</h3>
                <Button size="sm" variant="ghost" onClick={() => setSheet("skills")}>
                  Edit
                </Button>
              </div>
              {skills.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No skills listed yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span key={s} className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-foreground-secondary">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Details" className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="ct-card-title">Experience and education</h3>
                <Button size="sm" variant="ghost" onClick={() => setSheet("details")}>
                  Edit
                </Button>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["Years of experience", profileQuery.data?.years_of_experience?.toString() ?? values.years_of_experience ?? ""],
                  ["Field of study", profileQuery.data?.field_of_study || values.field_of_study || ""],
                  ["University", profileQuery.data?.university || values.university || ""],
                  ["Study level", profileQuery.data?.study_level || values.study_level || ""],
                  ["City", profileQuery.data?.city || values.city || ""],
                  ["Phone", profileQuery.data?.phone || values.phone || ""],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface-secondary/50 px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 font-medium text-foreground">{v || "Not set"}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-label="Links" className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="ct-card-title">Links</h3>
                <Button size="sm" variant="ghost" onClick={() => setSheet("links")}>
                  Edit
                </Button>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                {[
                  { label: "LinkedIn", url: profileQuery.data?.linkedin_url || values.linkedin_url },
                  { label: "Portfolio", url: profileQuery.data?.portfolio_url || values.portfolio_url },
                ]
                  .filter((l) => l.url)
                  .map((l) =>
                    l.url.startsWith("http://") || l.url.startsWith("https://") ? (
                      <a key={l.label} href={l.url} target="_blank" rel="noreferrer noopener" className="block truncate text-primary hover:underline">
                        {l.label}
                      </a>
                    ) : (
                      <p key={l.label} className="truncate text-muted-foreground">
                        {l.label}: {l.url}
                      </p>
                    )
                  )}
                {!profileQuery.data?.linkedin_url && !values.linkedin_url && !profileQuery.data?.portfolio_url && !values.portfolio_url && (
                  <p className="text-muted-foreground">No links added.</p>
                )}
              </div>
            </section>

            <section aria-label="Documents" className="rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="ct-card-title">Documents</h3>
                <Button size="sm" variant="ghost" onClick={() => setSheet("cv")}>
                  Manage CV
                </Button>
              </div>
              {hasCv ? (
                <div className="mt-2 flex items-center gap-3 rounded-lg bg-surface-secondary/50 px-3 py-2.5">
                  <FiFileText aria-hidden className="h-5 w-5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {cvMeta?.filename ?? "CV uploaded"}
                  </span>
                  {profileQuery.data?.cv_url && (
                    <a href={getCVDownloadUrl()} target="_blank" rel="noreferrer noopener" className="text-[13px] font-semibold text-primary hover:underline">
                      Download
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No CV uploaded. PDF or DOCX, max 5MB.</p>
              )}
              {cvError && (
                <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
                  {cvError}
                </p>
              )}
              {cvOk && <p className="mt-2 text-[13px] text-muted-foreground">{cvOk}</p>}
            </section>
          </div>

          <div className="space-y-4">
            <section aria-label="Profile completeness" className="rounded-xl border border-border-subtle bg-surface p-5">
              <h3 className="ct-card-title">Profile completeness</h3>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {doneCount} of {totalCount} complete
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-secondary" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={totalCount} aria-label="Profile completeness">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Deterministic count: 11 profile fields + photo + CV.</p>
            </section>

            <section aria-label="Evaluated skills" className="rounded-xl border border-border-subtle bg-surface p-5">
              <h3 className="ct-card-title">Evaluated skills</h3>
              {evaluated.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No recruiter evaluations yet. Evaluations from applications appear here.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {evaluated.slice(0, 5).map((a) => (
                    <li key={a.id} className="rounded-lg bg-surface-secondary/50 px-3 py-2">
                      <p className="text-sm font-semibold text-foreground">
                        {a.opportunity?.title ?? "Application"}
                        {a.ai_score != null ? ` · score ${a.ai_score}` : ""}
                      </p>
                      {a.ai_report && <p className="mt-0.5 line-clamp-3 text-[13px] text-muted-foreground">{a.ai_report}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">Recruiter-provided evaluation, not self-declared.</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Assessment history" className="rounded-xl border border-border-subtle bg-surface p-5">
              <h3 className="ct-card-title">Assessment history</h3>
              {assessmentsQuery.isLoading ? (
                <Skeleton className="mt-2 h-10" />
              ) : assessmentStatuses.total === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No assessments assigned yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-foreground-secondary">
                  {Object.entries(assessmentStatuses.counts).map(([s, n]) => (
                    <li key={s} className="flex justify-between">
                      <span className="capitalize">{s.replace(/_/g, " ")}</span>
                      <span className="font-semibold text-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Practice history unavailable: no practice backend exists.</p>
            </section>
          </div>
        </div>
      )}

      <Sheet open={sheet === "basics"} onClose={() => setSheet(null)} title="Edit basics" side="right" size="md" footer={sheetFooter}>
        <div className="space-y-3">
          <Input label="Headline" maxLength={120} {...form.register("headline")} error={form.formState.errors.headline?.message} />
          <Button size="sm" variant="outline" onClick={handleGenerateHeadline} loading={aiLoading === "headline"}>
            Generate headline with AI
          </Button>
          <Input label="City" {...form.register("city")} error={form.formState.errors.city?.message} />
          <Input label="Phone" {...form.register("phone")} error={form.formState.errors.phone?.message} />
        </div>
      </Sheet>

      <Sheet open={sheet === "summary"} onClose={() => setSheet(null)} title="Edit summary" side="right" size="md" footer={sheetFooter}>
        <div className="space-y-3">
          <Textarea
            label="Bio"
            maxLength={500}
            showCount
            rows={6}
            {...form.register("bio")}
            error={form.formState.errors.bio?.message}
            helper="Max 500 characters. You can delete freely."
            aria-describedby="bio-help"
          />
          <Button size="sm" variant="outline" onClick={handleGenerateBio} loading={aiLoading === "bio"}>
            Generate bio with AI
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === "skills"} onClose={() => setSheet(null)} title="Edit skills" side="right" size="md" footer={sheetFooter}>
        <div className="space-y-3">
          <label htmlFor="profile-skill-input" className="block text-sm font-medium text-foreground">
            Skills (max 20, Enter or comma to add)
          </label>
          <input
            id="profile-skill-input"
            className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Type a skill and press Enter"
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && e.currentTarget.value.trim()) {
                e.preventDefault();
                addSkill(e.currentTarget.value);
                e.currentTarget.value = "";
              }
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium">
                {s}
                <button type="button" onClick={() => removeSkill(s)} aria-label={`Remove skill ${s}`} className="rounded p-0.5 hover:bg-surface-hover">
                  <FiX aria-hidden className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          {skills.length === 0 && <p className="text-sm text-muted-foreground">No skills yet.</p>}
        </div>
      </Sheet>

      <Sheet open={sheet === "details"} onClose={() => setSheet(null)} title="Edit experience and education" side="right" size="md" footer={sheetFooter}>
        <div className="space-y-3">
          <Input label="Years of experience" inputMode="numeric" {...form.register("years_of_experience")} error={form.formState.errors.years_of_experience?.message} />
          <Input label="Field of study" {...form.register("field_of_study")} error={form.formState.errors.field_of_study?.message} />
          <Input label="University" {...form.register("university")} error={form.formState.errors.university?.message} />
          <Select label="Study level" {...form.register("study_level")} error={form.formState.errors.study_level?.message}>
            <option value="">Select level</option>
            <option value="BAC">BAC</option>
            <option value="LICENCE">Licence</option>
            <option value="MASTER">Master</option>
            <option value="DOCTORAT">Doctorat</option>
          </Select>
        </div>
      </Sheet>

      <Sheet open={sheet === "links"} onClose={() => setSheet(null)} title="Edit links" side="right" size="md" footer={sheetFooter}>
        <div className="space-y-3">
          <Input label="LinkedIn URL" placeholder="https://" {...form.register("linkedin_url")} error={form.formState.errors.linkedin_url?.message} />
          <Input label="Portfolio URL" placeholder="https://" {...form.register("portfolio_url")} error={form.formState.errors.portfolio_url?.message} />
        </div>
      </Sheet>

      <Sheet open={sheet === "photo"} onClose={() => setSheet(null)} title="Edit photo" side="right" size="md" footer={sheetFooter}>
        <div className="space-y-3">
          <label htmlFor="profile-photo" className="block text-sm font-medium text-foreground">
            Profile photo
          </label>
          <input id="profile-photo" type="file" accept="image/*" onChange={handlePhotoChange} className="block w-full text-sm" />
          {photoPreview && <Avatar name={fullName} size="xl" src={photoPreview} />}
          <p className="text-xs text-muted-foreground">Photo saves together with profile on Save changes.</p>
        </div>
      </Sheet>

      <Sheet open={sheet === "cv"} onClose={() => setSheet(null)} title="Manage CV" side="right" size="md">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">PDF or DOCX, max 5MB. Extraction suggests values, never overwrites without tick.</p>
          <input ref={cvFileRef} type="file" accept=".pdf,.docx" onChange={handleCVSelect} aria-label="Upload CV" className="block w-full text-sm" />
          {cvBusy !== "idle" && (
            <p role="status" className="text-sm text-muted-foreground">
              {cvBusy === "uploading" ? `Uploading ${cvProgress}%` : "Parsing CV..."}
            </p>
          )}
          {cvError && (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger-background p-3">
              <p className="text-sm font-semibold text-danger">{cvError}</p>
              <Button size="sm" variant="outline" onClick={runParse} loading={cvBusy === "parsing"}>
                Retry parsing
              </Button>
            </div>
          )}
          {cvOk && <p className="text-sm text-muted-foreground">{cvOk}</p>}
          {extracted && (
            <div className="rounded-xl border border-border-subtle p-3">
              <p className="text-sm font-semibold">Review extracted info</p>
              {cvWarnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                  {cvWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 space-y-1.5">
                {Object.entries(reviewValues).map(([k, v]) =>
                  v ? (
                    <label key={k} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(useExtracted[k])}
                        onChange={(e) => setUseExtracted((p) => ({ ...p, [k]: e.target.checked }))}
                        aria-label={`Use extracted ${k}`}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{k}: </span>
                        <span className="text-muted-foreground">{v}</span>
                      </span>
                    </label>
                  ) : null
                )}
                {extracted.skills?.length ? (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(useExtracted["skills"])}
                      onChange={(e) => setUseExtracted((p) => ({ ...p, skills: e.target.checked }))}
                      aria-label="Use extracted skills"
                      className="mt-1"
                    />
                    <span>skills: {extracted.skills.join(", ")}</span>
                  </label>
                ) : null}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={applyExtractedToForm}>
                  Apply to form
                </Button>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => cvFileRef.current?.click()} loading={cvBusy === "uploading"}>
              <FiUpload aria-hidden className="h-3.5 w-3.5" /> Upload CV
            </Button>
            {hasCv && (
              <Button size="sm" variant="ghost" onClick={handleCVDelete}>
                <FiTrash2 aria-hidden className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setSheet(null)}>
              Close
            </Button>
            <Button onClick={handleSave} loading={updateMutation.isPending}>
              Save profile
            </Button>
          </div>
        </div>
      </Sheet>
    </PageContainer>
  );
}
