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
    <main className="relative min-h-screen overflow-hidden bg-md-background pb-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="md-glow absolute -left-20 top-8 h-80 w-80 rounded-full bg-md-primary/18 blur-3xl" />
        <div className="md-glow absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-md-tertiary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-md-secondaryContainer/50 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="md-fade-up flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-md-onSurfaceVariant">
              Candidate workspace
            </p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight sm:text-4xl">Profile builder</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-md-onSurfaceVariant sm:text-base">
              Build a recruiter-ready profile with clearer context and stronger recommendations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-full border border-md-outline/60 px-4 text-sm font-medium text-md-primary transition-all duration-300 ease-md hover:bg-md-primary/10 active:scale-95"
              href="/dashboard/recommendations"
            >
              Recommendations
            </Link>
            <LogoutButton />
          </div>
        </header>

        <div className="mt-7 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <MdCard className="md-fade-up p-6">
              <p className="text-xs uppercase tracking-[0.12em] text-md-onSurfaceVariant">Profile strength</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-4xl font-medium text-md-primary">{completionPercent}%</p>
                <p className="text-right text-xs text-md-onSurfaceVariant">
                  {completedCount}/{completionKeys.length} sections completed
                </p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-md-secondaryContainer">
                <div
                  className="h-full rounded-full bg-md-primary transition-all duration-300 ease-md"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-md-onSurfaceVariant">Last updated: {updatedAtLabel}</p>
            </MdCard>

            <MdCard className="md-fade-up md-fade-delay-1 p-6">
              <h2 className="text-sm font-medium">Profile checklist</h2>
              <ul className="mt-3 space-y-2.5">
                {completionItems.map((item, index) => (
                  <li className="flex items-center gap-2" key={item.key}>
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-medium ${
                        item.done
                          ? "border-md-primary bg-md-secondaryContainer text-md-primary"
                          : "border-md-outline/50 bg-md-background text-md-onSurfaceVariant"
                      }`}
                    >
                      {item.done ? "v" : index + 1}
                    </span>
                    <span className={`text-sm ${item.done ? "text-md-foreground" : "text-md-onSurfaceVariant"}`}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </MdCard>
          </aside>

          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => {
              const years = values.years_of_experience.trim();
              updateMutation.mutate({
                headline: toNullable(values.headline),
                bio: toNullable(values.bio),
                skills: toNullable(values.skills),
                years_of_experience: years ? Number(years) : null,
                city: toNullable(values.city),
                phone: toNullable(values.phone),
                field_of_study: toNullable(values.field_of_study),
                university: toNullable(values.university),
                study_level: values.study_level || null,
                linkedin_url: toNullable(values.linkedin_url),
                portfolio_url: toNullable(values.portfolio_url),
              });
            })}
          >
            <MdCard className="md-fade-up p-6 sm:p-7">
              <h2 className="text-xl font-medium">Professional snapshot</h2>
              <p className="mt-1 text-sm text-md-onSurfaceVariant">
                Give recruiters a fast view of your role, strengths, and impact.
              </p>

              <div className="mt-5 space-y-4">
                <MdField error={form.formState.errors.headline?.message} label="Headline">
                  <MdInput
                    placeholder="Junior Data Analyst focused on retail insights"
                    {...form.register("headline")}
                  />
                </MdField>

                <MdField error={form.formState.errors.bio?.message} label="Bio">
                  <MdTextArea
                    placeholder="Summarize your strengths, project context, and practical impact."
                    rows={5}
                    {...form.register("bio")}
                  />
                </MdField>

                <MdField error={form.formState.errors.skills?.message} label="Skills">
                  <MdTextArea
                    placeholder="Comma separated: Python, SQL, Power BI, client communication"
                    rows={3}
                    {...form.register("skills")}
                  />
                </MdField>

                <MdField
                  error={form.formState.errors.years_of_experience?.message}
                  label="Years of experience"
                >
                  <MdInput min={0} max={40} placeholder="0" type="number" {...form.register("years_of_experience")} />
                </MdField>
              </div>
            </MdCard>

            <MdCard className="md-fade-up md-fade-delay-1 p-6 sm:p-7">
              <h2 className="text-xl font-medium">Education</h2>
              <p className="mt-1 text-sm text-md-onSurfaceVariant">
                Add background details that improve recommendation quality.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <MdField error={form.formState.errors.field_of_study?.message} label="Field of study">
                  <MdInput placeholder="Computer Science" {...form.register("field_of_study")} />
                </MdField>

                <MdField error={form.formState.errors.university?.message} label="University">
                  <MdInput placeholder="ENSA Casablanca" {...form.register("university")} />
                </MdField>

                <MdField error={form.formState.errors.study_level?.message} label="Study level">
                  <MdSelect {...form.register("study_level")}>
                    <option value="">Select level</option>
                    <option value="BAC">BAC</option>
                    <option value="LICENCE">LICENCE</option>
                    <option value="MASTER">MASTER</option>
                    <option value="DOCTORAT">DOCTORAT</option>
                  </MdSelect>
                </MdField>
              </div>
            </MdCard>

            <MdCard className="md-fade-up md-fade-delay-2 p-6 sm:p-7">
              <h2 className="text-xl font-medium">Contact and links</h2>
              <p className="mt-1 text-sm text-md-onSurfaceVariant">
                Help recruiters reach you and verify your online profile.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <MdField error={form.formState.errors.city?.message} label="City">
                  <MdInput placeholder="Rabat" {...form.register("city")} />
                </MdField>

                <MdField error={form.formState.errors.phone?.message} label="Phone">
                  <MdInput placeholder="+212 6 00 00 00 00" {...form.register("phone")} />
                </MdField>

                <MdField error={form.formState.errors.linkedin_url?.message} label="LinkedIn URL">
                  <MdInput
                    placeholder="https://www.linkedin.com/in/your-profile"
                    {...form.register("linkedin_url")}
                  />
                </MdField>

                <MdField error={form.formState.errors.portfolio_url?.message} label="Portfolio URL">
                  <MdInput placeholder="https://your-portfolio.com" {...form.register("portfolio_url")} />
                </MdField>
              </div>
            </MdCard>

            <MdCard className="md-fade-up md-fade-delay-3 p-6 sm:p-7">
              {profileQuery.isLoading ? (
                <p className="text-sm text-md-onSurfaceVariant">Loading profile...</p>
              ) : null}

              {profileQuery.isError ? (
                <p className="text-sm font-medium text-rose-700">
                  Unable to load profile right now. You can still edit and save.
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <MdButton disabled={updateMutation.isPending} type="submit" variant="filled">
                  {updateMutation.isPending ? "Saving..." : "Save profile"}
                </MdButton>

                {updateMutation.isSuccess ? (
                  <p className="text-sm font-medium text-emerald-700">Profile saved.</p>
                ) : null}

                {updateMutation.isError ? (
                  <p className="text-sm font-medium text-rose-700">Save failed. Check your entries and retry.</p>
                ) : null}
              </div>
            </MdCard>
          </form>
        </div>
      </div>
    </main>
  );
}
