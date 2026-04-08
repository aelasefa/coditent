"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { LogoutButton } from "@/components/logout-button";
import { MdButton } from "@/components/ui/md-button";
import { MdCard } from "@/components/ui/md-card";
import { MdField, MdInput, MdSelect, MdTextArea } from "@/components/ui/md-field";
import { getProfile, updateProfile } from "@/lib/api";

const urlField = z.union([z.literal(""), z.string().url("Enter a valid URL")]);

const profileSchema = z.object({
  headline: z.string().max(120, "Headline must be 120 characters or less"),
  bio: z.string().max(1500, "Bio must be 1500 characters or less"),
  skills: z.string().max(500, "Skills must be 500 characters or less"),
  years_of_experience: z
    .string()
    .regex(/^\d*$/, "Use whole numbers only")
    .refine((value) => value === "" || Number(value) <= 40, "Years must be between 0 and 40"),
  city: z.string().max(100, "City must be 100 characters or less"),
  phone: z.string().max(30, "Phone must be 30 characters or less"),
  field_of_study: z.string().max(120, "Field of study must be 120 characters or less"),
  university: z.string().max(160, "University must be 160 characters or less"),
  study_level: z.enum(["", "BAC", "LICENCE", "MASTER", "DOCTORAT"]),
  linkedin_url: urlField,
  portfolio_url: urlField,
});

type ProfileValues = z.infer<typeof profileSchema>;

const completionKeys = [
  "headline",
  "bio",
  "skills",
  "years_of_experience",
  "field_of_study",
  "study_level",
  "city",
  "phone",
  "linkedin_url",
  "portfolio_url",
] as const satisfies ReadonlyArray<keyof ProfileValues>;

const completionLabels: Record<(typeof completionKeys)[number], string> = {
  headline: "Professional headline",
  bio: "Bio summary",
  skills: "Key skills",
  years_of_experience: "Years of experience",
  field_of_study: "Field of study",
  study_level: "Study level",
  city: "City",
  phone: "Phone number",
  linkedin_url: "LinkedIn URL",
  portfolio_url: "Portfolio URL",
};

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function ProfilePage() {
  const queryClient = useQueryClient();

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

  const watchedValues = form.watch(completionKeys);

  const completedCount = useMemo(() => {
    return watchedValues.filter(
      (value) => typeof value === "string" && value.trim().length > 0
    ).length;
  }, [watchedValues]);

  const completionPercent = useMemo(() => {
    return Math.round((completedCount / completionKeys.length) * 100);
  }, [completedCount]);

  const completionItems = useMemo(() => {
    return completionKeys.map((key, index) => {
      const value = watchedValues[index];
      const done = typeof value === "string" && value.trim().length > 0;

      return {
        key,
        label: completionLabels[key],
        done,
      };
    });
  }, [watchedValues]);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    form.reset({
      headline: profileQuery.data.headline ?? "",
      bio: profileQuery.data.bio ?? "",
      skills: profileQuery.data.skills ?? "",
      years_of_experience:
        profileQuery.data.years_of_experience !== null &&
        profileQuery.data.years_of_experience !== undefined
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
  }, [form, profileQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const updatedAtLabel = useMemo(() => {
    if (!profileQuery.data?.updated_at) {
      return "Not updated yet";
    }

    return new Date(profileQuery.data.updated_at).toLocaleString();
  }, [profileQuery.data?.updated_at]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Candidate Profile</h1>
        <Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/dashboard">
          Back to dashboard
        </Link>
      </header>

      {profileQuery.isLoading ? <p className="text-sm text-slate-600">Loading profile...</p> : null}
      {profileQuery.isError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Unable to load profile data.
        </p>
      ) : null}

      <form
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={form.handleSubmit((values) =>
          updateMutation.mutate({
            city: values.city || null,
            phone: values.phone || null,
            field_of_study: values.field_of_study || null,
            university: values.university || null,
            study_level: values.study_level || null,
          })
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">City</label>
            <input className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("city")} />
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.city?.message}</p>
          </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="md-fade-up flex flex-wrap items-center justify-between gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <input className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("phone")} />
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.phone?.message}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Field of study</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              {...form.register("field_of_study")}
            />
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.field_of_study?.message}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">University</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              {...form.register("university")}
            />
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.university?.message}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Study level</label>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2"
              {...form.register("study_level")}
            >
              <option value="">Select level</option>
              <option value="BAC">BAC</option>
              <option value="LICENCE">LICENCE</option>
              <option value="MASTER">MASTER</option>
              <option value="DOCTORAT">DOCTORAT</option>
            </select>
            <p className="mt-1 min-h-5 text-xs text-rose-600">{form.formState.errors.study_level?.message}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
