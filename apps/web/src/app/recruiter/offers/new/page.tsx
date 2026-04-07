"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { createOffer } from "@/lib/api";

const offerSchema = z.object({
  title: z.string().min(2, "Title is required"),
  company: z.string().min(2, "Company is required"),
  region: z.string().min(2, "Region is required"),
  field: z.string().min(2, "Field is required"),
  type: z.enum(["JOB", "INTERNSHIP"]),
  description: z.string().min(10, "Description is too short"),
  requirements: z.string().min(10, "Requirements are too short"),
});

type OfferValues = z.infer<typeof offerSchema>;

export default function NewOfferPage() {
  const router = useRouter();

  const form = useForm<OfferValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      title: "",
      company: "",
      region: "",
      field: "",
      type: "JOB",
      description: "",
      requirements: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: createOffer,
    onSuccess: () => {
      router.push("/recruiter");
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Create Offer</h1>
        <Link className="text-sm text-slate-600" href="/recruiter">
          Back to recruiter
        </Link>
      </header>

      <form
        className="space-y-4 rounded border border-slate-200 bg-white p-4"
        onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="rounded border border-slate-300 px-3 py-2" placeholder="Title" {...form.register("title")} />
          <input
            className="rounded border border-slate-300 px-3 py-2"
            placeholder="Company"
            {...form.register("company")}
          />
          <input className="rounded border border-slate-300 px-3 py-2" placeholder="Region" {...form.register("region")} />
          <input className="rounded border border-slate-300 px-3 py-2" placeholder="Field" {...form.register("field")} />
          <select className="rounded border border-slate-300 px-3 py-2" {...form.register("type")}>
            <option value="JOB">JOB</option>
            <option value="INTERNSHIP">INTERNSHIP</option>
          </select>
        </div>

        <textarea
          className="min-h-24 w-full rounded border border-slate-300 px-3 py-2"
          placeholder="Description"
          {...form.register("description")}
        />

        <textarea
          className="min-h-24 w-full rounded border border-slate-300 px-3 py-2"
          placeholder="Requirements"
          {...form.register("requirements")}
        />

        {createMutation.isError ? (
          <p className="text-sm text-red-600">Offer creation failed.</p>
        ) : null}

        <button
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={createMutation.isPending}
          type="submit"
        >
          {createMutation.isPending ? "Saving..." : "Create Offer"}
        </button>
      </form>
    </main>
  );
}
