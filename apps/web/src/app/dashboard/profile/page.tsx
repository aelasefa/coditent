"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FiArrowRight, FiCheck, FiFileText, FiTrash2, FiUpload, FiX } from "react-icons/fi";
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
import { isQualityBio } from "@/lib/bio-utils";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getProfileCompletion } from "@/components/candidate/profile-completion";
import styles from "@/components/candidate/candidate-pages.module.css";

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

type ProfileSection = "about" | "experience" | "skills" | "links" | "documents";
const PROFILE_SECTIONS: Array<{ id: ProfileSection; label: string; description: string }> = [
  { id: "about", label: "About", description: "Introduce yourself in your own words." },
  { id: "experience", label: "Experience", description: "Show where you have studied and worked." },
  { id: "skills", label: "Skills", description: "Highlight the strengths recruiters can search for." },
  { id: "links", label: "Links", description: "Connect your work and professional presence." },
  { id: "documents", label: "Documents", description: "Keep your CV ready for applications." },
];

function toProfileValues(profile: Partial<import("@/lib/types").Profile>): ProfileValues {
  return {
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    skills: profile.skills ?? "",
    years_of_experience: profile.years_of_experience != null ? String(profile.years_of_experience) : "",
    city: profile.city ?? "",
    phone: profile.phone ?? "",
    field_of_study: profile.field_of_study ?? "",
    university: profile.university ?? "",
    study_level: profile.study_level ?? "",
    linkedin_url: profile.linkedin_url ?? "",
    portfolio_url: profile.portfolio_url ?? "",
  };
}

