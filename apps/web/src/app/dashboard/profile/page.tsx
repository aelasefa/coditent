"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { getProfile, updateProfile } from "@/lib/api";

const profileSchema = z.object({
  city: z.string().optional(),
  phone: z.string().optional(),
  field_of_study: z.string().optional(),
  university: z.string().optional(),
  study_level: z.enum(["", "BAC", "LICENCE", "MASTER", "DOCTORAT"]),
});

type ProfileValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const queryClient = useQueryClient();

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      city: "",
      phone: "",
      field_of_study: "",
      university: "",
      study_level: "",
    },
  });

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    form.reset({
      city: profileQuery.data.city ?? "",
      phone: profileQuery.data.phone ?? "",
      field_of_study: profileQuery.data.field_of_study ?? "",
      university: profileQuery.data.university ?? "",
      study_level: profileQuery.data.study_level ?? "",
    });
  }, [form, profileQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Candidate Profile</h1>
        <Link className="text-sm text-slate-600" href="/dashboard">
          Back to dashboard
        </Link>
      </header>

      {profileQuery.isLoading ? <p>Loading profile...</p> : null}

      <form
        className="space-y-4 rounded border border-slate-200 bg-white p-4"
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
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Phone</label>
            <input className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("phone")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Field of study</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              {...form.register("field_of_study")}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">University</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              {...form.register("university")}
            />
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
          </div>
        </div>

        <button
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={updateMutation.isPending}
          type="submit"
        >
          {updateMutation.isPending ? "Saving..." : "Save profile"}
        </button>

        {updateMutation.isSuccess ? <p className="text-sm text-emerald-700">Profile saved.</p> : null}
      </form>
    </main>
  );
}
