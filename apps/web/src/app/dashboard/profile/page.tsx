"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Poppins } from "next/font/google";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { getProfile, updateProfile } from "@/lib/api";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
  linkedin_url: "LinkedIn link",
  portfolio_url: "Portfolio link",
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

  const cardClassName =
    "rounded-2xl border border-[#D5D7E0] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.06)] sm:p-6";
  const labelClassName = "mb-1.5 block text-sm font-medium text-[#263137]";
  const inputClassName =
    "w-full rounded-xl border border-[#D5D7E0] bg-white px-3.5 py-2.5 text-sm text-[#263137] placeholder:text-[#8E97A5] transition focus:border-[#12A1C0] focus:outline-none focus:ring-4 focus:ring-[#DFF9FF]";
  const errorClassName = "mt-1.5 text-xs font-medium text-rose-600";

  return (
    <main className={`${poppins.className} relative min-h-screen overflow-hidden`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-20 top-6 h-72 w-72 rounded-full bg-[#DFF9FF] blur-3xl" />
        <div className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#F0FCFF] blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-60 w-60 rounded-full bg-[#EEF6FA] blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="profile-fade-up flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#12A1C0]">
              Candidate Workspace
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#263137]">Profile Builder</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#6B727F]">
              Build a recruiter-ready profile with the same clean style used in modern hiring platforms.
            </p>
          </div>
          <Link
            className="inline-flex items-center rounded-xl border border-[#D5D7E0] bg-white px-4 py-2 text-sm font-medium text-[#3F525B] transition hover:border-[#12A1C0] hover:text-[#0A88A4]"
            href="/profile"
          >
            Profile home
          </Link>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <section className="profile-fade-up profile-fade-delay-1 rounded-2xl border border-[#CCF6FF] bg-gradient-to-b from-[#F8FEFF] to-white p-5 shadow-[0_8px_24px_rgba(18,161,192,0.14)] sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#0A88A4]">Profile Strength</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="text-4xl font-semibold leading-none text-[#0A88A4]">{completionPercent}%</p>
                <p className="text-right text-xs text-[#6B727F]">
                  {completedCount} of {completionKeys.length} sections completed
                </p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#DFF9FF]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#3EC0DD] to-[#0A88A4] transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-[#6B727F]">Last updated: {updatedAtLabel}</p>
            </section>

            <section className="profile-fade-up profile-fade-delay-2 rounded-2xl border border-[#D5D7E0] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.06)] sm:p-6">
              <h2 className="text-sm font-semibold text-[#263137]">Profile Checklist</h2>
              <ul className="mt-3 space-y-2.5">
                {completionItems.map((item, index) => (
                  <li className="flex items-center gap-2" key={item.key}>
                    <span
                      className={`inline-flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold ${
                        item.done
                          ? "border-[#3EC0DD] bg-[#DFF9FF] text-[#0A88A4]"
                          : "border-[#D5D7E0] bg-white text-[#8E97A5]"
                      }`}
                    >
                      {item.done ? "v" : index + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        item.done ? "font-medium text-[#3F525B]" : "text-[#6B727F]"
                      }`}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
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
            <section className={`${cardClassName} profile-fade-up profile-fade-delay-1`}>
              <div>
                <h2 className="text-lg font-semibold text-[#263137]">Professional Snapshot</h2>
                <p className="mt-1 text-sm text-[#6B727F]">
                  Give recruiters a quick understanding of your role, impact, and strengths.
                </p>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className={labelClassName}>Headline</label>
                  <input
                    className={inputClassName}
                    placeholder="Example: Junior Data Analyst focused on retail insights"
                    {...form.register("headline")}
                  />
                  {form.formState.errors.headline?.message ? (
                    <p className={errorClassName}>{form.formState.errors.headline.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>Bio</label>
                  <textarea
                    className={inputClassName}
                    placeholder="Summarize your strengths, project context, and what kind of impact you deliver."
                    rows={5}
                    {...form.register("bio")}
                  />
                  {form.formState.errors.bio?.message ? (
                    <p className={errorClassName}>{form.formState.errors.bio.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>Skills</label>
                  <textarea
                    className={inputClassName}
                    placeholder="Comma separated (e.g. Python, SQL, Power BI, Client Communication)"
                    rows={3}
                    {...form.register("skills")}
                  />
                  {form.formState.errors.skills?.message ? (
                    <p className={errorClassName}>{form.formState.errors.skills.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>Years of experience</label>
                  <input
                    className={inputClassName}
                    min={0}
                    max={40}
                    placeholder="0"
                    type="number"
                    {...form.register("years_of_experience")}
                  />
                  {form.formState.errors.years_of_experience?.message ? (
                    <p className={errorClassName}>{form.formState.errors.years_of_experience.message}</p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className={`${cardClassName} profile-fade-up profile-fade-delay-2`}>
              <div>
                <h2 className="text-lg font-semibold text-[#263137]">Education</h2>
                <p className="mt-1 text-sm text-[#6B727F]">
                  Add the background that helps recommendation quality and recruiter filtering.
                </p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClassName}>Field of study</label>
                  <input
                    className={inputClassName}
                    placeholder="Computer Science"
                    {...form.register("field_of_study")}
                  />
                  {form.formState.errors.field_of_study?.message ? (
                    <p className={errorClassName}>{form.formState.errors.field_of_study.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>University</label>
                  <input
                    className={inputClassName}
                    placeholder="ENSA Casablanca"
                    {...form.register("university")}
                  />
                  {form.formState.errors.university?.message ? (
                    <p className={errorClassName}>{form.formState.errors.university.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>Study level</label>
                  <select className={inputClassName} {...form.register("study_level")}>
                    <option value="">Select level</option>
                    <option value="BAC">BAC</option>
                    <option value="LICENCE">LICENCE</option>
                    <option value="MASTER">MASTER</option>
                    <option value="DOCTORAT">DOCTORAT</option>
                  </select>
                </div>
              </div>
            </section>

            <section className={`${cardClassName} profile-fade-up profile-fade-delay-3`}>
              <div>
                <h2 className="text-lg font-semibold text-[#263137]">Contact and Links</h2>
                <p className="mt-1 text-sm text-[#6B727F]">
                  Make it easy for recruiters to reach you and verify your professional presence.
                </p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClassName}>City</label>
                  <input className={inputClassName} placeholder="Rabat" {...form.register("city")} />
                  {form.formState.errors.city?.message ? (
                    <p className={errorClassName}>{form.formState.errors.city.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>Phone</label>
                  <input
                    className={inputClassName}
                    placeholder="+212 6 00 00 00 00"
                    {...form.register("phone")}
                  />
                  {form.formState.errors.phone?.message ? (
                    <p className={errorClassName}>{form.formState.errors.phone.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>LinkedIn URL</label>
                  <input
                    className={inputClassName}
                    placeholder="https://www.linkedin.com/in/your-profile"
                    {...form.register("linkedin_url")}
                  />
                  {form.formState.errors.linkedin_url?.message ? (
                    <p className={errorClassName}>{form.formState.errors.linkedin_url.message}</p>
                  ) : null}
                </div>

                <div>
                  <label className={labelClassName}>Portfolio URL</label>
                  <input
                    className={inputClassName}
                    placeholder="https://your-portfolio.com"
                    {...form.register("portfolio_url")}
                  />
                  {form.formState.errors.portfolio_url?.message ? (
                    <p className={errorClassName}>{form.formState.errors.portfolio_url.message}</p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className={`${cardClassName} profile-fade-up profile-fade-delay-3`}>
              {profileQuery.isLoading ? <p className="text-sm text-[#6B727F]">Loading profile...</p> : null}
              {profileQuery.isError ? (
                <p className="text-sm font-medium text-rose-600">
                  Unable to load profile right now. You can still edit and save.
                </p>
              ) : null}

              <div className="mt-1 flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#12A1C0] to-[#0A88A4] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(18,161,192,0.3)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={updateMutation.isPending}
                  type="submit"
                >
                  {updateMutation.isPending ? "Saving..." : "Save profile"}
                </button>

                {updateMutation.isSuccess ? (
                  <p className="text-sm font-medium text-emerald-700">Profile saved.</p>
                ) : null}
                {updateMutation.isError ? (
                  <p className="text-sm font-medium text-rose-600">
                    Save failed. Check your entries and try again.
                  </p>
                ) : null}
              </div>
            </section>
          </form>
        </div>
      </div>
    </main>
  );
}