export default function ProfileBuilderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<ProfileSection>("about");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
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
  const photoFileRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const cancelNavigationRef = useRef<HTMLButtonElement>(null);
  const navigationAllowedRef = useRef(false);

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
    if (form.formState.isDirty) return;
    form.reset(toProfileValues(profileQuery.data));
    setSkills(profileQuery.data.skills?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);
  }, [profileQuery.data, form]);

  const values = form.watch();
  const completion = getProfileCompletion(profileQuery.data, userQuery.data?.avatar_url);
  const hasCv = Boolean(cvMeta?.filename || profileQuery.data?.cv_url);
  const doneCount = completion.done;
  const totalCount = completion.total;

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast("Profile updated", { variant: "success" });
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
      bioGenRef.current = false;
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
      setDeleteDialogOpen(false);
    } catch {
      setCvError("CV delete failed.");
      toast("Could not remove CV", { description: "Please retry.", variant: "error" });
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
    if (updateMutation.isPending) return;
    try {
      if (photoFile && photoPreview) {
        await updateAvatar(photoPreview);
        queryClient.invalidateQueries({ queryKey: ["me"] });
        setPhotoFile(null);
      }
      const years = vals.years_of_experience.trim();
      const saved = await updateMutation.mutateAsync({
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
      form.reset(toProfileValues(saved));
    } catch {
      // Mutation errors are reported by the shared toast handler.
    }
  }, (errors) => {
    const first = Object.keys(errors)[0] as keyof ProfileValues | undefined;
    if (!first) return;
    const section: ProfileSection = first === "bio" || first === "headline" || first === "city" || first === "phone"
      ? "about" : first === "years_of_experience" || first === "field_of_study" || first === "university" || first === "study_level"
        ? "experience" : first === "skills" ? "skills" : "links";
    setActiveSection(section);
    toast("Review the highlighted field", { description: "Your changes are still here.", variant: "warning" });
    window.setTimeout(() => form.setFocus(first), 0);
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      toast("Choose an image under 2 MB", { variant: "warning" });
      e.target.value = "";
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const discardChanges = () => {
    form.reset();
    setSkills(profileQuery.data?.skills?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);
    setPhotoFile(null);
    setPhotoPreview(userQuery.data?.avatar_url ?? null);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % PROFILE_SECTIONS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + PROFILE_SECTIONS.length) % PROFILE_SECTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PROFILE_SECTIONS.length - 1;
    else return;
    event.preventDefault();
    setActiveSection(PROFILE_SECTIONS[next].id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
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

  const fullName = userQuery.data?.full_name ?? "Candidate";
  const loading = profileQuery.isLoading || userQuery.isLoading;
  const assessmentStatuses = useMemo(() => {
    const list = assessmentsQuery.data?.assessments ?? [];
    const counts: Record<string, number> = {};
    list.forEach((a) => {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    });
    return { total: list.length, counts };
  }, [assessmentsQuery.data]);

  const active = PROFILE_SECTIONS.find((section) => section.id === activeSection)!;
  const hasDraft = form.formState.isDirty || Boolean(photoFile);
  useEffect(() => {
    if (!hasDraft) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (navigationAllowedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onLinkClick = (event: MouseEvent) => {
      if (navigationAllowedRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const next = new URL(link.href, window.location.href);
      if (next.origin !== window.location.origin || next.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(`${next.pathname}${next.search}${next.hash}`);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [hasDraft]);
  const assessmentSummary = Object.entries(assessmentStatuses.counts)
    .map(([status, count]) => `${count} ${status.replace(/_/g, " ")}`)
    .join(" · ");

  return (
    <PageContainer variant="wide" className={styles.profilePage}>
      <section className={styles.profileIntro} aria-labelledby="profile-heading">
        <div className={styles.profileIntroCopy}>
          <p className={styles.eyebrow}>Candidate profile</p>
          <div className={styles.profileIdentity}>
            <Avatar name={fullName} size="xl" src={photoPreview} className={styles.profileAvatar} />
            <div className="min-w-0">
              <h1 id="profile-heading" className={styles.profileTitle}>{loading ? "Your profile" : fullName}</h1>
              <p>{values.headline || "Add a headline that describes the work you do."}</p>
              <span>{[values.city, values.field_of_study].filter(Boolean).join(" · ") || "Add your city and field"}</span>
            </div>
          </div>
          <div className={styles.profileIntroActions}>
            <input ref={photoFileRef} type="file" accept="image/*" onChange={handlePhotoChange} className="sr-only" aria-label="Choose profile photo" />
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => photoFileRef.current?.click()}>Change photo</Button>
            <span>Image up to 2 MB</span>
          </div>
        </div>
        <div className={styles.profileArtwork}>
          <Image src="/images/candidate/profile-builder.png" alt="" fill sizes="(max-width: 767px) 100vw, 45vw" />
        </div>
      </section>

      {loading ? (
        <div className="space-y-4" role="status" aria-label="Loading profile">
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <section className={styles.profileStatus} aria-label="Profile overview">
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Profile readiness</span>
              <div className={styles.statusValue}><strong>{Math.round((doneCount / totalCount) * 100)}%</strong><span>{doneCount} of {totalCount} complete</span></div>
              <div className={styles.statusProgress} role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={totalCount} aria-label="Profile completeness">
                <span style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
              </div>
              <p>{completion.missing.length ? `Next: ${completion.missing.slice(0, 2).join(", ")}` : "All profile details are in place."}</p>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>CV</span>
              <div className={styles.statusValue}><FiFileText aria-hidden /><strong className={styles.statusText}>{hasCv ? "Ready to use" : "Add your CV"}</strong></div>
              <p className={styles.truncate}>{hasCv ? cvMeta?.filename ?? "CV uploaded" : "PDF or DOCX · up to 5 MB"}</p>
              <button type="button" onClick={() => setActiveSection("documents")} className={styles.statusLink}>Manage CV <FiArrowRight aria-hidden /></button>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Assessments</span>
              <div className={styles.statusValue}><strong>{assessmentStatuses.total}</strong><span>assigned</span></div>
              <p>{assessmentsQuery.isLoading ? "Loading assessment activity" : assessmentSummary || "No assessments assigned yet."}</p>
            </div>
          </section>

          <div className={styles.editorShell}>
            <div ref={tabsRef} className={styles.profileTabs} role="tablist" aria-label="Profile sections">
              {PROFILE_SECTIONS.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={`profile-tab-${section.id}`}
                  aria-selected={activeSection === section.id}
                  aria-controls={`profile-panel-${section.id}`}
                  tabIndex={activeSection === section.id ? 0 : -1}
                  onClick={() => setActiveSection(section.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={activeSection === section.id ? styles.profileTabActive : styles.profileTab}
                >
                  {section.label}
                </button>
              ))}
            </div>

            <form noValidate onSubmit={handleSave} className={styles.profileForm}>
              <div key={activeSection} role="tabpanel" id={`profile-panel-${activeSection}`} aria-labelledby={`profile-tab-${activeSection}`} tabIndex={0} className={styles.profilePanel}>
                <header className={styles.panelHeader}>
                  <div><p className={styles.eyebrow}>Edit your profile</p><h2>{active.label}</h2><p>{active.description}</p></div>
                  <span>{PROFILE_SECTIONS.findIndex((s) => s.id === activeSection) + 1} / {PROFILE_SECTIONS.length}</span>
                </header>

                {activeSection === "about" ? (
                  <div className={styles.formStack}>
                    <div className={styles.formFieldGroup}>
                      <Input label="Professional headline" placeholder="e.g. Frontend developer focused on accessible products" maxLength={120} {...form.register("headline")} error={form.formState.errors.headline?.message} />
                      <Button type="button" size="sm" variant="ghost" onClick={handleGenerateHeadline} loading={aiLoading === "headline"}>Suggest a headline</Button>
                    </div>
                    <div className={styles.formTwoColumns}>
                      <Input label="City" placeholder="Where are you based?" {...form.register("city")} error={form.formState.errors.city?.message} />
                      <Input label="Phone" type="tel" autoComplete="tel" placeholder="Contact number" {...form.register("phone")} error={form.formState.errors.phone?.message} />
                    </div>
                    <div className={styles.formFieldGroup}>
                      <Textarea label="Professional summary" placeholder="Describe your experience, strengths, and what you want to work on next." maxLength={500} rows={7} className="resize-none" {...form.register("bio")} error={form.formState.errors.bio?.message} />
                      <div className={styles.fieldFooter}><Button type="button" size="sm" variant="ghost" onClick={handleGenerateBio} loading={aiLoading === "bio"}>Suggest a summary</Button><span>{values.bio?.length ?? 0} / 500</span></div>
                    </div>
                  </div>
                ) : null}

                {activeSection === "experience" ? (
                  <div className={styles.formTwoColumns}>
                    <Input label="Years of experience" inputMode="numeric" placeholder="0" {...form.register("years_of_experience")} error={form.formState.errors.years_of_experience?.message} />
                    <Input label="Field of study" placeholder="Your area of study" {...form.register("field_of_study")} error={form.formState.errors.field_of_study?.message} />
                    <Input label="University" placeholder="School or university" {...form.register("university")} error={form.formState.errors.university?.message} />
                    <Select label="Study level" {...form.register("study_level")} error={form.formState.errors.study_level?.message}>
                      <option value="">Select level</option><option value="BAC">BAC</option><option value="LICENCE">Licence</option><option value="MASTER">Master</option><option value="DOCTORAT">Doctorat</option>
                    </Select>
                  </div>
                ) : null}

                {activeSection === "skills" ? (
                  <div className={styles.skillsEditor}>
                    <label htmlFor="profile-skill-input">Add a skill</label>
                    <p>Enter a skill and press Enter or comma. Add up to 20.</p>
                    <input id="profile-skill-input" className={styles.skillInput} placeholder="e.g. React, research, project planning" onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;
                      if ((event.key === "Enter" || event.key === ",") && event.currentTarget.value.trim()) {
                        event.preventDefault();
                        addSkill(event.currentTarget.value);
                        event.currentTarget.value = "";
                      }
                    }} />
                    <div className={styles.skillsList} aria-label="Added skills">
                      {skills.length ? skills.map((skill) => (
                        <span key={skill} className={styles.skillChip}>{skill}<button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove skill ${skill}`}><FiX aria-hidden /></button></span>
                      )) : <p>No skills added yet.</p>}
                    </div>
                    {form.formState.errors.skills?.message ? <p role="alert" className="text-sm text-danger">{form.formState.errors.skills.message}</p> : null}
                  </div>
                ) : null}

                {activeSection === "links" ? (
                  <div className={styles.formTwoColumns}>
                    <Input label="LinkedIn URL" type="url" placeholder="https://" {...form.register("linkedin_url")} error={form.formState.errors.linkedin_url?.message} />
                    <Input label="Portfolio URL" type="url" placeholder="https://" {...form.register("portfolio_url")} error={form.formState.errors.portfolio_url?.message} />
                  </div>
                ) : null}

                {activeSection === "documents" ? (
                  <div className={styles.documentEditor}>
                    <div className={styles.documentCurrent}>
                      <FiFileText aria-hidden />
                      <div><strong>{hasCv ? cvMeta?.filename ?? "CV uploaded" : "No CV uploaded"}</strong><p>{hasCv ? "This CV is available when you apply." : "Upload a PDF or DOCX file to make applying easier."}</p></div>
                      {hasCv && profileQuery.data?.cv_url ? <a href={getCVDownloadUrl()} target="_blank" rel="noreferrer noopener">Download</a> : null}
                    </div>
                    <input ref={cvFileRef} type="file" accept=".pdf,.docx" onChange={handleCVSelect} className="sr-only" aria-label="Choose CV file" />
                    <div className={styles.documentActions}>
                      <Button type="button" variant="outline" onClick={() => cvFileRef.current?.click()} loading={cvBusy === "uploading"}><FiUpload aria-hidden /> {hasCv ? "Replace CV" : "Upload CV"}</Button>
                      {hasCv ? <Button type="button" variant="ghost" onClick={() => setDeleteDialogOpen(true)}><FiTrash2 aria-hidden /> Remove CV</Button> : null}
                    </div>
                    <p className={styles.documentHelp}>PDF or DOCX · maximum 5 MB. Extracted information is only applied after you review it.</p>
                    {cvBusy !== "idle" ? <p role="status" className={styles.cvMessage}>{cvBusy === "uploading" ? `Uploading ${cvProgress}%` : "Reading your CV…"}</p> : null}
                    {cvError ? <div role="alert" className={styles.cvError}><p>{cvError}</p><Button type="button" size="sm" variant="outline" onClick={runParse} loading={cvBusy === "parsing"}>Retry reading</Button></div> : null}
                    {cvOk ? <p role="status" className={styles.cvMessage}>{cvOk}</p> : null}
                    {extracted ? <div className={styles.extractedPanel}>
                      <h3>Review details from your CV</h3>
                      {cvWarnings.length ? <ul>{cvWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
                      <div className={styles.extractedList}>
                        {Object.entries(reviewValues).map(([key, value]) => value ? <label key={key}><input type="checkbox" checked={Boolean(useExtracted[key])} onChange={(event) => setUseExtracted((previous) => ({ ...previous, [key]: event.target.checked }))} /><span><strong>{key.replace(/_/g, " ")}</strong>{value}</span></label> : null)}
                        {extracted.skills?.length ? <label><input type="checkbox" checked={Boolean(useExtracted.skills)} onChange={(event) => setUseExtracted((previous) => ({ ...previous, skills: event.target.checked }))} /><span><strong>Skills</strong>{extracted.skills.join(", ")}</span></label> : null}
                      </div>
                      <Button type="button" size="sm" onClick={applyExtractedToForm}>Apply selected details</Button>
                    </div> : null}
                  </div>
                ) : null}
              </div>

              {hasDraft ? <div className={styles.saveBar} role="status"><div><FiCheck aria-hidden /><span>Unsaved profile changes</span></div><div><Button type="button" variant="ghost" onClick={discardChanges}>Discard</Button><Button type="submit" loading={updateMutation.isPending}>Save changes</Button></div></div> : null}
            </form>
          </div>
        </>
      )}

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} title="Remove your CV?" description="You can upload another CV later." initialFocusRef={cancelDeleteRef} footer={<><Button ref={cancelDeleteRef} type="button" variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Keep CV</Button><Button type="button" variant="danger" onClick={handleCVDelete}>Remove CV</Button></>}>
        <p className="text-sm text-foreground-secondary">Your existing CV file will no longer be available for future applications.</p>
      </Dialog>
      <Dialog open={Boolean(pendingNavigation)} onClose={() => setPendingNavigation(null)} title="Leave profile editing?" description="Your unsaved changes will be lost." initialFocusRef={cancelNavigationRef} footer={<><Button ref={cancelNavigationRef} type="button" variant="outline" onClick={() => setPendingNavigation(null)}>Keep editing</Button><Button type="button" variant="danger" onClick={() => { if (!pendingNavigation) return; navigationAllowedRef.current = true; router.push(pendingNavigation); }}>Leave without saving</Button></>}>
        <p className="text-sm text-foreground-secondary">Save your profile before leaving if you want to keep these edits.</p>
      </Dialog>
    </PageContainer>
  );
}
